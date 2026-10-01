import { describe, expect, it } from "vitest";
import path from "node:path";
import { routePrompt, tierTag } from "./router";
import { cleanUserText } from "./history";
import { makePersonaSplitter } from "./personaSplit";
import { buildOptions } from "./runner";
import { workflowFor } from "./rooms";
import { loadSpec } from "./spec";
import type { UiEvent } from "./events";

const spec = loadSpec(path.resolve(__dirname, "../.."));

describe("complexity router", () => {
  it("short questions are Quick, regular tasks Standard, build work Deep", () => {
    expect(routePrompt("What's the difference between a list and a tuple?", "library").tier).toBe("quick");
    expect(routePrompt("what is a binary search?", "library").tier).toBe("quick");
    expect(routePrompt("make me a 2 week study plan for my calculus exam", "library").tier).toBe("standard");
    expect(routePrompt("find the latest sources on transformer efficiency", "library")).toMatchObject({ tier: "standard", reason: expect.stringMatching(/tool/) });
    expect(routePrompt("build a landing page with a signup form", "hackathon").tier).toBe("deep");
    expect(routePrompt("why does src/app/page.tsx crash?", "hackathon").tier).toBe("deep");
    expect(routePrompt("coffee ideas", "arena").tier).toBe("deep");
    expect(routePrompt("x".repeat(1300), "library").tier).toBe("deep");
  });
  it("--deep and --lite force a tier and are removed from the prompt", () => {
    expect(routePrompt("explain recursion --deep", "library")).toEqual({ tier: "deep", reason: "you asked for --deep", prompt: "explain recursion" });
    expect(routePrompt("--lite plan my week", "library")).toMatchObject({ tier: "quick", prompt: "plan my week" });
  });
});

describe("team in one reply", () => {
  it("the tier rules sit once in the system prompt; the agent list, effort and prompt prefix don't change per tier", () => {
    const quick = buildOptions({ room: "library", workspace: path.resolve("/w"), spec, tier: "quick" });
    const deep = buildOptions({ room: "library", workspace: path.resolve("/w"), spec, tier: "deep" });
    const append = (o: typeof quick) => (o.systemPrompt as { append: string }).append;
    expect(append(quick)).toBe(append(deep));
    expect(append(quick)).toMatch(/\[Tier: Quick\]: do not call any agent/);
    expect(append(quick)).toMatch(/\[Tier: Standard\].*At most one real agent/);
    expect(append(quick)).toMatch(/\[Tier: Deep\] or no tag: Teamwork/);
    expect(Object.keys(quick.agents!)).toEqual(Object.keys(deep.agents!));
    expect(quick.effort).toBe(deep.effort);
  });
  it("without the router (Home, Local LLM) the workflow has no tier rules", () => {
    expect(workflowFor("home", [], true)).toMatch(/Triage first/);
    expect(workflowFor("library", [])).not.toMatch(/\[Tier:/);
    const local = buildOptions({ room: "library", workspace: path.resolve("/w"), spec, tier: "quick", local: { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen3:8b" } });
    expect((local.systemPrompt as { append: string }).append).not.toMatch(/\[Tier:/);
  });
  it("the tag goes on the message and is hidden when a chat is reopened", () => {
    expect(tierTag("quick")).toBe("[Tier: Quick]");
    expect(cleanUserText("[Tier: Standard] plan my week")).toBe("plan my week");
  });

  it("turns `### agent` sections into agent blocks with hand-offs, even split across chunks", () => {
    const s = makePersonaSplitter([{ id: "researcher", names: ["The Researcher"] }, { id: "tutor", names: ["The Tutor"] }]);
    const chunks = ["Here we go.\n### Rese", "archer\nRecursion calls itself.\n", "### The Tutor\nTry fib(5).\n", "### Recap\nBase case first."];
    const out: UiEvent[] = [...chunks.flatMap((d) => s.push({ type: "text", delta: d, agent: null })), ...s.end()];
    const kinds = out.map((e) => e.type === "text" ? `${e.agent ?? "lead"}:${e.delta.trim()}` : e.type === "agent_start" ? `start:${e.agent}${e.from ? `<-${e.from.join()}` : ""}` : e.type === "agent_stop" ? `stop:${e.agent}` : e.type);
    expect(kinds.filter((k) => !k.endsWith(":"))).toEqual([
      "lead:Here we go.", "start:researcher", "researcher:Recursion calls itself.", "stop:researcher",
      "start:tutor<-researcher", "tutor:Try fib(5).", "stop:tutor", "lead:Base case first.",
    ]);
  });
  it("leaves headings that aren't agents as text, and closes a turn when a real agent starts", () => {
    const s = makePersonaSplitter([{ id: "coder", names: ["The Coder"] }]);
    const out = [...s.push({ type: "text", delta: "### Steps\n### coder\nOn it.\n", agent: null }),
      ...s.push({ type: "agent_start", agent: "tester", toolUseId: "t1", description: "check" })];
    expect(out[0]).toEqual({ type: "text", delta: "### Steps\n", agent: null });
    expect(out.map((e) => e.type)).toEqual(["text", "agent_start", "text", "agent_stop", "agent_start"]);
  });
});
