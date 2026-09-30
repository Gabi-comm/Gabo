import { describe, expect, it } from "vitest";
import { initialTranscript, reduce, pulledAgents, activeAgents, parseSse } from "./transcript";
import type { UiEvent } from "@/harness/events";

const run = (events: UiEvent[]) => events.reduce(reduce, reduce(initialTranscript, { type: "user_prompt", text: "hi" }));

describe("transcript reducer", () => {
  it("merges consecutive text deltas from the same speaker", () => {
    const t = run([
      { type: "text", delta: "Hel", agent: null },
      { type: "text", delta: "lo", agent: null },
      { type: "text", delta: "Ugh.", agent: "caveman" },
    ]);
    expect(t.items.map((i) => i.kind)).toEqual(["user", "text", "text"]);
    expect(t.items[1]).toMatchObject({ text: "Hello", agent: null });
    expect(t.running).toBe(true);
  });

  it("tracks tools from start to result", () => {
    const t = run([
      { type: "tool_start", id: "b", name: "Bash", summary: "Bash(ls)", agent: null },
      { type: "tool_result", id: "b", ok: false, preview: "boom", lines: 1 },
    ]);
    expect(t.items[1]).toMatchObject({ kind: "tool", status: "error", preview: "boom" });
  });

  it("knows which agents were pulled and which are working now", () => {
    const t = run([
      { type: "agent_start", agent: "believer", toolUseId: "1", description: "case" },
      { type: "agent_stop", agent: "believer", toolUseId: "1", ok: true },
      { type: "agent_start", agent: "skeptic", toolUseId: "2", description: "kill" },
      { type: "agent_progress", agent: "skeptic", summary: "reading case" },
    ]);
    expect(pulledAgents(t)).toEqual(["believer", "skeptic"]);
    expect(activeAgents(t)).toEqual(["skeptic"]);
    expect(t.items.find((i) => i.kind === "agent" && i.agent === "skeptic")).toMatchObject({ progress: "reading case" });
  });

  it("records permission answers and ends the run on done", () => {
    let t = run([{ type: "permission_request", requestId: "r1", tool: "Write", summary: "Write(a)" }]);
    expect(t.pendingPermission).toBe("r1");
    t = reduce(t, { type: "permission_resolved", requestId: "r1", decision: "deny" });
    expect(t.pendingPermission).toBeNull();
    expect(t.items.at(-1)).toMatchObject({ kind: "permission", decision: "deny" });
    t = reduce(t, { type: "done" });
    expect(t.running).toBe(false);
    expect(activeAgents(t)).toEqual([]);
  });

  it("marks unfinished tools and agents as stopped when the run ends early", () => {
    const t = run([
      { type: "tool_start", id: "b", name: "Bash", summary: "Bash(sleep)", agent: null },
      { type: "agent_start", agent: "coder", toolUseId: "9", description: "x" },
      { type: "done" },
    ]);
    expect(t.items[1]).toMatchObject({ status: "stopped" });
    expect(t.items[2]).toMatchObject({ status: "stopped" });
  });

  it("keeps the session id and totals for the status line", () => {
    const t = run([
      { type: "session", sessionId: "s", model: "claude-opus", cwd: "C:/w" },
      { type: "result", ok: true, costUsd: 0.5, inputTokens: 10, outputTokens: 4, durationMs: 1 },
    ]);
    expect(t.model).toBe("claude-opus");
    expect(t.cwd).toBe("C:/w");
    expect(t.tokens).toBe(14);
  });
});

describe("parseSse", () => {
  it("splits complete frames and keeps the partial tail", () => {
    const { events, rest } = parseSse('data: {"type":"done"}\n\ndata: {"type":"te');
    expect(events).toEqual([{ type: "done" }]);
    expect(rest).toBe('data: {"type":"te');
  });
  it("skips malformed frames", () => {
    expect(parseSse("data: nope\n\n").events).toEqual([]);
  });
});
