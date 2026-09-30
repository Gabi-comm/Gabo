// Client-safe agent metadata. Role prompts live in docs/spec.md and are loaded server-side by spec.ts.

export const AGENT_IDS = [
  "believer", "skeptic", "investor", "judge", "designer", "coder",
  "tester", "researcher", "tutor", "caveman", "planner", "emperor",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export interface AgentMeta {
  id: AgentId;
  name: string;
  /** One line for the sidebar and the Agents tab. */
  tagline: string;
  /** Short word shown while the agent works, Claude Code spinner style. */
  verb: string;
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  believer: { id: "believer", name: "The Believer", tagline: "Makes the strongest honest case for it.", verb: "Arguing" },
  skeptic: { id: "skeptic", name: "The Skeptic", tagline: "Tries to kill it. Finds the fatal flaw.", verb: "Doubting" },
  investor: { id: "investor", name: "The Investor", tagline: "Will anyone pay? The one number that matters.", verb: "Pricing" },
  judge: { id: "judge", name: "The Judge", tagline: "BUILD, FIX FIRST, or KILL.", verb: "Ruling" },
  designer: { id: "designer", name: "The Designer", tagline: "Makes it look like someone meant it.", verb: "Composing" },
  coder: { id: "coder", name: "The Coder", tagline: "Turns the plan into something that runs.", verb: "Typing" },
  tester: { id: "tester", name: "The Tester", tagline: "Assumes it's broken until proven otherwise.", verb: "Breaking" },
  researcher: { id: "researcher", name: "The Researcher", tagline: "Learns it properly, cites every claim.", verb: "Reading" },
  tutor: { id: "tutor", name: "The Tutor", tagline: "Turns it into something you remember.", verb: "Quizzing" },
  caveman: { id: "caveman", name: "The Caveman", tagline: "Most said, fewest words.", verb: "Grunting" },
  planner: { id: "planner", name: "The Planner", tagline: "Big fuzzy goal to steps you start today.", verb: "Sequencing" },
  emperor: { id: "emperor", name: "The Emperor", tagline: "Summons a hundred minds, crowns one idea.", verb: "Summoning" },
};

/** Agents Gab creates in Settings: ids are "x-" + a slug of the name. */
export type CustomId = `x-${string}`;
/** A built-in agent or one of Gab's own. */
export type AgentKey = AgentId | CustomId;

export const CUSTOM_ID = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCustomId(value: unknown): value is CustomId {
  return typeof value === "string" && value.length <= 48 && CUSTOM_ID.test(value);
}

export function isAgentKey(value: unknown): value is AgentKey {
  return isAgentId(value) || isCustomId(value);
}

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}
