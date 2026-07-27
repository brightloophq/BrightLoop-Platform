/**
 * Workspace Copilot presentation helpers (Phase F · Sprint F2) — pure-logic tests
 * (vitest node env, no DOM). Smart commands, streaming labels, grouping, and the
 * safe markdown renderer.
 */

import { describe, it, expect } from "vitest";
import {
  groupConversations, inlineTokens, isStreaming, parseSmartInput, renderMarkdown, streamingLabel, suggestCommands,
} from "./copilot";

describe("parseSmartInput", () => {
  it("recognizes a known slash command and splits the rest", () => {
    expect(parseSmartInput("/report last quarter")).toEqual({ command: "report", text: "last quarter", isCommandDraft: false });
    expect(parseSmartInput("/context")).toEqual({ command: "context", text: "", isCommandDraft: false });
  });
  it("treats plain text as no command", () => {
    expect(parseSmartInput("summarize the workspace")).toEqual({ command: null, text: "summarize the workspace", isCommandDraft: false });
  });
  it("marks a bare slash as a command draft and passes unknown commands through as text", () => {
    expect(parseSmartInput("/").isCommandDraft).toBe(true);
    expect(parseSmartInput("/bogus thing").command).toBe(null);
  });
});

describe("suggestCommands", () => {
  it("filters commands by the partial fragment", () => {
    expect(suggestCommands("/re").map((c) => c.command)).toEqual(["report"]);
    expect(suggestCommands("hello")).toEqual([]);
    expect(suggestCommands("/").length).toBeGreaterThan(3);
  });
});

describe("streaming state", () => {
  it("labels every state and detects in-flight ones", () => {
    expect(streamingLabel("running_capability")).toBe("Running capability…");
    expect(streamingLabel("completed")).toBe("Completed");
    expect(isStreaming("thinking")).toBe(true);
    expect(isStreaming("completed")).toBe(false);
  });
});

describe("groupConversations", () => {
  it("splits pinned from recent, drops archived, newest first", () => {
    const list = [
      { id: "a", pinned: false, updatedAt: "2026-01-01", status: "active" },
      { id: "b", pinned: true, updatedAt: "2026-02-01", status: "active" },
      { id: "c", pinned: false, updatedAt: "2026-03-01", status: "active" },
      { id: "d", pinned: false, updatedAt: "2026-04-01", status: "archived" },
    ];
    const { pinned, recent } = groupConversations(list);
    expect(pinned.map((c) => c.id)).toEqual(["b"]);
    expect(recent.map((c) => c.id)).toEqual(["c", "a"]);
  });
});

describe("renderMarkdown", () => {
  it("parses headings, bullets, ordered items, code and tables", () => {
    const md = "# Workspace\n\nHealth is **72%**.\n\n- one\n- two\n\n1. first\n\n| Metric | Value |\n| --- | --- |\n| Completion | 60% |\n\n```\ncode here\n```";
    const blocks = renderMarkdown(md);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks.some((b) => b.type === "bullet")).toBe(true);
    expect(blocks.some((b) => b.type === "ordered")).toBe(true);
    const table = blocks.find((b) => b.type === "table");
    expect(table).toMatchObject({ type: "table", header: ["Metric", "Value"], rows: [["Completion", "60%"]] });
    expect(blocks.some((b) => b.type === "code")).toBe(true);
  });
  it("tokenizes inline bold and code", () => {
    const spans = inlineTokens("Health is **72%** via `report.generate`");
    expect(spans.some((s) => s.bold && s.text === "72%")).toBe(true);
    expect(spans.some((s) => s.code && s.text === "report.generate")).toBe(true);
  });
});
