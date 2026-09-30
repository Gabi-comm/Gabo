import { describe, expect, it } from "vitest";
import path from "node:path";
import { historyToItems, sessionTitle } from "./history";
import { buildOptions } from "./runner";
import { loadSpec } from "./spec";

const msg = (type: "user" | "assistant", content: unknown, parent: string | null = null) =>
  ({ type, uuid: Math.random().toString(36), session_id: "s", parent_tool_use_id: parent, parent_agent_id: null, message: { role: type, content } });

describe("historyToItems", () => {
  it("turns a CLI session into the app transcript", () => {
    const items = historyToItems([
      msg("user", "Fix the login bug"),
      msg("assistant", [
        { type: "text", text: "Looking at auth." },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "src/auth.ts" } },
      ]),
      msg("user", [{ type: "tool_result", tool_use_id: "t1", content: "export function login() {}\nline2", is_error: false }]),
      msg("assistant", [{ type: "tool_use", id: "a1", name: "Agent", input: { subagent_type: "tester", description: "try it" } }]),
      msg("assistant", [{ type: "text", text: "inside the subagent" }], "a1"),
      msg("user", [{ type: "tool_result", tool_use_id: "a1", content: "PASS" }]),
      msg("assistant", [{ type: "text", text: "Fixed." }]),
    ] as never);
    expect(items).toEqual([
      { kind: "user", text: "Fix the login bug" },
      { kind: "text", agent: null, text: "Looking at auth." },
      { kind: "tool", id: "t1", summary: "Read(src/auth.ts)", agent: null, status: "ok", preview: "export function login() {}\nline2", lines: 2 },
      { kind: "agent", agent: "tester", toolUseId: "a1", description: "try it", status: "ok" },
      { kind: "text", agent: null, text: "Fixed." },
    ]);
  });

  it("shows slash commands the way they were typed and drops system reminders and meta noise", () => {
    const items = historyToItems([
      msg("user", "<command-message>brainstorming</command-message>\n<command-name>/superpowers:brainstorming</command-name>\n<command-args>a todo app</command-args>"),
      msg("user", [{ type: "text", text: "<system-reminder>internal</system-reminder>" }]),
      msg("user", [{ type: "text", text: "<local-command-stdout>ok</local-command-stdout>" }]),
      msg("user", "real question <system-reminder>x</system-reminder>"),
    ] as never);
    expect(items).toEqual([
      { kind: "user", text: "/superpowers:brainstorming a todo app" },
      { kind: "user", text: "real question" },
    ]);
  });

  it("marks errored tool results", () => {
    const items = historyToItems([
      msg("assistant", [{ type: "tool_use", id: "b", name: "Bash", input: { command: "npm test" } }]),
      msg("user", [{ type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "1 failed" }], is_error: true }]),
    ] as never);
    expect(items[0]).toMatchObject({ kind: "tool", summary: "Bash(npm test)", status: "error", preview: "1 failed" });
  });
});

describe("sessionTitle", () => {
  it("prefers the custom title, then the summary, then the first prompt", () => {
    expect(sessionTitle({ customTitle: "gabo", summary: "s", firstPrompt: "p" })).toBe("gabo");
    expect(sessionTitle({ summary: "Refactor auth", firstPrompt: "p" })).toBe("Refactor auth");
    expect(sessionTitle({ summary: "", firstPrompt: "<command-name>/superpowers:plan</command-name>" })).toBe("/superpowers:plan");
    expect(sessionTitle({})).toBe("Untitled");
  });
});

describe("CLI-default settings", () => {
  it("loads every settings source the CLI loads (user, project, local, plugins)", () => {
    const opts = buildOptions({ room: "home", workspace: path.resolve("/w"), spec: loadSpec(path.resolve(__dirname, "../..")) });
    expect(opts.settingSources).toBeUndefined();
  });
});
