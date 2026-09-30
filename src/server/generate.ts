import {
  BACKDROP_TAGS, BACKDROP_THEMES, BODY_COLORS, PARTS, SLOTS, backdropFromText, costumeFromText, sanitizeCostume,
  type BackdropTheme, type Costume,
} from "@/harness/costume";
import { FAKE } from "./config";
import { askHaiku, firstJson } from "./haiku";

export interface Generated<T> { value: T; source: "claude" | "offline" }

/** Describe a mascot in words → a costume from the parts catalog. */
export async function generateCostume(description: string): Promise<Generated<Costume>> {
  const offline = costumeFromText(description);
  if (FAKE) return { value: offline, source: "offline" };
  const catalog = SLOTS.map((slot) => `${slot}: ${Object.entries(PARTS[slot]).map(([id, p]) => `${id} (${p.label})`).join(", ")}`).join("\n");
  const prompt = [
    "Dress a small pixel-art dinosaur mascot to match this description. Choose at most one part per slot, only from the catalog, and a body colour.",
    catalog,
    `body colours: ${Object.keys(BODY_COLORS).join(", ")}`,
    `Description: ${description.slice(0, 1000)}`,
    'Reply with JSON only, e.g. {"body":"blue","head":"wizard","face":"glasses","held":"staff","front":null,"back":null}. Always pick a held item.',
  ].join("\n\n");
  try {
    const picked = sanitizeCostume(firstJson(await askHaiku(prompt)));
    if (picked.held) return { value: picked, source: "claude" };
  } catch { /* fall back */ }
  return { value: offline, source: "offline" };
}

/** An agent's role and goal → the stage it stands on. */
export async function generateBackdrop(input: { name: string; prompt: string; goal: string }): Promise<Generated<BackdropTheme>> {
  const text = `${input.name}\n${input.prompt}\n${input.goal}`;
  const offline = backdropFromText(text);
  if (FAKE) return { value: offline, source: "offline" };
  const catalog = BACKDROP_THEMES.map((t) => `${t}: ${BACKDROP_TAGS[t].slice(0, 5).join(", ")}`).join("\n");
  const prompt = [
    "Pick the background scene that best fits this agent's role. Choose one id from the catalog.",
    catalog,
    `Agent: ${input.name}\nRole: ${input.prompt.slice(0, 3000)}\nGoal: ${input.goal.slice(0, 1000)}`,
    'Reply with JSON only: {"theme":"<id>"}',
  ].join("\n\n");
  try {
    const j = firstJson(await askHaiku(prompt)) as { theme?: unknown } | null;
    if (typeof j?.theme === "string" && (BACKDROP_THEMES as readonly string[]).includes(j.theme)) {
      return { value: j.theme as BackdropTheme, source: "claude" };
    }
  } catch { /* fall back */ }
  return { value: offline, source: "offline" };
}
