// Client of POST /api/assistant/chat, which answers with Server-Sent Events:
// `tool` (a data lookup starts / ends), `delta` (text), then `done` or `error`.
// fetch, not axios: axios cannot read a response while it streams in the browser.

// Splits the stream into events, whatever the chunk boundaries.
export function createSseParser(onEvent) {
  let buffer = "";

  const flushBlock = (block) => {
    let event = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue; // ": keep-alive" comments
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (!data.length) return;
    let payload;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    onEvent(event, payload);
  };

  return {
    push(chunk) {
      buffer += String(chunk).replace(/\r\n?/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        flushBlock(block);
        end = buffer.indexOf("\n\n");
      }
    },
    // The last event, when the stream ends without a blank line.
    end() {
      if (buffer.trim()) flushBlock(buffer);
      buffer = "";
    },
  };
}

export async function streamAssistantChat({ baseURL, body, signal, onEvent, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(`${baseURL}/api/assistant/chat`, {
    method: "POST",
    // Sends the session cookie: signed-in users get their own KPI data.
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let message = "The assistant could not answer. Please try again.";
    let code;
    try {
      const data = await response.json();
      message = data?.error || message;
      code = data?.code;
    } catch {
      // Not JSON: keep the generic message.
    }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
  }

  const parser = createSseParser(onEvent);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
}
