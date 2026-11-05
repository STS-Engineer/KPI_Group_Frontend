import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  AlertIcon,
  ArrowLeftIcon,
  BotIcon,
  CheckIcon,
  CloseIcon,
  CollapseIcon,
  CopyIcon,
  ExpandIcon,
  HistoryIcon,
  LoginIcon,
  MessagePlusIcon,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
  TrashIcon,
} from "../icons.jsx";
import AssistantMarkdown from "./AssistantMarkdown.jsx";
import { stripFollowUps, toPlainText } from "./assistantMarkdown.js";
import { getGreeting, getQuickPrompts } from "./assistantTopics.js";
import useAssistantChat from "./useAssistantChat.js";

// The AI Assistant of every page, for signed-in users only: a round button at
// the bottom right (AVO blue, GROUP orange "AI" badge) opening a chat panel. It
// answers from the user's live KPI data (backend: services/appAssistant.service.js),
// within their scope.

const EXPANDED_STORAGE_KEY = "kpi-assistant:expanded";

const currentPage = () => ({ path: window.location.pathname, hash: window.location.hash });

const isPhone = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches;

const readExpanded = () => {
  try {
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const formatWhen = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
};

const headerButtonClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

const pillClass =
  "w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm shadow-slate-900/[0.03] transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:shadow-none dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-200 dark:focus-visible:ring-blue-500/20";

function Spinner({ className = "" }) {
  return <span className={`inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden="true" />;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2" aria-label="The assistant is thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 dark:bg-blue-300"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

// One chip per kind of lookup (the model may run the same tool several times at once).
const groupTools = (tools) => {
  const groups = [];
  for (const tool of tools || []) {
    const label = tool.label || "Reading data";
    const group = groups.find((entry) => entry.label === label);
    if (!group) groups.push({ id: tool.id, label, status: tool.status });
    else if (tool.status === "running" || (tool.status === "error" && group.status !== "running")) group.status = tool.status;
  }
  return groups;
};

function ToolChips({ tools }) {
  const groups = groupTools(tools);
  if (!groups.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {groups.map((tool) => (
        <span
          key={tool.id}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            tool.status === "error"
              ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
              : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
          }`}
        >
          {tool.status === "running" ? <Spinner /> : tool.status === "error" ? <AlertIcon size={12} /> : <CheckIcon size={12} />}
          {tool.label || "Reading data"}
          {tool.status === "running" ? "…" : ""}
        </span>
      ))}
    </div>
  );
}

