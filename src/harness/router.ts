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
/** Things to produce: a request for one of these is more than a quick answer. */
const DELIVERABLE = /\b(plan|schedule|timetable|roadmap|questions|quiz|quizzes|exercises|problems|flashcards|examples|outline|summary|summaries|essay|report|lesson|study guide|guide|checklist|table|comparison|pros and cons|breakdown|walkthrough|step[- ]by[- ]step|strategy|proposal|pitch|critique|review)\b/i;
/** Asked-for amounts: "3 practice questions", "five ideas", "a few examples". */
const QUANTITY = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|a few|several|some)\s+(?:[a-z-]+\s+){0,2}(questions|examples|ideas|steps|options|problems|exercises|tips|ways|reasons|points|flashcards|alternatives)\b/i;
/** Several asks in one message. */
const MULTI = /\b(then|and then|after that|also|as well as|plus|finally|next)\b|;|\n\s*(?:[-*•]|\d+[.)])\s/gi;

/** A room's learned lean, from Gab's corrections: positive = he wanted more team, negative = less. */
export type RouterBias = number;

export interface Score { total: number; parts: string[] }

/**
 * Complexity score (no model call). Each signal adds points; plain short questions subtract. Build and code work,
 * idea tournaments and very long tasks go straight to Deep before scoring.
 */
export function scorePrompt(prompt: string, images = 0, bias: RouterBias = 0): Score {
  const parts: string[] = [];
  let total = 0;
  const add = (n: number, why: string) => { total += n; parts.push(why); };
  add(Math.min(prompt.length / 250, 2.5), "length");
  if (DELIVERABLE.test(prompt)) add(2, "asks for something to produce");
  if (QUANTITY.test(prompt)) add(1.5, "asks for several items");
  const asks = (prompt.match(MULTI) ?? []).length;
  if (asks) add(Math.min(asks * 1.5, 3), asks > 1 ? "several steps" : "more than one step");
  if (TOOLS.test(prompt)) add(1.5, "needs to look things up");
  if (images) add(1, "has images");
  if ((QUESTION.test(prompt) || prompt.endsWith("?")) && prompt.length <= 200 && asks === 0) add(-1.5, "short question");
  if (bias) add(bias, bias > 0 ? "you often wanted more team here" : "you often wanted less team here");
  return { total: Math.round(total * 10) / 10, parts };
}

/** Score thresholds: below STANDARD is Quick, from DEEP up is Deep. */
export const THRESHOLDS = { standard: 1.2, deep: 6 };

/** Decides the tier. `--deep` / `--lite` in the prompt force it (and are removed). */
export function routePrompt(raw: string, room: RoomId, images = 0, bias: RouterBias = 0): Route {
  let prompt = raw;
  if (/(^|\s)--deep\b/i.test(prompt)) return { tier: "deep", reason: "you asked for --deep", prompt: strip(prompt, "deep") };
  if (/(^|\s)--lite\b/i.test(prompt)) return { tier: "quick", reason: "you asked for --lite", prompt: strip(prompt, "lite") };
  prompt = prompt.trim();
  if (room === "arena" && IDEAS.test(prompt)) return { tier: "deep", reason: "idea tournament", prompt };
  if (BUILD.test(prompt) || CODE.test(prompt)) return { tier: "deep", reason: "build or code work", prompt };
  if (prompt.length > 1200) return { tier: "deep", reason: "long, detailed task", prompt };
  const { total, parts } = scorePrompt(prompt, images, bias);
  const reason = parts.filter((p) => p !== "length").slice(0, 2).join(", ") || (total < THRESHOLDS.standard ? "short and simple" : "regular task");
  if (total >= THRESHOLDS.deep) return { tier: "deep", reason, prompt };
  if (total >= THRESHOLDS.standard) return { tier: "standard", reason, prompt };
  return { tier: "quick", reason, prompt };
}

/**
 * A room's lean from Gab's corrections: each --deep (or "Redo with real agents") +0.75, each --lite -0.75, capped
 * at ±3, so about four corrections in a room are enough to move even a plain short question up a tier.
 */
export function biasFrom(counts: { deep?: number; lite?: number } | undefined): RouterBias {
  if (!counts) return 0;
  return Math.max(-3, Math.min(3, ((counts.deep ?? 0) - (counts.lite ?? 0)) * 0.75));
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
