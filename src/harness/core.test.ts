import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { loadSpec, parseSpec } from "./spec";
import { AGENT_IDS, AGENTS } from "./agents";
import { ROOM_IDS, rosterFor } from "./rooms";
import { createMapper } from "./events";
import { PermissionBroker, guardToolInput } from "./permissions";

describe("spec", () => {
  const spec = loadSpec(path.resolve(__dirname, "../.."));

  it("parses every agent's role text verbatim", () => {
    for (const id of AGENT_IDS) expect(spec.agents[id], id).toMatch(/^\d+\. The /);
    expect(spec.agents.caveman).toContain("Says the most with the fewest words.");
    expect(spec.agents.emperor).toContain("crowns one idea");
  });

  it("extracts the idea rubric and the skill-scout rule", () => {
    expect(spec.ideaRubric.startsWith("## The Idea Rubric")).toBe(true);
    expect(spec.ideaRubric).toContain("The judge's own taste");
    expect(spec.skillScout).toContain("vercel-labs/agent-skills");
  });

  it("handles CRLF line endings", () => {
    const md = "<!-- agent:caveman -->\r\n9. The Caveman. Short.\r\n<!-- /agent -->\r\n";
    expect(parseSpec(md).agents.caveman).toBe("9. The Caveman. Short.");
  });
});

describe("rooms", () => {
  it("puts the Caveman in every room and every solo agent room", () => {
    for (const room of ROOM_IDS) expect(rosterFor(room)).toContain("caveman");
    for (const id of AGENT_IDS) expect(rosterFor(`agent:${id}`)).toEqual(id === "caveman" ? ["caveman"] : [id, "caveman"]);
  });

  it("pulls the right specialists", () => {
    expect(rosterFor("arena")).toEqual(expect.arrayContaining(["emperor", "believer", "skeptic", "investor", "judge"]));
    expect(rosterFor("library")).toEqual(expect.arrayContaining(["researcher", "tutor"]));
    expect(rosterFor("hackathon")).toEqual(expect.arrayContaining(["coder", "tester", "designer", "planner"]));
  });

  it("has metadata for all 12 agents", () => {
    expect(AGENT_IDS).toHaveLength(12);
    for (const id of AGENT_IDS) expect(AGENTS[id].name).toMatch(/^The /);
  });
});

describe("events mapper", () => {
  const partial = (text: string, parent: string | null = null) => ({
    type: "stream_event", parent_tool_use_id: parent,
    event: { type: "content_block_delta", delta: { type: "text_delta", text } },
  });

  it("streams main-thread text and reports the session", () => {
    const map = createMapper();
    expect(map({ type: "system", subtype: "init", session_id: "s1", model: "m", cwd: "/w" } as never))
      .toEqual([{ type: "session", sessionId: "s1", model: "m", cwd: "/w" }]);
    expect(map(partial("hi") as never)).toEqual([{ type: "text", delta: "hi", agent: null }]);
  });

  it("does not repeat streamed text when the full assistant message arrives", () => {
    const map = createMapper();
    map(partial("hi") as never);
    const out = map({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "hi" }] } } as never);
    expect(out).toEqual([]);
  });

  it("emits subagent text that was never streamed, tagged with the agent", () => {
    const map = createMapper();
    map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "t1", name: "Agent", input: { subagent_type: "skeptic", description: "kill it" } },
    ] } } as never);
    const out = map({ type: "assistant", parent_tool_use_id: "t1", message: { content: [{ type: "text", text: "Fatal flaw." }] } } as never);
    expect(out).toEqual([{ type: "text", delta: "Fatal flaw.", agent: "skeptic" }]);
  });

  it("turns Agent tool use into agent_start and its result into agent_stop", () => {
    const map = createMapper();
    const start = map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "t1", name: "Agent", input: { subagent_type: "judge", description: "rule" } },
    ] } } as never);
    expect(start).toEqual([{ type: "agent_start", agent: "judge", toolUseId: "t1", description: "rule" }]);
    const stop = map({ type: "user", parent_tool_use_id: null, message: { content: [
      { type: "tool_result", tool_use_id: "t1", content: "BUILD", is_error: false },
    ] } } as never);
    expect(stop).toEqual([{ type: "agent_stop", agent: "judge", toolUseId: "t1", ok: true }]);
  });

  it("summarises tools the way Claude Code does and previews results", () => {
    const map = createMapper();
    const start = map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "b1", name: "Bash", input: { command: "npm test" } },
    ] } } as never);
    expect(start).toEqual([{ type: "tool_start", id: "b1", name: "Bash", summary: "Bash(npm test)", agent: null }]);
    const long = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const [res] = map({ type: "user", parent_tool_use_id: null, message: { content: [
      { type: "tool_result", tool_use_id: "b1", content: [{ type: "text", text: long }], is_error: true },
    ] } } as never);
    expect(res).toMatchObject({ type: "tool_result", id: "b1", ok: false, lines: 10 });
    expect((res as { preview: string }).preview.split("\n")).toHaveLength(4);
  });

  it("maps a result message to cost and usage", () => {
    const map = createMapper();
    const [r] = map({ type: "result", subtype: "success", total_cost_usd: 0.02, duration_ms: 900,
      usage: { input_tokens: 10, output_tokens: 5 } } as never);
    expect(r).toEqual({ type: "result", ok: true, costUsd: 0.02, inputTokens: 10, outputTokens: 5, durationMs: 900 });
  });

  it("ignores unknown message types", () => {
    expect(createMapper()({ type: "rate_limit_event" } as never)).toEqual([]);
  });
});

