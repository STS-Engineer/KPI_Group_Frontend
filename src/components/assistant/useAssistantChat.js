import { useCallback, useEffect, useRef, useState } from "react";
import apiClient, { getApiErrorMessage } from "../../api/client";
import { streamAssistantChat } from "./assistantStream.js";

// State of the AI Assistant chat for one visitor: the messages, the question
// being answered (streamed), and the saved conversations of a signed-in user.
// The widget is keyed by account, so signing in or out starts a fresh state.
//
// Signed in: the server keeps the conversation; its id is remembered in
// localStorage so the chat comes back after a reload. Without a session the
// browser keeps the messages for the tab (sessionStorage) and sends the recent
// ones with each question.

const GUEST_STORAGE_KEY = "kpi-assistant:guest-chat";
const conversationStorageKey = (userId) => `kpi-assistant:conversation:${userId}`;
const GUEST_MESSAGES_KEPT = 30;
const HISTORY_SENT = 12;

const readStorage = (storageName, key) => {
  try {
    return window[storageName].getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (storageName, key, value) => {
  try {
    if (value === null || value === undefined) window[storageName].removeItem(key);
    else window[storageName].setItem(key, value);
  } catch {
    // Storage unavailable (private mode...): the chat still works for this page.
  }
};

let messageCounter = 0;
const newMessageId = () => `m${Date.now().toString(36)}-${(messageCounter += 1)}`;

const fromServerMessages = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter((entry) => (entry?.role === "user" || entry?.role === "assistant") && entry.content)
    .map((entry) => ({
      id: newMessageId(),
      role: entry.role,
      content: entry.content,
      status: entry.stopped ? "stopped" : "done",
      tools: (entry.tools || []).map((name) => ({ id: name, name, status: "done" })),
      suggestions: entry.suggestions || [],
    }));

const readGuestMessages = () => {
  try {
    const parsed = JSON.parse(readStorage("sessionStorage", GUEST_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.id && entry.role && entry.status !== "streaming") : [];
  } catch {
    return [];
  }
};

const readStoredConversationId = (userId) => {
  const stored = Number(readStorage("localStorage", conversationStorageKey(userId)));
  return Number.isInteger(stored) && stored > 0 ? stored : null;
};

export default function useAssistantChat(user) {
  const signedIn = Boolean(user) && !user.must_change_password;
  const userId = signedIn ? user.user_id : null;

  const [messages, setMessages] = useState(() => (signedIn ? [] : readGuestMessages()));
  const [conversationId, setConversationIdState] = useState(() => (signedIn ? readStoredConversationId(userId) : null));
  const [sending, setSending] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [conversations, setConversations] = useState({ status: "idle", items: [], error: "" });

  const controllerRef = useRef(null);
  const messagesRef = useRef(messages);
  const conversationIdRef = useRef(conversationId);
  const restoredRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Stop a running answer when the widget goes away (sign-out, navigation away).
  useEffect(() => () => controllerRef.current?.abort(), []);

  // A visitor's chat lasts as long as the tab.
  useEffect(() => {
    if (signedIn) return;
    const finished = messages.filter((entry) => entry.status !== "streaming").slice(-GUEST_MESSAGES_KEPT);
    writeStorage("sessionStorage", GUEST_STORAGE_KEY, finished.length ? JSON.stringify(finished) : null);
  }, [messages, signedIn]);

  const setConversationId = useCallback(
    (nextId) => {
      conversationIdRef.current = nextId;
      setConversationIdState(nextId);
      if (signedIn) writeStorage("localStorage", conversationStorageKey(userId), nextId ? String(nextId) : null);
    },
    [signedIn, userId]
  );

  const openConversation = useCallback(
    async (id) => {
      controllerRef.current?.abort();
      setRestoring(true);
      try {
        const res = await apiClient.get(`/api/assistant/conversations/${id}`);
        setMessages(fromServerMessages(res.data?.messages));
        setConversationId(res.data?.conversation_id || id);
        return true;
      } catch {
        // Deleted meanwhile, or the session ended: start afresh.
        setMessages([]);
        setConversationId(null);
        return false;
      } finally {
        setRestoring(false);
      }
    },
    [setConversationId]
  );

  // The first time the panel opens: bring back the last conversation.
  const restoreLastConversation = useCallback(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (signedIn && conversationIdRef.current && messagesRef.current.length === 0) {
      openConversation(conversationIdRef.current);
    }
  }, [signedIn, openConversation]);

  const updateMessage = (id, patch) =>
    setMessages((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...(typeof patch === "function" ? patch(entry) : patch) } : entry))
    );

  const send = useCallback(
    async (rawText, page) => {
      const text = String(rawText ?? "").trim();
      if (!text || controllerRef.current) return;

      const history = messagesRef.current
        .filter((entry) => entry.content && (entry.status === "done" || entry.status === "stopped" || entry.role === "user"))
        .slice(-HISTORY_SENT)
        .map(({ role, content, suggestions }) => ({ role, content, ...(suggestions?.length ? { suggestions } : {}) }));
      const assistantId = newMessageId();
      setMessages((current) => [
        ...current,
        { id: newMessageId(), role: "user", content: text, status: "done" },
        { id: assistantId, role: "assistant", content: "", status: "streaming", tools: [], suggestions: [] },
      ]);

      const controller = new AbortController();
      controllerRef.current = controller;
      setSending(true);
      try {
        await streamAssistantChat({
          baseURL: apiClient.defaults.baseURL,
          signal: controller.signal,
          body: {
            message: text,
            page,
            ...(signedIn ? { conversation_id: conversationIdRef.current } : { history }),
          },
          onEvent: (event, payload) => {
            if (event === "delta") {
              updateMessage(assistantId, (entry) => ({ content: entry.content + (payload.delta || "") }));
            } else if (event === "tool") {
              updateMessage(assistantId, (entry) => {
                const index = entry.tools.findIndex((tool) => tool.id === payload.id);
                return {
                  tools: index < 0 ? [...entry.tools, payload] : entry.tools.map((tool, position) => (position === index ? payload : tool)),
                };
              });
            } else if (event === "done") {
              updateMessage(assistantId, (entry) => ({
                content: payload.answer || entry.content,
                suggestions: payload.suggestions || [],
                status: payload.stopped ? "stopped" : "done",
              }));
              if (signedIn && payload.conversation_id) setConversationId(payload.conversation_id);
            } else if (event === "error") {
              updateMessage(assistantId, { status: "error", error: payload.error, code: payload.code });
              if (payload.code === "CONVERSATION_NOT_FOUND") setConversationId(null);
            }
          },
        });
        // The connection ended without a last word.
        updateMessage(assistantId, (entry) =>
          entry.status === "streaming"
            ? entry.content
              ? { status: "stopped" }
              : { status: "error", error: "The connection was interrupted. Please try again." }
            : {}
        );
      } catch (error) {
        if (controller.signal.aborted) {
          updateMessage(assistantId, (entry) => (entry.status === "streaming" ? { status: "stopped" } : {}));
        } else {
          updateMessage(assistantId, {
            status: "error",
            error: error.status ? error.message : "Unable to reach the server.",
            code: error.code,
          });
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setSending(false);
      }
    },
    [signedIn, setConversationId]
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  // Asks the last question again, after an error.
  const retry = useCallback(
    (page) => {
      const current = messagesRef.current;
      const lastUserIndex = current.map((entry) => entry.role).lastIndexOf("user");
      if (lastUserIndex < 0 || controllerRef.current) return;
      const question = current[lastUserIndex].content;
      const kept = current.slice(0, lastUserIndex);
      messagesRef.current = kept;
      setMessages(kept);
      send(question, page);
    },
    [send]
  );

  const newChat = useCallback(() => {
    controllerRef.current?.abort();
    setMessages([]);
    setConversationId(null);
  }, [setConversationId]);

  const loadConversations = useCallback(async () => {
    setConversations((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const res = await apiClient.get("/api/assistant/conversations");
      setConversations({ status: "ready", items: res.data?.conversations || [], error: "" });
    } catch (error) {
      setConversations({ status: "error", items: [], error: getApiErrorMessage(error, "Your conversations could not be loaded.") });
    }
  }, []);

  const deleteConversation = useCallback(
    async (id) => {
      try {
        await apiClient.delete(`/api/assistant/conversations/${id}`);
        setConversations((current) => ({ ...current, items: current.items.filter((item) => item.conversation_id !== id) }));
        if (conversationIdRef.current === id) newChat();
      } catch (error) {
        setConversations((current) => ({ ...current, error: getApiErrorMessage(error, "This conversation could not be deleted.") }));
      }
    },
    [newChat]
  );

  return {
    signedIn,
    messages,
    conversationId,
    sending,
    restoring,
    conversations,
    send,
    stop,
    retry,
    newChat,
    openConversation,
    restoreLastConversation,
    loadConversations,
    deleteConversation,
  };
}
