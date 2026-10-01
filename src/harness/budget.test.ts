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
  it("Home triages; Workspace rooms work as a team with hand-offs; the lead writes the Caveman-style recap", () => {
    expect(workflowFor("home")).toMatch(/Triage first/);
    for (const room of ROOM_IDS.filter((r) => r !== "home")) {
      const w = workflowFor(room, ["tutor", "researcher", "caveman"]);
      expect(w, room).not.toMatch(/Caveman always writes/);
      expect(w, room).toMatch(/Teamwork/);
      expect(w, room).toMatch(/Hand-off section/);
      expect(w, room).toMatch(/at least two/);
      expect(w, room).toMatch(/Caveman style/);
    }
  });
  it("agents in Workspace rooms answer their teammates first and leave a note for the next agent", () => {
    const team = buildOptions({ room: "library", workspace: path.resolve("/w"), spec });
    expect(team.agents!.tutor.prompt).toMatch(/answering them by name/);
    expect(team.agents!.tutor.prompt).toMatch(/For the next agent:/);
    const home = buildOptions({ room: "home", workspace: path.resolve("/w"), spec });
    expect(home.agents!.caveman.prompt).not.toMatch(/For the next agent/);
  });
  it("the Arena runs the idea-arena only when ideas are wanted, with 8 competitors by default", () => {
    const w = workflowFor("arena");
    expect(w).toMatch(/only when Gab wants ideas/);
    expect(w).toMatch(/--agents 8/);
  });
});

describe("Local LLM slim profile", () => {
  const local = { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen3-8b-gabo-32k" };
  it("gives the local model only the essential tools, the picked skills and the allowed plugins", () => {
    const o = buildOptions({ room: "library", workspace: path.resolve("/w"), spec, local, localSlim: { skills: ["unslop"], blockedMcp: ["mcp__plugin_supabase_supabase"] } });
    expect(o.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Skill", "WebFetch", "Agent"]);
    expect(o.skills).toEqual(["unslop"]);
    expect(o.strictMcpConfig).toBe(true);
    expect(o.disallowedTools).toEqual(["mcp__plugin_supabase_supabase"]);
    expect((o.systemPrompt as { append: string }).append).toMatch(/small local model/);
    expect(buildOptions({ room: "home", workspace: path.resolve("/w"), spec, local }).tools).not.toContain("Agent");
  });
  it("leaves everything as is on an AI account, and passes connected folders and the account env", () => {
    const o = buildOptions({ room: "home", workspace: path.resolve("/w"), spec, env: { ANTHROPIC_API_KEY: "k" }, extraRoots: ["C:/Vault"] });
    expect(o.tools).toBeUndefined();
    expect(o.skills).toBeUndefined();
    expect(o.env).toEqual({ ANTHROPIC_API_KEY: "k" });
    expect(o.additionalDirectories).toEqual(["C:/Vault"]);
  });
});

describe("cache-friendly prompts and trimmed hand-offs", () => {
  it("puts the per-chat skill list last in an agent's prompt", () => {
    const o = buildOptions({ room: "library", workspace: path.resolve("/w"), spec, skillsByAgent: { tutor: ["unslop"] } });
    const p = o.agents!.tutor.prompt;
    expect(p.trim().endsWith("Load one with the Skill tool only when the task needs it.")).toBe(true);
    expect(p.indexOf("Output budget")).toBeLessThan(p.indexOf("Skills picked for you"));
  });
  it("hands the next agent key points, not whole outputs", () => {
    const w = workflowFor("library");
    expect(w).toMatch(/at most three key points \(120 words per agent at most\), never its whole output/);
  });
});

describe("parallel layers in Deep replies", () => {
  it("team rooms run members in layers, with each room's own layers", () => {
    expect(workflowFor("library")).toMatch(/called together in a single message/);
    expect(workflowFor("library")).toMatch(/Layers: researcher, then tutor and planner together/);
    expect(workflowFor("arena")).toMatch(/then believer and investor together, then skeptic/);
    expect(workflowFor("hackathon")).toMatch(/Layers: planner, then designer and investor together/);
    expect(workflowFor("laboratory", ["tutor", "researcher"])).toMatch(/run them in layers/);
  });
});

describe("user hooks", () => {
  it("are switched off in Gabo's sessions unless Gab turns them on; local runs keep their own settings", () => {
    const off = buildOptions({ room: "home", workspace: path.resolve("/w"), spec, userHooks: false });
    expect(off.settings).toEqual({ disableAllHooks: true });
    expect(buildOptions({ room: "home", workspace: path.resolve("/w"), spec }).settings).toBeUndefined();
    const local = buildOptions({ room: "home", workspace: path.resolve("/w"), spec, userHooks: false, local: { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen3:8b" } });
    expect(local.settings).toMatchObject({ disableAllHooks: true, includeGitInstructions: false });
  });
});
