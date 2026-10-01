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
