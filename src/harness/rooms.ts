import { isAgentKey, type AgentId, type AgentKey } from "./agents";
import { tierRules } from "./router";

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

/** Every room ends with a Caveman-style recap the lead writes itself (docs/token-budget.md). */
/**
 * Workspace rooms (Library, Arena, Hackathon, Laboratory): Gab comes here for the team, so every prompt is
 * handled by the members whose roles fit it, and they work on each other's output instead of in parallel.
 */
const TEAMWORK =
  "Teamwork: Gab uses this room to have the team handle his prompt together. For every request, read the prompt, pick the members whose roles fit it (at least two, unless Gab names one or it is a one-line question), and run them in layers: members that don't need each other's output form one layer and are called together in a single message (several Agent calls at once run in parallel, which is faster); the next layer starts when they finish and gets their hand-offs. Use the room's layers below when they fit. " +
  "Agents talk through you: begin each brief after the first with a Hand-off section that, for each earlier agent, labelled by its id (\"From researcher: …\"), gives its \"For the next agent\" line and at most three key points (120 words per agent at most), never its whole output, and ask the agent to answer them (agree, challenge or build on them) before adding its own part. " +
  "If an agent disputes another, give the disputed agent one reply. Keep briefs short (the question, key facts, paths, short quotes), not the whole conversation. Gab sees every agent's full output in the chat, so don't repeat it in your recap.";
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
      TEAMWORK,
      "Layers: researcher, then tutor and planner together.",
      "The Researcher learns the topic from strong sources and cites them; the Tutor turns the Researcher's summary into a study plan and practice questions with hidden answers (asking Gab what he studies, his time and deadline only when that is missing);",
      "the Planner joins when the goal is big and needs steps.",
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
      TEAMWORK,
      "Run the idea-arena only when Gab wants ideas generated or compared: the Emperor sharpens the challenge into one clear question, then runs the idea-arena skill with the Idea Rubric using --agents 8 (16 with --quick only if Gab asks for more, 100 only when he confirmed a full run).",
      "When Gab brings his own idea to judge, skip the tournament.",
      "Layers: emperor (only when the tournament runs), then believer and investor together, then skeptic (it answers the Believer's case), then judge.",
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
      TEAMWORK,
      "Layers: planner, then designer and investor together (the investor only when the product is meant to sell), then coder, then tester.",
      "For a real build: the Planner defines done and the steps; the Designer sets the direction before UI is built; the Coder builds the smallest end-to-end version;",
      "the Tester tries to break it, and if it fails the Coder fixes once and the Tester re-checks; the Investor checks who would pay only when the product is meant to sell.",
      "A small change still goes to the Coder and then the Tester, who checks the Coder's change. Read files once and hand agents the paths and excerpts they need.",
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

/** Workspace rooms, where agents work as a team on every prompt. */
export function isTeamRoom(room: RoomId): boolean {
  return room === "library" || room === "arena" || room === "hackathon" || room === "laboratory";
}

/** `tiered`: the router is on (Workspace rooms on a strong model), so the lead gets every tier's rules. */
export function workflowFor(room: RoomId, team?: readonly string[], tiered = false): string {
  const base = baseWorkflow(room, team);
  return tiered && isTeamRoom(room) ? base.replace(TEAMWORK, tierRules(TEAMWORK)) : base;
}

function baseWorkflow(room: RoomId, team?: readonly string[]): string {
  if (room.startsWith("agent:")) {
    const id = room.slice(6);
    return `You are a solo session with the ${id} agent. Delegate the user's task to the ${id} agent and show its output in full. The Caveman is available for a short recap if asked.`;
  }
  if (room === "laboratory") {
    return `${ROOMS.laboratory.workflow} Team (subagent ids): ${labTeam(team).join(", ")}. ${TEAMWORK} ${RECAP}`;
  }
  return ROOMS[room as BaseRoomId].workflow;
}
