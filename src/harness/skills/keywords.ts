// Offline skill scout for the Local LLM: matches the task's words against installed skills' names and
// descriptions, so a local run never calls Claude. Weaker than the model scout, but free and instant.
import type { AgentKey } from "../agents";
import type { SkillLine } from "../events";
import type { PoolSkill } from "./scout";

const STOP = new Set(("a an and are as at be but by can do for from has have how i in into is it its me my of on or our please so " +
  "that the their them then there these this to us use using was we what when where which who why will with you your make want need help " +
  "about just like get new one some all any more most also only very").split(" "));

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [])
    .map((w) => w.replace(/[.-]+$/, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Score = task words found in the skill's name (x3) and description (x1); prefix matches count (react ~ reactjs). */
export function scoreSkill(task: string[], skill: Pick<PoolSkill, "name" | "description">): { score: number; hits: string[] } {
  const name = new Set(words(skill.name.replace(/[-_:]/g, " ")));
  const desc = words(skill.description ?? "");
  let score = 0;
  const hits = new Set<string>();
  for (const w of new Set(task)) {
    const near = (x: string) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)) && x.length >= 4);
    if ([...name].some(near)) { score += 3; hits.add(w); }
    else if (desc.some(near)) { score += 1; hits.add(w); }
  }
  return { score, hits: [...hits] };
}

/** At most `per` installed skills for each agent, only when they clearly match the task. */
export function keywordScout(task: string, roster: AgentKey[], pool: PoolSkill[], per = 2, min = 2): SkillLine[] {
  const t = words(task);
  const ranked = pool
    .filter((s) => s.installed)
    .map((s) => ({ s, ...scoreSkill(t, s) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, per);
  const skills = ranked.map((r) => r.s.name);
  const why = ranked.length ? `matches ${[...new Set(ranked.flatMap((r) => r.hits))].slice(0, 3).join(", ")}` : "none fit";
  return roster.map((agent) => ({ agent, skills, why }));
}
