import { describe, expect, it } from "vitest";
import { createMapper, handOffs } from "./events";

describe("agent hand-offs", () => {
  it("finds the earlier teammates a brief quotes, by id or by a custom agent's name", () => {
    expect(handOffs("Hand-off\nFrom researcher: recursion needs a base case.", ["researcher", "planner"])).toEqual(["researcher"]);
    expect(handOffs("Build on what the Data Wizard found.", ["x-data-wizard"])).toEqual(["x-data-wizard"]);
    expect(handOffs("Teach recursion.", ["researcher"])).toEqual([]);
  });

  it("marks the second agent as building on the first in the transcript events", () => {
    const map = createMapper(() => true);
    const call = (id: string, agent: string, prompt: string) => map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id, name: "Agent", input: { subagent_type: agent, description: `${agent} work`, prompt } },
    ] } } as never)[0];
    expect(call("t1", "researcher", "Explain recursion with sources.")).not.toHaveProperty("from");
    expect(call("t2", "tutor", "Hand-off\nFrom researcher: base case first.\nMake a study plan.")).toMatchObject({ agent: "tutor", from: ["researcher"] });
  });
});

describe("parallel agents in the transcript", () => {
  it("keeps each agent's streamed text together when two agents run at once", async () => {
    const { reduce, initialTranscript } = await import("@/components/cli/transcript");
    let t = initialTranscript;
    for (const a of [
      { type: "agent_start", agent: "believer", toolUseId: "b", description: "case" },
      { type: "agent_start", agent: "investor", toolUseId: "i", description: "money" },
      { type: "text", delta: "Strong ", agent: "believer" },
      { type: "text", delta: "Who pays? ", agent: "investor" },
      { type: "text", delta: "case.", agent: "believer" },
      { type: "text", delta: "Students.", agent: "investor" },
    ] as const) t = reduce(t, a as never);
    const texts = t.items.filter((i) => i.kind === "text").map((i) => (i as { text: string }).text);
    expect(texts).toEqual(["Strong case.", "Who pays? Students."]);
  });
});

describe("background agents", () => {
  it("keeps a backgrounded agent running until its task notification, and reports the live set", () => {
    const map = createMapper(() => true);
    map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "t9", name: "Agent", input: { subagent_type: "coder", description: "fix the bugs", run_in_background: true } },
    ] } } as never);
    const placeholder = map({ type: "user", parent_tool_use_id: null, message: { content: [
      { type: "tool_result", tool_use_id: "t9", content: [{ type: "text", text: "Async agent launched successfully. (This tool result is internal metadata.)" }] },
    ] } } as never);
    expect(placeholder).toEqual([{ type: "agent_progress", agent: "coder", summary: "working in the background" }]);
    expect(map({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "k1", description: "Coder fixing bugs" }, { task_id: "w", description: "watcher", ambient: true }] } as never))
      .toEqual([{ type: "background", tasks: [{ id: "k1", description: "Coder fixing bugs" }] }]);
    const done = map({ type: "system", subtype: "task_notification", task_id: "k1", tool_use_id: "t9", status: "completed", summary: "Fixed 3 bugs\nmore" } as never);
    expect(done).toEqual([
      { type: "agent_stop", agent: "coder", toolUseId: "t9", ok: true },
      { type: "notice", text: "coder finished in the background: Fixed 3 bugs" },
    ]);
  });
});
