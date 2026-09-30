import { describe, expect, it } from "vitest";
import path from "node:path";
import { AGENT_IDS } from "./agents";
import { AGENT_PROFILES, THINK_TOOLS_BLOCKED, profileFor, leadDefaults, type BudgetMode } from "./budget";
import { buildOptions } from "./runner";
import { workflowFor, ROOM_IDS } from "./rooms";
import { loadSpec } from "./spec";

const spec = loadSpec(path.resolve(__dirname, "../.."));
const ws = path.resolve("/w");

describe("agent profiles (recommended defaults)", () => {
  it("every built-in agent has a model, effort, turn cap, tool profile, word budget and a reason", () => {
    for (const id of AGENT_IDS) {
      const p = AGENT_PROFILES[id];
      expect(["opus", "sonnet", "haiku"]).toContain(p.model);
      expect(["low", "medium", "high"]).toContain(p.effort);
      expect(p.maxTurns).toBeGreaterThan(0);
      expect(["think", "build", "research"]).toContain(p.tools);
      expect(p.words).toBeGreaterThan(0);
      expect(p.why.length).toBeGreaterThan(10);
    }
  });

  it("spends Opus on judgment and code, Haiku on formatting", () => {
    expect(AGENT_PROFILES.judge.model).toBe("opus");
    expect(AGENT_PROFILES.coder.model).toBe("opus");
    expect(AGENT_PROFILES.emperor.model).toBe("opus");
    expect(AGENT_PROFILES.caveman).toMatchObject({ model: "haiku", effort: "low" });
    expect(AGENT_PROFILES.researcher.model).toBe("sonnet");
  });

  it("budget modes shift the whole table; per-agent overrides win", () => {
    expect(profileFor("skeptic", "economy").model).toBe("haiku");
    expect(profileFor("judge", "economy").model).toBe("sonnet");
    expect(profileFor("skeptic", "max")).toMatchObject({ model: "opus", effort: "high" });
    expect(profileFor("skeptic", "balanced", { model: "opus", effort: "low" })).toMatchObject({ model: "opus", effort: "low" });
    expect(profileFor("x-custom" as never, "balanced")).toMatchObject({ model: "sonnet", effort: "medium", tools: "build" });
  });

  it("the lead defaults to Sonnet at medium effort (Balanced) unless Gab picks otherwise", () => {
    expect(leadDefaults("balanced")).toEqual({ model: "sonnet", effort: "medium" });
    expect(leadDefaults("economy")).toEqual({ model: "haiku", effort: "low" });
    expect(leadDefaults("max")).toEqual({ model: "opus", effort: "high" });
  });
});

describe("runs apply the profiles", () => {
  const opts = buildOptions({ room: "arena", workspace: ws, spec, skillsByAgent: { designer: ["web-design-guidelines"], skeptic: ["unslop"] } });

  it("each agent gets its model, effort and turn cap", () => {
    expect(opts.agents!.caveman).toMatchObject({ model: "haiku", effort: "low", maxTurns: AGENT_PROFILES.caveman.maxTurns });
    expect(opts.agents!.judge).toMatchObject({ model: "opus", effort: "high" });
  });

  it("thinking roles can't run shell, edit files or call MCP tools", () => {
    expect(opts.agents!.skeptic.disallowedTools).toEqual(THINK_TOOLS_BLOCKED);
    expect(opts.agents!.emperor.disallowedTools).toBeUndefined();
  });

  it("skills are named, not preloaded, and the GitHub-browsing rule is gone from agent prompts", () => {
    expect(opts.agents!.skeptic.skills).toBeUndefined();
    expect(opts.agents!.skeptic.prompt).toContain("Skills picked for you: unslop");
    expect(opts.agents!.judge.prompt).not.toContain(spec.skillScout);
    expect(opts.agents!.judge.prompt).toContain(spec.agents.judge);
  });

  it("every agent gets an output budget", () => {
    expect(opts.agents!.skeptic.prompt).toMatch(new RegExp(`at most ${AGENT_PROFILES.skeptic.words} words`));
  });

  it("the lead runs Sonnet/medium by default, and progress summaries are off", () => {
    const home = buildOptions({ room: "home", workspace: ws, spec });
    expect(home.model).toBe("sonnet");
    expect(home.effort).toBe("medium");
    expect(home.agentProgressSummaries).toBe(false);
    const picked = buildOptions({ room: "home", workspace: ws, spec, prefs: { model: "opus", effort: "high" } });
    expect(picked).toMatchObject({ model: "opus", effort: "high" });
  });

  it("budget mode reaches the run", () => {
    const eco = buildOptions({ room: "arena", workspace: ws, spec, budget: "economy" as BudgetMode });
    expect(eco.agents!.believer.model).toBe("haiku");
    expect(eco.model).toBe("haiku");
  });
});

describe("room workflows", () => {
  it("triage first, and the lead writes the Caveman-style recap itself", () => {
    for (const room of ROOM_IDS) {
      const w = workflowFor(room, ["tutor", "caveman"]);
      expect(w, room).not.toMatch(/Caveman always writes/);
      expect(w, room).toMatch(/Triage first/);
      expect(w, room).toMatch(/Caveman style/);
    }
  });
  it("the Arena runs the idea-arena only when ideas are wanted, with 8 competitors by default", () => {
    const w = workflowFor("arena");
    expect(w).toMatch(/only when Gab wants ideas/);
    expect(w).toMatch(/--agents 8/);
  });
});