describe("permission broker", () => {
  it("resolves a pending request with the user's answer", async () => {
    const broker = new PermissionBroker(1000);
    const onAsk = vi.fn();
    const p = broker.request("run1", { tool: "Write", summary: "Write(a.txt)", input: {} }, onAsk);
    const { requestId } = onAsk.mock.calls[0][0];
    expect(broker.resolve(requestId, "allow")).toBe(true);
    await expect(p).resolves.toBe("allow");
    expect(broker.resolve(requestId, "allow")).toBe(false);
  });

  it("denies on timeout", async () => {
    vi.useFakeTimers();
    const broker = new PermissionBroker(50);
    const p = broker.request("run1", { tool: "Bash", summary: "Bash(x)", input: {} }, () => {});
    vi.advanceTimersByTime(60);
    await expect(p).resolves.toBe("deny");
    vi.useRealTimers();
  });

  it("denies everything pending for a run when it is cancelled", async () => {
    const broker = new PermissionBroker(1000);
    const p = broker.request("run9", { tool: "Bash", summary: "Bash(x)", input: {} }, () => {});
    broker.cancelRun("run9");
    await expect(p).resolves.toBe("deny");
  });
});

describe("path guard", () => {
  const ws = path.resolve("/work/proj");
  it("allows paths inside the workspace", () => {
    expect(guardToolInput("Read", { file_path: path.join(ws, "src/a.ts") }, ws)).toBeNull();
    expect(guardToolInput("Write", { file_path: "notes.md" }, ws)).toBeNull();
    expect(guardToolInput("Grep", { pattern: "x" }, ws)).toBeNull();
  });
  it("blocks paths outside, including traversal and sibling prefixes", () => {
    expect(guardToolInput("Edit", { file_path: path.resolve("/etc/passwd") }, ws)).toMatch(/outside/);
    expect(guardToolInput("Write", { file_path: "../other/x" }, ws)).toMatch(/outside/);
    expect(guardToolInput("Read", { file_path: path.resolve("/work/proj-evil/x") }, ws)).toMatch(/outside/);
    expect(guardToolInput("Glob", { pattern: "*", path: path.resolve("/") }, ws)).toMatch(/outside/);
  });
  it("lets the user's skill folders be read", () => {
    const home = path.resolve("/home/u/.claude/skills/x/SKILL.md");
    expect(guardToolInput("Read", { file_path: home }, ws, [path.resolve("/home/u/.claude/skills")])).toBeNull();
  });
});
