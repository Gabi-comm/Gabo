import { isAgentKey, type AgentId, type AgentKey } from "./agents";

export const ROOM_IDS = ["home", "library", "arena", "hackathon", "laboratory"] as const;
export type BaseRoomId = (typeof ROOM_IDS)[number];
export type RoomId = BaseRoomId | `agent:${AgentKey}`;

export interface RoomMeta {
  id: BaseRoomId;
  label: string;
  roster: AgentId[];
  /** Appended to the Claude Code system prompt for the lead of this room. */
  workflow: string;
  placeholder: string;
}

/**
 * Shared by every room (docs/token-budget.md): decide how much help the task needs before pulling agents,
 * pass short structured hand-offs, and finish with a Caveman-style recap written by the lead itself.
 * The Caveman agent stays in every room, but is only called when Gab asks for it.
 */
const TRIAGE =
  "Triage first: answer directly when the task is simple; call one agent when one view is enough; pull the team only when the task needs several viewpoints. Never call an agent just to restate what another said. Give each agent a short brief (the question, key facts, file paths or quotes it needs), not the whole conversation, and pass its structured output on instead of re-deriving it.";
const RECAP =
  "Finish with a short recap in Caveman style, written by you: answer first, no greeting or filler, keep every number, file name and warning. Call the caveman agent only when Gab asks for it by name.";

export const ROOMS: Record<BaseRoomId, RoomMeta> = {
  home: {
    id: "home",
    label: "Home",
    roster: ["caveman"],
    workflow: [
      "You are a normal Claude Code session.",
      "Triage first: most tasks need no agent at all. The caveman agent is available if Gab asks for it.",
      "When your reply would run long, close with a Caveman style recap you write yourself (answer first, no filler, keep numbers, file names and warnings).",
    ].join(" "),
    placeholder: "How can I help you today?",
  },
  library: {
    id: "library",
    label: "Library",
    roster: ["researcher", "tutor", "planner", "caveman"],
    workflow: [
      "You lead the Library: studying, researching and understanding things.",
      TRIAGE,
      "Typical flow when a team is needed: the Tutor first asks what is being studied, the time available and the deadline (unless already given);",
      "the Researcher learns the topic from strong sources and cites them; the Tutor turns the Researcher's summary into a study plan and practice questions with hidden answers;",
      "the Planner joins only when the goal is big and needs steps. A quick factual question needs only the Researcher, or no agent.",
      RECAP,
    ].join(" "),
    placeholder: "What are you learning?",
  },
  arena: {
    id: "arena",
    label: "Arena",
    roster: ["emperor", "believer", "skeptic", "investor", "judge", "caveman"],
    workflow: [
      "You lead the Arena: brainstorming and picking the best idea.",
      TRIAGE,
      "Run the idea-arena only when Gab wants ideas generated or compared: the Emperor sharpens the challenge into one clear question, then runs the idea-arena skill with the Idea Rubric using --agents 8 (16 with --quick only if Gab asks for more, 100 only when he confirmed a full run).",
      "When Gab brings his own idea to judge, skip the tournament.",
      "Give the crowned (or Gab's) idea to the Believer, Skeptic and Investor as a five-line brief; the Skeptic also gets the Believer's case. The Judge rules last from their three outputs.",
      RECAP.replace("recap in Caveman style", "recap in Caveman style (crowned idea, verdict, biggest risk, the 10 minute test)"),
    ].join(" "),
    placeholder: "What problem needs an idea?",
  },
  hackathon: {
    id: "hackathon",
    label: "Hackathon",
    roster: ["planner", "designer", "coder", "tester", "investor", "caveman"],
    workflow: [
      "You lead the Hackathon: building and shipping marketable software fast in the current workspace.",
      TRIAGE,
      "For a real build: the Planner defines done and the steps; the Designer sets the direction before UI is built; the Coder builds the smallest end-to-end version;",
      "the Tester tries to break it, and if it fails the Coder fixes once and the Tester re-checks; the Investor checks who would pay only when the product is meant to sell.",
      "A small change goes straight to the Coder (and the Tester if it's risky). Read files once and hand agents the paths and excerpts they need.",
      RECAP.replace("recap in Caveman style", "recap in Caveman style (what shipped, how to run it, what still needs attention)"),
    ].join(" "),
    placeholder: "What are we shipping?",
  },
  laboratory: {
    id: "laboratory",
    label: "Laboratory",
    // The team is picked per chat; see rosterFor(room, team).
    roster: ["caveman"],
    workflow: "You lead the Laboratory: Gab picked this team himself for the task.",
    placeholder: "What should this team work on?",
  },
};

export function isRoomId(value: unknown): value is RoomId {
  if (typeof value !== "string") return false;
  if ((ROOM_IDS as readonly string[]).includes(value)) return true;
  return value.startsWith("agent:") && isAgentKey(value.slice(6));
}

/** A Laboratory team as Gab picked it: known ids only, no repeats, the Caveman always in. */
export function labTeam(team: readonly string[] = []): AgentKey[] {
  const out: AgentKey[] = [];
  for (const id of team) if (isAgentKey(id) && !out.includes(id)) out.push(id);
  if (!out.includes("caveman")) out.push("caveman");
  return out;
}

/** The agents a room can pull. The Caveman is in every room. */
export function rosterFor(room: RoomId, team?: readonly string[]): AgentKey[] {
  if (room.startsWith("agent:")) {
    const id = room.slice(6) as AgentKey;
    return id === "caveman" ? ["caveman"] : [id, "caveman"];
  }
  if (room === "laboratory") return labTeam(team);
  return ROOMS[room as BaseRoomId].roster;
}

export function workflowFor(room: RoomId, team?: readonly string[]): string {
  if (room.startsWith("agent:")) {
    const id = room.slice(6);
    return `You are a solo session with the ${id} agent. Delegate the user's task to the ${id} agent and show its output in full. The Caveman is available for a short recap if asked.`;
  }
  if (room === "laboratory") {
    return `${ROOMS.laboratory.workflow} Team (subagent ids): ${labTeam(team).join(", ")}. ${TRIAGE} Use the members the task needs, in a sensible order, and let them build on each other's outputs. ${RECAP}`;
  }
  return ROOMS[room as BaseRoomId].workflow;
}
