import assert from "node:assert/strict";
import test from "node:test";
import { createSseParser, streamAssistantChat } from "../src/components/assistant/assistantStream.js";
import {
  parseInline,
  parseMarkdown,
  resolveLink,
  stripFollowUps,
  toPlainText,
} from "../src/components/assistant/assistantMarkdown.js";
import { getGreeting, getQuickPrompts } from "../src/components/assistant/assistantTopics.js";

// ---------------------------------------------------------------------------
// Server-Sent Events

test("events are rebuilt whatever the chunk boundaries", () => {
  const events = [];
  const parser = createSseParser((event, payload) => events.push([event, payload]));
  const stream = 'event: tool\ndata: {"id":"c1","status":"running"}\n\n: keep-alive\n\nevent: delta\ndata: {"delta":"Hel"}\n\nevent: delta\r\ndata: {"delta":"lo"}\r\n\r\nevent: done\ndata: {"answer":"Hello"}';
  for (let index = 0; index < stream.length; index += 7) parser.push(stream.slice(index, index + 7));
  parser.end();
  assert.deepEqual(events, [
    ["tool", { id: "c1", status: "running" }],
    ["delta", { delta: "Hel" }],
    ["delta", { delta: "lo" }],
    ["done", { answer: "Hello" }],
  ]);
});

test("a refused question rejects with the server's message", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: "Too many questions", code: "RATE_LIMITED" }),
  });
  await assert.rejects(
    streamAssistantChat({ baseURL: "http://api", body: {}, onEvent: () => {}, fetchImpl }),
    { message: "Too many questions", status: 429, code: "RATE_LIMITED" }
  );
});

test("the stream is read to the end and sends the session cookie", async () => {
  const encoder = new TextEncoder();
  const chunks = ['event: delta\ndata: {"delta":"Hi"}\n\n', 'event: done\ndata: {"answer":"Hi"}\n\n'];
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => (chunks.length ? { value: encoder.encode(chunks.shift()), done: false } : { done: true }),
        }),
      },
    };
  };
  const events = [];
  await streamAssistantChat({ baseURL: "http://api", body: { message: "Hi" }, onEvent: (event) => events.push(event), fetchImpl });
  assert.equal(request.url, "http://api/api/assistant/chat");
  assert.equal(request.options.credentials, "include");
  assert.deepEqual(JSON.parse(request.options.body), { message: "Hi" });
  assert.deepEqual(events, ["delta", "done"]);
});

// ---------------------------------------------------------------------------
// Markdown

test("blocks: headings, lists (loose and nested), tables, quotes, code", () => {
  const blocks = parseMarkdown(
    [
      "### Summary",
      "Two KPIs are **off target**.",
      "Second line.",
      "",
      "1. Scrap rate",
      "   - 3.2 % vs 2.5 %",
      "",
      "2. OTD",
      "- a bullet list after",
      "",
      "| KPI | Value |",
      "|---|---:|",
      "| Scrap | 3.2 |",
      "| OTD |",
      "",
      "> Check the press line.",
      "```",
      "x = 1",
      "```",
      "---",
    ].join("\n")
  );
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading", "paragraph", "list", "list", "table", "quote", "code", "rule"]
  );
  assert.equal(blocks[0].level, 3);
  assert.equal(blocks[1].text, "Two KPIs are **off target**.\nSecond line.");
  assert.deepEqual(blocks[2].items, [
    { text: "Scrap rate", children: ["3.2 % vs 2.5 %"] },
    { text: "OTD", children: [] },
  ]);
  assert.equal(blocks[2].ordered, true);
  assert.equal(blocks[3].ordered, false);
  assert.deepEqual(blocks[4].align, ["left", "right"]);
  assert.deepEqual(blocks[4].rows, [["Scrap", "3.2"], ["OTD", ""]]);
  assert.equal(blocks[6].text, "x = 1");
});

test("an ordered list keeps its first number", () => {
  assert.equal(parseMarkdown("3. third\n4. fourth")[0].start, 3);
  assert.equal(parseMarkdown("1. first")[0].start, undefined);
});