function AssistantMessage({ message, isLast, sending, onSuggestion, onRetry, onNavigate }) {
  const [copied, setCopied] = useState(false);
  const streaming = message.status === "streaming";
  const text = stripFollowUps(message.content, { partial: streaming || message.status === "stopped" });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(message.content));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white" aria-hidden="true">
        <BotIcon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <ToolChips tools={message.tools} />
        {text ? <AssistantMarkdown text={text} onNavigate={onNavigate} /> : streaming ? <TypingDots /> : null}

        {message.status === "error" ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <AlertIcon size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">{message.error || "The assistant could not answer."}</span>
            {isLast && !sending && message.code !== "RATE_LIMITED" ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-500/20"
              >
                <RefreshIcon size={13} /> Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!streaming && message.status !== "error" && text ? (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />} {copied ? "Copied" : "Copy"}
            </button>
            {message.status === "stopped" ? <span className="font-semibold">Stopped</span> : null}
          </div>
        ) : null}

        {isLast && !sending && message.status === "done" && message.suggestions?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion(suggestion)}
                className="rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-left text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Welcome({ user, signedIn, onAsk }) {
  const location = useLocation();
  const { pagePrompts, dataPrompts, topics } = getQuickPrompts({
    user,
    path: location.pathname,
    hash: window.location.hash || location.hash,
  });
  const suggested = [...pagePrompts, ...dataPrompts];

  return (
    <div className="px-4 pb-4 pt-5">
      <div className="text-center">
        <span className="mx-auto flex h-10 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <BotIcon size={22} />
        </span>
        <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-white">How can I help?</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{getGreeting(user)}</p>
      </div>

      {!signedIn ? (
        <Link
          to="/login"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm transition hover:bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
        >
          <LoginIcon size={18} className="shrink-0 text-blue-600 dark:text-blue-300" />
          <span className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">
            <span className="font-bold text-blue-700 dark:text-blue-200">Sign in</span> to ask about your own KPIs, trends and actions.
          </span>
        </Link>
      ) : null}

      {suggested.length ? (
        <section className="mt-5">
          <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Suggested</h3>
          <div className="mt-2 space-y-2">
            {suggested.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onAsk(prompt)} className={`${pillClass} flex items-center gap-2.5`}>
                <SparklesIcon size={15} className="shrink-0 text-orange-500" />
                <span className="min-w-0">{prompt}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Explore the boards</h3>
        <div className="mt-2 space-y-2">
          {topics.map((topic) => (
            <button key={topic.label} type="button" onClick={() => onAsk(topic.question)} className={pillClass}>
              {topic.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HistoryView({ chat, onBack }) {
  const { conversations, loadConversations, openConversation, deleteConversation, conversationId } = chat;

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <div className="px-3 pb-4 pt-3">
      <div className="flex items-center gap-2 px-1 pb-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
        >
          <ArrowLeftIcon size={15} /> Back
        </button>
        <h2 className="ml-auto text-sm font-bold text-slate-900 dark:text-white">Your conversations</h2>
      </div>

      {conversations.status === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Spinner /> Loading…
        </div>
      ) : null}
      {conversations.error ? (
        <p className="mx-1 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{conversations.error}</p>
      ) : null}
      {conversations.status === "ready" && !conversations.items.length ? (
        <p className="px-2 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No saved conversations yet.</p>
      ) : null}

      <ul className="space-y-1.5">
        {conversations.items.map((item) => (
          <li key={item.conversation_id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={async () => {
                if (await openConversation(item.conversation_id)) onBack();
              }}
              className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                item.conversation_id === conversationId ? "bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:ring-blue-500/30" : ""
              }`}
            >
              <span className="block truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{item.title || "Conversation"}</span>
              <span className="block text-[11px] text-slate-400 dark:text-slate-500">{formatWhen(item.updated_at)}</span>
            </button>
            <button
              type="button"
              onClick={() => deleteConversation(item.conversation_id)}
              aria-label={`Delete the conversation ${item.title}`}
              title="Delete"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            >
              <TrashIcon size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Composer({ sending, signedIn, onSend, onStop, inputRef }) {
  const [value, setValue] = useState("");

  // Grows with the text, up to a few lines.
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
  }, [value, inputRef]);

  const submit = (event) => {
    event.preventDefault();
    if (!value.trim() || sending) return;
    onSend(value);
    setValue("");
  };

  return (
    <form onSubmit={submit} className="border-t border-slate-100 bg-white px-3 pb-2.5 pt-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-slate-50 py-1.5 pl-4 pr-1.5 transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-blue-500/60 dark:focus-within:bg-slate-800 dark:focus-within:ring-blue-500/15">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          maxLength={4000}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
          }}
          placeholder={signedIn ? "Ask about your KPIs, boards…" : "Ask about the boards, KPIs…"}
          aria-label="Your question"
          className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {sending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop the answer"
            title="Stop"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
          >
            <StopIcon size={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="Send"
            title="Send (Enter)"
            className="btn-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <SendIcon size={16} />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[10.5px] text-slate-400 dark:text-slate-500">
        AI answers can be wrong — check key figures on the boards.
      </p>
    </form>
  );
}

function AssistantPanel({ user, chat, expanded, onToggleExpanded, onClose }) {
  const [view, setView] = useState("chat"); // chat | history
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef(null);
  const { signedIn, messages, sending, restoring } = chat;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Follows the answer as it streams, unless the user scrolled up to read.
  useEffect(() => {
    const container = scrollRef.current;
    if (container && view === "chat" && messages.length && stickToBottomRef.current) container.scrollTop = container.scrollHeight;
  }, [messages, view]);

  const ask = useCallback(
    (text) => {
      stickToBottomRef.current = true;
      setView("chat");
      chat.send(text, currentPage());
    },
    [chat]
  );

  const onNavigate = useCallback(() => {
    if (isPhone()) onClose();
  }, [onClose]);

  const lastIndex = messages.length - 1;

  return (
    <div
      role="dialog"
      aria-label="AI Assistant"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className={`fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white shadow-2xl shadow-slate-900/25 animate-kpi-dialog print:hidden sm:inset-auto sm:bottom-6 sm:right-6 sm:rounded-[28px] sm:ring-1 sm:ring-slate-900/10 dark:bg-slate-900 dark:shadow-black/50 dark:sm:ring-white/10 ${
        expanded
          ? "sm:h-[calc(100dvh-3rem)] sm:w-[min(760px,calc(100vw-3rem))]"
          : "sm:h-[min(700px,calc(100dvh-3rem))] sm:w-[min(420px,calc(100vw-3rem))]"
      }`}
    >
      <header className="relative flex shrink-0 items-center gap-3 bg-gradient-to-br from-blue-600 to-blue-900 py-3.5 pl-4 pr-3 text-white">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25" aria-hidden="true">
          <SparklesIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">AI Assistant</p>
          <p className="truncate text-xs text-blue-100">{signedIn ? "Your live KPIs & boards" : "Ask about boards & KPIs"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {signedIn ? (
            <button
              type="button"
              onClick={() => setView(view === "history" ? "chat" : "history")}
              aria-label="Your conversations"
              title="Your conversations"
              aria-pressed={view === "history"}
              className={`${headerButtonClass} ${view === "history" ? "bg-white/20 text-white" : ""}`}
            >
              <HistoryIcon size={18} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              chat.newChat();
              setView("chat");
              inputRef.current?.focus();
            }}
            aria-label="New conversation"
            title="New conversation"
            className={headerButtonClass}
          >
            <MessagePlusIcon size={18} />
          </button>
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-label={expanded ? "Smaller panel" : "Larger panel"}
            title={expanded ? "Smaller panel" : "Larger panel"}
            className={`${headerButtonClass} hidden sm:flex`}
          >
            {expanded ? <CollapseIcon size={17} /> : <ExpandIcon size={17} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the AI Assistant"
            title="Close (Esc)"
            className={`${headerButtonClass} ml-1 bg-white/15`}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-orange-500" aria-hidden="true" />
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          stickToBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 dark:bg-slate-950/40"
      >
        {view === "history" ? (
          <HistoryView chat={chat} onBack={() => setView("chat")} />
        ) : restoring ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
            <Spinner /> Loading the conversation…
          </div>
        ) : messages.length === 0 ? (
          <Welcome user={user} signedIn={signedIn} onAsk={ask} />
        ) : (
          <div role="log" aria-live="polite" aria-busy={sending} className={`mx-auto space-y-5 px-4 py-5 ${expanded ? "max-w-3xl" : ""}`}>
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-sm leading-6 text-white shadow-sm shadow-blue-600/20">
                    {message.content}
                  </p>
                </div>
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  isLast={index === lastIndex}
                  sending={sending}
                  onSuggestion={ask}
                  onRetry={() => chat.retry(currentPage())}
                  onNavigate={onNavigate}
                />
              )
            )}
          </div>
        )}
      </div>

      <Composer sending={sending} signedIn={signedIn} onSend={ask} onStop={chat.stop} inputRef={inputRef} />
    </div>
  );
}

function AssistantWidgetForAccount({ user }) {
  const chat = useAssistantChat(user);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(readExpanded);
  const launcherRef = useRef(null);
  const { restoreLastConversation } = chat;

  useEffect(() => {
    if (open) restoreLastConversation();
  }, [open, restoreLastConversation]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  const toggleExpanded = () => {
    setExpanded((current) => {
      try {
        window.localStorage.setItem(EXPANDED_STORAGE_KEY, current ? "0" : "1");
      } catch {
        // Not remembered: fine.
      }
      return !current;
    });
  };

  if (open) {
    return <AssistantPanel user={user} chat={chat} expanded={expanded} onToggleExpanded={toggleExpanded} onClose={close} />;
  }

  return (
    <button
      ref={launcherRef}
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open the AI Assistant"
      className="group fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-900/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 print:hidden sm:bottom-6 sm:right-6 dark:shadow-black/40 dark:focus-visible:ring-blue-500/40"
    >
      <BotIcon size={26} />
      <span className="absolute -right-1 -top-1 rounded-full bg-orange-500 px-1.5 py-[3px] text-[10px] font-black leading-none tracking-wide text-white ring-2 ring-white dark:ring-slate-950">
        AI
      </span>
      {chat.sending ? (
        <span className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-blue-600 ring-2 ring-white dark:bg-slate-900 dark:ring-slate-950">
          <Spinner className="h-2.5 w-2.5" />
        </span>
      ) : null}
      <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 sm:block dark:bg-slate-700">
        Ask the AI Assistant
      </span>
    </button>
  );
}

export default function AssistantWidget() {
  const { user } = useAuth();
  // Signed-in users only: hidden on the sign-in pages, on the public pages
  // without a session, and while a password change is still required.
  if (!user || user.must_change_password) return null;
  // A new account (sign-in, sign-out) starts a fresh chat state.
  return <AssistantWidgetForAccount key={`user-${user.user_id}`} user={user} />;
}
