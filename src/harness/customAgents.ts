// Agents Gab makes in Settings → Add agent. Shared by the browser (drawing, forms) and the server (store, runs).
import { AGENTS, type CustomId } from "./agents";
import { BACKDROP_THEMES, sanitizeCostume, type BackdropTheme, type Costume } from "./costume";

export interface CustomAgent {
  id: CustomId;
  name: string;
  tagline: string;
  prompt: string;
  goal: string;
  costume: Costume;
  backdrop: BackdropTheme;
  /** Optional model / effort; otherwise the recommended default for a new agent (Sonnet, medium). */
  model?: string;
  effort?: string;
  createdAt: number;
  updatedAt: number;
}

export type CustomAgentDraft = Pick<CustomAgent, "name" | "tagline" | "prompt" | "goal" | "costume" | "backdrop" | "model" | "effort">;

export const LIMITS = { name: 30, tagline: 120, prompt: 20_000, goal: 4_000 };

export function makeCustomId(name: string, taken: string[]): CustomId {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "agent";
  let id = `x-${slug}` as CustomId;
  for (let n = 2; taken.includes(id); n++) id = `x-${slug}-${n}` as CustomId;
  return id;
}

const BUILT_IN_NAMES = new Set(Object.values(AGENTS).flatMap((a) => [a.name.toLowerCase(), a.name.replace(/^The /, "").toLowerCase()]));

export type Validated = { ok: true; value: CustomAgentDraft } | { ok: false; error: string };

export function validateCustomAgent(raw: unknown, others: { id: string; name: string }[] = [], selfId?: string): Validated {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (k: string) => (typeof r[k] === "string" ? (r[k] as string).replace(/\r\n/g, "\n").trim() : "");
  const name = text("name").replace(/\s+/g, " ");
  const tagline = text("tagline").replace(/\s+/g, " ");
  const prompt = text("prompt");
  const goal = text("goal");
  if (!name) return { ok: false, error: "Give the agent a name." };
  if (name.length > LIMITS.name) return { ok: false, error: `Keep the name under ${LIMITS.name} characters.` };
  if (BUILT_IN_NAMES.has(name.toLowerCase())) return { ok: false, error: `${name} is already one of the built-in agents; pick another name.` };
  if (others.some((o) => o.id !== selfId && o.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `You already have an agent called ${name}.` };
  if (tagline.length > LIMITS.tagline) return { ok: false, error: `Keep the one-liner under ${LIMITS.tagline} characters.` };
  if (!prompt) return { ok: false, error: "Write the agent's role (its system prompt)." };
  if (prompt.length > LIMITS.prompt) return { ok: false, error: `The role is too long (max ${LIMITS.prompt.toLocaleString()} characters).` };
  if (goal.length > LIMITS.goal) return { ok: false, error: `The goal is too long (max ${LIMITS.goal.toLocaleString()} characters).` };
  const backdrop = (BACKDROP_THEMES as readonly string[]).includes(r.backdrop as string) ? (r.backdrop as BackdropTheme) : "sunrise";
  const model = typeof r.model === "string" && /^[\w.:\-[\]]{1,80}$/.test(r.model) ? r.model : undefined;
  const effort = typeof r.effort === "string" && ["low", "medium", "high", "xhigh", "max"].includes(r.effort) ? r.effort : undefined;
  return { ok: true, value: { name, tagline, prompt, goal, costume: sanitizeCostume(r.costume), backdrop, ...(model ? { model } : {}), ...(effort ? { effort } : {}) } };
}
