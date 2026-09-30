import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { buildOptions, makeCanUseTool, fakeRun } from "./runner";
import { PermissionBroker } from "./permissions";
import { loadSpec } from "./spec";
import type { UiEvent } from "./events";

const spec = loadSpec(path.resolve(__dirname, "../.."));
const ws = path.resolve("/work/proj");

describe("buildOptions", () => {
  it("registers exactly the room roster as subagents with verbatim spec prompts", () => {
    const opts = buildOptions({ room: "arena", workspace: ws, spec });
    expect(Object.keys(opts.agents!).sort()).toEqual(["believer", "caveman", "emperor", "investor", "judge", "skeptic"]);
    expect(opts.agents!.skeptic.prompt).toContain(spec.agents.skeptic);
    expect(opts.agents!.emperor.prompt).toContain(spec.ideaRubric);
    for (const def of Object.values(opts.agents!)) expect(def.prompt).toContain("Output budget: at most");
  });

  it("runs in the workspace on the subscription, with skills and streaming on", () => {
    const opts = buildOptions({ room: "home", workspace: ws, spec, sessionId: "s1", skillsByAgent: { caveman: ["unslop"] } });
    expect(opts.cwd).toBe(ws);
    expect(opts.resume).toBe("s1");
    expect(opts.includePartialMessages).toBe(true);
    // Subagent words must reach the transcript tagged with their mascot, not only the lead's summary.
    expect(opts.forwardSubagentText).toBe(true);
    expect(opts.settingSources).toBeUndefined();
    expect(opts.permissionMode).toBe("default");
    expect(opts.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(opts.agents!.caveman.skills).toBeUndefined();
    expect(opts.agents!.caveman.prompt).toContain("Skills picked for you: unslop");
    expect(opts.systemPrompt).toMatchObject({ type: "preset", preset: "claude_code" });
  });
});

describe("makeCanUseTool", () => {
  const signal = new AbortController().signal;

  it("denies paths outside the workspace without asking", async () => {
    const onAsk = vi.fn();
    const can = makeCanUseTool({ runId: "r", workspace: ws, broker: new PermissionBroker(), onAsk, sessionRules: new Set() });
    const res = await can("Write", { file_path: path.resolve("/etc/x") }, { signal } as never);
    expect(res!.behavior).toBe("deny");
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("asks, then remembers 'yes for session' for the exact command", async () => {
    const broker = new PermissionBroker();
    const rules = new Set<string>();
    const onAsk = vi.fn((req: { requestId: string }) => queueMicrotask(() => broker.resolve(req.requestId, "allow_session")));
    const can = makeCanUseTool({ runId: "r", workspace: ws, broker, onAsk, sessionRules: rules });
    expect((await can("Bash", { command: "npm test" }, { signal } as never))!.behavior).toBe("allow");
    expect((await can("Bash", { command: "npm test" }, { signal } as never))!.behavior).toBe("allow");
    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it("passes the deny back to the model", async () => {
    const broker = new PermissionBroker();
    const onAsk = vi.fn((req: { requestId: string }) => queueMicrotask(() => broker.resolve(req.requestId, "deny")));
    const can = makeCanUseTool({ runId: "r", workspace: ws, broker, onAsk, sessionRules: new Set() });
    const res = await can("Bash", { command: "rm -rf x" }, { signal } as never);
    expect(res).toMatchObject({ behavior: "deny" });
  });
});

describe("fakeRun", () => {
  it("scripts a believable room run ending in result and done", async () => {
    const events: UiEvent[] = [];
    await fakeRun({ room: "library", prompt: "teach me", emit: (e) => events.push(e), delayMs: 0, signal: new AbortController().signal });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("session");
    expect(types).toContain("agent_start");
    expect(types.at(-2)).toBe("result");
    expect(types.at(-1)).toBe("done");
    expect(events.filter((e) => e.type === "agent_start").map((e) => (e as { agent: string }).agent)).toContain("caveman");
  });
});
