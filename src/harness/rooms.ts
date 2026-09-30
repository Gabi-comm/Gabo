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

export const ROOMS: Record<BaseRoomId, RoomMeta> = {
  home: {
    id: "home",
    label: "Home",
    roster: ["caveman"],
    workflow:
      "You are a normal Claude Code session. The Caveman agent is available: hand it the final answer to compress when the user asks for brevity or when your reply would run long.",
    placeholder: "How can I help you today?",
  },
  library: {
    id: "library",
    label: "Library",
    roster: ["researcher", "tutor", "planner", "caveman"],
    workflow: [
      "You lead the Library: studying, researching and understanding things.",
      "Pull only the agents the ask needs. Typical flow: the Tutor first asks what is being studied, the time available and the deadline (unless already given);",
      "the Researcher learns the topic from strong sources and cites them; the Tutor turns it into a study plan and practice questions with hidden answers;",
      "the Planner joins only when the goal is big and needs steps. The Caveman always writes the final recap the user reads.",
    ].join(" "),
    placeholder: "What are you learning?",
  },
  arena: {
    id: "arena",
    label: "Arena",
    roster: ["emperor", "believer", "skeptic", "investor", "judge", "caveman"],
    workflow: [
      "You lead the Arena: brainstorming and picking the best idea.",
      "The Emperor sharpens the challenge into one clear question, then runs the idea-arena skill with the Idea Rubric (--quick, 16 agents, unless the user confirmed a full run).",
      "The crowned idea then goes to the Believer, then the Skeptic (who reads the Believer's case), then the Investor, and the Judge rules last after hearing all three.",
      "The Caveman always writes the final recap: crowned idea, verdict, biggest risk, the 10 minute test.",
    ].join(" "),
    placeholder: "What problem needs an idea?",
  },
  hackathon: {
    id: "hackathon",
    label: "Hackathon",
    roster: ["planner", "designer", "coder", "tester", "investor", "caveman"],
    workflow: [
      "You lead the Hackathon: building and shipping marketable software fast in the current workspace.",
      "The Planner defines done and the steps; the Designer sets the direction before UI is built; the Coder builds the smallest end-to-end version;",
      "the Tester tries to break it, and if it fails the Coder fixes once and the Tester re-checks; the Investor checks who would pay.",
      "The Caveman always writes the final recap: what shipped, how to run it, what still needs attention.",
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
    return `${ROOMS.laboratory.workflow} Team (subagent ids): ${labTeam(team).join(", ")}. Pull the members the task needs, in a sensible order, and let them build on each other's work. The Caveman writes the final recap.`;
  }
  return ROOMS[room as BaseRoomId].workflow;
}
