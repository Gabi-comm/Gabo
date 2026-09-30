import { describe, expect, it } from "vitest";
import path from "node:path";
import { ROOM_IDS, isRoomId, rosterFor, workflowFor } from "./rooms";
import { buildOptions } from "./runner";
import { createMapper } from "./events";
import { parseScoutReply } from "./skills/scout";
import { loadSpec } from "./spec";
import type { CustomAgent } from "./customAgents";

const spec = loadSpec(path.resolve(__dirname, "../.."));
const wizard: CustomAgent = {
  id: "x-data-wizard", name: "Data Wizard", tagline: "Finds the story in data.", prompt: "You analyse data and explain it plainly.",
  goal: "Always suggest one chart.", costume: { head: "wizard" }, backdrop: "space", createdAt: 0, updatedAt: 0,
};

describe("Laboratory", () => {
  it("is a Workspace room whose roster is the team Gab picked, Caveman always in", () => {
    expect(ROOM_IDS).toContain("laboratory");
    expect(rosterFor("laboratory", ["tutor", "x-data-wizard"])).toEqual(["tutor", "x-data-wizard", "caveman"]);
    expect(rosterFor("laboratory", ["caveman", "tutor", "tutor"])).toEqual(["caveman", "tutor"]);
    expect(rosterFor("laboratory", [])).toEqual(["caveman"]);
    expect(workflowFor("laboratory", ["tutor", "caveman"])).toContain("tutor, caveman");
  });

  it("room ids include custom agents' solo rooms", () => {
    expect(isRoomId("laboratory")).toBe(true);
    expect(isRoomId("agent:x-data-wizard")).toBe(true);
    expect(isRoomId("agent:x-../bad")).toBe(false);
    expect(rosterFor("agent:x-data-wizard")).toEqual(["x-data-wizard", "caveman"]);
  });
});

describe("custom agents in runs", () => {
  it("get a subagent definition with their role and goal", () => {
    const opts = buildOptions({ room: "laboratory", team: ["x-data-wizard", "judge"], workspace: path.resolve("/w"), spec, customAgents: [wizard] });
    expect(Object.keys(opts.agents!)).toEqual(["x-data-wizard", "judge", "caveman"]);
    const def = opts.agents!["x-data-wizard"];
    expect(def.description).toBe("Data Wizard: Finds the story in data.");
    expect(def.prompt).toContain("You are Data Wizard, an agent Gab made.");
    expect(def.prompt).toContain("You analyse data and explain it plainly.");
    expect(def.prompt).toContain("Gab's added goal for you: Always suggest one chart.");
    expect(def.prompt).toContain("Output budget: at most");
  });

  it("drop a custom agent that no longer exists instead of failing the run", () => {
    const opts = buildOptions({ room: "laboratory", team: ["x-gone", "tutor"], workspace: path.resolve("/w"), spec, customAgents: [] });
    expect(Object.keys(opts.agents!)).toEqual(["tutor", "caveman"]);
  });

  it("are attributed in the transcript when the mapper knows them", () => {
    const map = createMapper((id) => id === "x-data-wizard" || id === "caveman");
    const [start] = map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "t1", name: "Agent", input: { subagent_type: "x-data-wizard", description: "chart it" } },
    ] } } as never);
    expect(start).toEqual({ type: "agent_start", agent: "x-data-wizard", toolUseId: "t1", description: "chart it" });
  });

  it("can keep skills in the scout", () => {
    const lines = parseScoutReply('{"lines":[{"agent":"x-data-wizard","skills":["s1"],"why":"charts"}]}', ["x-data-wizard", "caveman"], ["s1"]);
    expect(lines[0]).toEqual({ agent: "x-data-wizard", skills: ["s1"], why: "charts" });
  });
});
