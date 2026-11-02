// The Markdown the assistant writes (headings, paragraphs, lists, tables,
// quotes, code, **bold**, *italic*, `code`, [links](/path)), parsed into plain
// objects that AssistantMarkdown.jsx renders as React elements -- never as
// HTML, so nothing the model writes can inject markup.

const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FENCE = /^\s*```/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>/;

const isOrdered = (marker) => /\d/.test(marker);

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const startsTable = (lines, index) =>
  lines[index].includes("|") && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1]);

const startsBlock = (lines, index) => {
  const line = lines[index];
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || startsTable(lines, index);
};

export function parseMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const code = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence (or end of a text still streaming)
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "") });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (startsTable(lines, index)) {
      const header = splitRow(line);
      const align = splitRow(lines[index + 1]).map((cell) =>
        cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left"
      );
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const cells = splitRow(lines[index]);
        rows.push(header.map((_cell, cellIndex) => cells[cellIndex] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const quote = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    const firstItem = LIST_ITEM.exec(line);
    if (firstItem) {
      const ordered = isOrdered(firstItem[2]);
      const items = [];
      while (index < lines.length) {
        const current = lines[index];
        const item = LIST_ITEM.exec(current);
        if (item && item[1].length >= 2 && items.length) {
          // Indented item: a sub-point of the previous one.
          items[items.length - 1].children.push(item[3]);
          index += 1;
        } else if (item && isOrdered(item[2]) === ordered) {
          items.push({ text: item[3], children: [] });
          index += 1;
        } else if (!current.trim()) {
          // A blank line inside a "loose" list: the list goes on if the next
          // line is an item of the same kind.
          const next = LIST_ITEM.exec(lines[index + 1] || "");
          if (next && (isOrdered(next[2]) === ordered || next[1].length >= 2)) index += 1;
          else break;
        } else if (/^\s{2,}\S/.test(current) && items.length) {
          items[items.length - 1].text += ` ${current.trim()}`;
          index += 1;
        } else {
          break;
        }
      }
      const start = ordered ? Number.parseInt(firstItem[2], 10) : undefined;
      blocks.push({ type: "list", ordered, start: start && start !== 1 ? start : undefined, items });
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && (paragraph.length === 0 || !startsBlock(lines, index))) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

// `code`, **bold** / __bold__, [text](href), *italic* / _italic_ (not inside words).
const INLINE = /(`[^`\n]+`)|(\*\*(?=\S)[^\n]*?\S\*\*|__(?=\S)[^\n]*?\S__)|(\[[^\]\n]+\]\([^)\s]+\))|(\*(?=[^\s*])[^*\n]*?[^\s*]\*|\*[^\s*]\*|(?<![\p{L}\p{N}_])_(?=\S)[^_\n]*?\S_(?![\p{L}\p{N}_]))/gu;

export function parseInline(text) {
  const source = String(text ?? "");
  const nodes = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ type: "text", text: source.slice(last, match.index) });
    const [token, code, strong, link, em] = match;
    if (code) nodes.push({ type: "code", text: code.slice(1, -1) });
    else if (strong) nodes.push({ type: "strong", children: parseInline(strong.slice(2, -2)) });
    else if (link) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(link);
      nodes.push({ type: "link", href: linkMatch[2], children: parseInline(linkMatch[1]) });
    } else if (em) nodes.push({ type: "em", children: parseInline(em.slice(1, -1)) });
    else nodes.push({ type: "text", text: token });
    last = match.index + token.length;
  }
  if (last < source.length) nodes.push({ type: "text", text: source.slice(last) });
  return nodes;
}

// Where a link may go: a page of the app (opened in place) or a web address
// (new tab). Anything else (javascript:, data:, //host...) stays plain text.
export function resolveLink(href) {
  const value = String(href ?? "").trim();
  if (value.startsWith("/") && !value.startsWith("//")) return { kind: "internal", to: value };
  if (/^https?:\/\/[^\s]+$/i.test(value)) return { kind: "external", href: value };
  return null;
}

// The model ends its answer with "FOLLOW_UPS: a | b | c"; the server removes
// it from the final answer. While the text streams (`partial`), hide that line
// -- and the start of it, before the whole marker has arrived.
const FOLLOW_UPS_MARKERS = ["FOLLOW_UPS:", "FOLLOW UPS:"];

export function stripFollowUps(text, { partial = false } = {}) {
  let value = String(text ?? "").replace(/(^|\n)[ \t]*\**FOLLOW[_ ]UPS\**\s*:[\s\S]*$/i, "");
  if (partial) {
    const lineStart = value.lastIndexOf("\n") + 1;
    const lastLine = value.slice(lineStart).replace(/^[ \t*]+/, "").toUpperCase();
    if (lastLine && FOLLOW_UPS_MARKERS.some((marker) => marker.startsWith(lastLine))) {
      value = value.slice(0, lineStart);
    }
  }
  return value.trimEnd();
}

// Plain text of an answer, for "Copy".
export function toPlainText(text) {
  return stripFollowUps(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
