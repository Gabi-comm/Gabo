// Recommended per-agent defaults for spending tokens where they buy quality. Justification: docs/token-budget.md.
import { isAgentId, type AgentId, type AgentKey } from "./agents";

export type ModelTier = "opus" | "sonnet" | "haiku";
export type EffortLevel = "low" | "medium" | "high";
/** think: no shell, file edits or MCP. research: read and web, no edits or shell. build: every tool. */
export type ToolProfile = "think" | "research" | "build";
export type BudgetMode = "economy" | "balanced" | "max";

export const BUDGET_MODES: BudgetMode[] = ["economy", "balanced", "max"];

export interface AgentProfile {
  model: ModelTier;
  effort: EffortLevel;
  maxTurns: number;
  tools: ToolProfile;
  /** Output budget: the most words the agent should return to the lead. */
  words: number;
  /** One line shown in Settings: why this is the default. */
  why: string;
}

/** Balanced mode, the default. */
export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  believer: { model: "sonnet", effort: "medium", maxTurns: 4, tools: "think", words: 250, why: "Builds one argued case from the brief; Sonnet reasons well at a fifth of Opus's cost." },
  skeptic: { model: "sonnet", effort: "medium", maxTurns: 4, tools: "think", words: 250, why: "Attacks the Believer's case; needs sharp reasoning, not tools or files." },
  investor: { model: "sonnet", effort: "medium", maxTurns: 4, tools: "think", words: 200, why: "Short money-and-demand check with a fixed format; web search allowed, no files." },
  judge: { model: "opus", effort: "high", maxTurns: 3, tools: "think", words: 200, why: "The final BUILD / FIX / KILL call is where quality matters most; one short, deep Opus pass." },
  designer: { model: "sonnet", effort: "medium", maxTurns: 15, tools: "build", words: 350, why: "Needs to read and edit UI files; Sonnet handles design work well." },
  coder: { model: "opus", effort: "medium", maxTurns: 30, tools: "build", words: 300, why: "Code correctness saves re-runs, which cost more than the Opus premium." },
  tester: { model: "sonnet", effort: "medium", maxTurns: 25, tools: "build", words: 300, why: "Runs and breaks things methodically; Sonnet is reliable at tool-heavy checking." },
  researcher: { model: "sonnet", effort: "medium", maxTurns: 15, tools: "research", words: 400, why: "Searches and reads sources; web and docs tools, no shell or edits." },
  tutor: { model: "sonnet", effort: "medium", maxTurns: 6, tools: "think", words: 400, why: "Writes plans and questions from what the Researcher found; no tools needed." },
  caveman: { model: "haiku", effort: "low", maxTurns: 2, tools: "think", words: 80, why: "Compresses text; Haiku does this well at a tiny cost." },
  planner: { model: "sonnet", effort: "medium", maxTurns: 4, tools: "think", words: 300, why: "Orders steps and owners; structured reasoning without tools." },
  emperor: { model: "opus", effort: "medium", maxTurns: 40, tools: "build", words: 250, why: "Frames the challenge and runs the idea-arena (many turns); framing quality decides the whole tournament." },
};

/** Agents Gab makes in Settings: a safe middle until he picks otherwise. */
export const CUSTOM_PROFILE: AgentProfile = { model: "sonnet", effort: "medium", maxTurns: 12, tools: "build", words: 350, why: "A sensible middle for a new agent; change it in Settings." };

const DECIDERS = new Set<AgentId>(["judge", "coder", "emperor"]);

export const THINK_TOOLS_BLOCKED = ["Bash", "Edit", "Write", "NotebookEdit", "mcp__*"];
export const RESEARCH_TOOLS_BLOCKED = ["Bash", "Edit", "Write", "NotebookEdit"];

export function blockedTools(p: ToolProfile): string[] | undefined {
  return p === "think" ? THINK_TOOLS_BLOCKED : p === "research" ? RESEARCH_TOOLS_BLOCKED : undefined;
}

export interface ProfileOverride { model?: string; effort?: string }

const MODEL_OK = /^[\w.:\-[\]]{1,80}$/;
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

/** The profile a run uses: the mode's default for this agent, then Gab's per-agent override on top. */
export function profileFor(id: AgentKey, mode: BudgetMode = "balanced", override: ProfileOverride = {}): Omit<AgentProfile, "model" | "effort"> & { model: string; effort: string } {
  const base = isAgentId(id) ? AGENT_PROFILES[id] : CUSTOM_PROFILE;
  let { model, effort }: { model: string; effort: string } = base;
  if (mode === "economy") {
    const decider = isAgentId(id) && DECIDERS.has(id);
    model = decider ? "sonnet" : "haiku";
    effort = decider ? "medium" : "low";
  } else if (mode === "max") {
    model = "opus";
    effort = "high";
  }
  if (override.model && MODEL_OK.test(override.model)) model = override.model;
  if (override.effort && EFFORTS.has(override.effort)) effort = override.effort;
  return { ...base, model, effort };
}

/** The room lead's model and effort when Gab hasn't picked one in the status line. */
export function leadDefaults(mode: BudgetMode = "balanced"): { model: ModelTier; effort: EffortLevel } {
  if (mode === "economy") return { model: "haiku", effort: "low" };
  if (mode === "max") return { model: "opus", effort: "high" };
  return { model: "sonnet", effort: "medium" };
}

export function isBudgetMode(v: unknown): v is BudgetMode {
  return typeof v === "string" && (BUDGET_MODES as string[]).includes(v);
}