test("inline: bold, italic, code and links, not snake_case", () => {
  assert.deepEqual(parseInline("**3.2 %** on `SCR`, see [My KPI Analytics](/responsible/10/dashboard#my-kpis) *now*"), [
    { type: "strong", children: [{ type: "text", text: "3.2 %" }] },
    { type: "text", text: " on " },
    { type: "code", text: "SCR" },
    { type: "text", text: ", see " },
    { type: "link", href: "/responsible/10/dashboard#my-kpis", children: [{ type: "text", text: "My KPI Analytics" }] },
    { type: "text", text: " " },
    { type: "em", children: [{ type: "text", text: "now" }] },
  ]);
  assert.deepEqual(parseInline("kpi_target_allocation and 2 * 3 * 4"), [
    { type: "text", text: "kpi_target_allocation and 2 * 3 * 4" },
  ]);
});

test("links: app pages in place, web pages in a new tab, nothing else", () => {
  assert.deepEqual(resolveLink("/kpi-intake"), { kind: "internal", to: "/kpi-intake" });
  assert.deepEqual(resolveLink("https://avocarbon.com"), { kind: "external", href: "https://avocarbon.com" });
  assert.equal(resolveLink("javascript:alert(1)"), null);
  assert.equal(resolveLink("//evil.example"), null);
  assert.equal(resolveLink("data:text/html,x"), null);
});

test("the follow-up line never shows, even half-streamed", () => {
  assert.equal(stripFollowUps("Answer.\nFOLLOW_UPS: a | b"), "Answer.");
  assert.equal(stripFollowUps("Answer.\n**FOLLOW_UPS:** a"), "Answer.");
  assert.equal(stripFollowUps("Answer.\nFOLLO", { partial: true }), "Answer.");
  assert.equal(stripFollowUps("Answer.\nFOLLO"), "Answer.\nFOLLO", "a finished answer keeps its last line");
  assert.equal(stripFollowUps("Answer.\nFor example", { partial: true }), "Answer.\nFor example");
  assert.equal(toPlainText("**Scrap** is [high](/x).\nFOLLOW_UPS: a"), "Scrap is high.");
});

// ---------------------------------------------------------------------------
// Suggestions

test("suggestions follow the page and the account", () => {
  const anonymous = getQuickPrompts({ path: "/form" });
  assert.deepEqual(anonymous.dataPrompts, []);
  assert.equal(anonymous.pagePrompts[0], "How do I fill this form?");
  assert.ok(anonymous.topics.length >= 6);

  const user = { role: "user", people_id: 10, full_name: "Valerie BOUDOUX" };
  assert.deepEqual(getQuickPrompts({ user, path: "/responsible/10/dashboard", hash: "#my-kpis" }).pagePrompts, [
    "Which of my KPIs are getting worse?",
    "Compare my KPIs with their targets over the last 6 months",
  ]);
  assert.equal(getQuickPrompts({ user, path: "/responsible/10/dashboard/" }).pagePrompts[0], "Summarize my KPI performance this month");
  assert.equal(getQuickPrompts({ user }).dataPrompts.length, 3);

  const manager = getQuickPrompts({ user: { role: "plant_manager", people_id: 20 } });
  assert.equal(manager.dataPrompts.length, 4);
  assert.ok(manager.dataPrompts.includes("Who has not entered KPI values in the last 2 weeks?"));
  const adminWithoutPerson = getQuickPrompts({ user: { role: "admin", people_id: null } });
  assert.ok(!adminWithoutPerson.dataPrompts.some((prompt) => prompt.includes("my KPIs are off")));
  assert.deepEqual(getQuickPrompts({ user: { ...user, must_change_password: true } }).dataPrompts, []);
});

test("the greeting names the user and their scope", () => {
  assert.match(getGreeting({ full_name: "Florence PARADIS", role: "plant_manager" }), /^Hi Florence! .*those of your plant/);
  assert.match(getGreeting(null), /Sign in to ask about your own figures/);
});
