// Zero-cost complexity router (docs/plan-faster-replies.md §1): rules on the prompt, no model call, pick how much
// team a Workspace message needs. Quick and Standard let the lead write the team's turns in one reply (Solo
// Performance Prompting); Deep uses real subagents.
import type { RoomId } from "./rooms";

export type Tier = "quick" | "standard" | "deep";

export interface Route { tier: Tier; reason: string; prompt: string }

const BUILD = /\b(build|implement|code|coding|fix|debug|refactor|deploy|ship|scaffold|migrate|install|set ?up|unit tests?|e2e|write (a |an |the )?(script|function|component|class|api|endpoint|test|app|page|website)|create (a |an |the )?(app|website|site|page|component|api|script|game|extension|bot|repo)|add (a |an )?(feature|button|page|endpoint|route))\b/i;
const CODE = /```|\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|cs|cpp|rb|php|md|json|css|scss|html|sql|yml|yaml)\b|\bsrc\/|\bnpm |\bgit /i;
const TOOLS = /\b(research|sources?|cite|citations?|latest|news|today'?s|search (the )?(web|online|internet)|web search|look up|find out|compare .{0,40}(tools|libraries|frameworks|products|models)|survey)\b/i;
const IDEAS = /\b(ideas?|brainstorm|tournament)\b|(^|\s)--(full|quick|agents)\b/i;
const QUESTION = /^(what|why|how|who|when|where|which|is|are|can|could|does|do|did|should|explain|define|tell me|difference)\b/i;

/** Decides the tier. `--deep` / `--lite` in the prompt force it (and are removed). */
export function routePrompt(raw: string, room: RoomId, images = 0): Route {
  let prompt = raw;
  if (/(^|\s)--deep\b/i.test(prompt)) return { tier: "deep", reason: "you asked for --deep", prompt: strip(prompt, "deep") };
  if (/(^|\s)--lite\b/i.test(prompt)) return { tier: "quick", reason: "you asked for --lite", prompt: strip(prompt, "lite") };
  prompt = prompt.trim();
  const build = BUILD.test(prompt) || CODE.test(prompt);
  if (room === "arena" && IDEAS.test(prompt)) return { tier: "deep", reason: "idea tournament", prompt };
  if (build) return { tier: "deep", reason: "build or code work", prompt };
  if (prompt.length > 1200) return { tier: "deep", reason: "long, detailed task", prompt };
  const needsTools = TOOLS.test(prompt) || images > 0;
  if (!needsTools && prompt.length <= 200 && (QUESTION.test(prompt) || prompt.endsWith("?"))) {
    return { tier: "quick", reason: "short question", prompt };
  }
  return { tier: "standard", reason: needsTools ? "needs one tool-using agent at most" : "regular task", prompt };
}

const strip = (p: string, flag: string) => p.replace(new RegExp(`(^|\\s)--${flag}\\b`, "gi"), " ").replace(/\s+/g, " ").trim();

/**
 * How the lead handles each tier. Written once into the system prompt, so it never changes between messages:
 * a changing system prompt, tool list or effort would break the prompt cache and re-bill the whole chat.
 * The tier itself travels on the message as a tag (tierTag).
 */
export function tierRules(deepTeamwork: string): string {
  const common = "write each turn yourself, in that member's voice and role, each starting with its own line `### <agent id>` (for example `### researcher`); every turn after the first answers the earlier turns (agree, challenge or build on them). End the team part with a line `### Recap`, then the recap.";
  return [
    "Gabo starts each of Gab's messages with a tier tag that says how much team it needs (it saves tokens).",
    `[Tier: Quick]: do not call any agent. Answer as the team in one reply: pick the 2 members of this room whose roles fit best and ${common} Keep each turn under 120 words.`,
    `[Tier: Standard]: answer as the team in one reply: pick the 2 or 3 members whose roles fit and ${common} Keep each turn under 150 words. Only when a member's part truly needs tools (searching the web, reading or editing files, running commands), call that one member as a real agent with a short Hand-off brief instead of writing its turn, then continue. At most one real agent.`,
    `[Tier: Deep] or no tag: ${deepTeamwork}`,
    "Never mention the tag in your reply.",
  ].join(" ");
}

export const tierTag = (tier: Tier) => `[Tier: ${tier[0].toUpperCase()}${tier.slice(1)}]`;
export const TIER_TAG = /^\[Tier: (Quick|Standard|Deep)\]\s*/;
