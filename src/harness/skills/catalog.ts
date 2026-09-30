import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";

export const REPO = "vercel-labs/agent-skills";
export const BRANCH = "main";
export const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
export const rawUrl = (p: string) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p}`;

export interface CatalogSkill { name: string; dir: string; description: string }
export interface LocalSkill { name: string; description: string; dir: string }
export interface TreeEntry { path: string; type: string }

const DAY = 24 * 60 * 60 * 1000;

export async function fetchTree(fetchImpl: typeof fetch = fetch): Promise<TreeEntry[]> {
  const res = await fetchImpl(TREE_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for the skills list.`);
  const body = (await res.json()) as { tree?: TreeEntry[] };
  return body.tree ?? [];
}

/**
 * The skill catalog from vercel-labs/agent-skills: folder names from one tree call, then only the
 * first bytes of each SKILL.md (the one-line description), never the full files. Cached for a day.
 */
export async function fetchCatalog({ fetchImpl = fetch, cacheFile, maxAgeMs = DAY }: {
  fetchImpl?: typeof fetch; cacheFile: string; maxAgeMs?: number;
}): Promise<CatalogSkill[]> {
  let cached: { at: number; skills: CatalogSkill[] } | null = null;
  try { cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { /* no cache yet */ }
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.skills;
  try {
    const tree = await fetchTree(fetchImpl);
    const dirs = [...new Set(tree
      .filter((e) => e.type === "blob" && /^skills\/[^/]+\/SKILL\.md$/.test(e.path))
      .map((e) => e.path.split("/")[1]))];
    const skills = (await Promise.all(dirs.map(async (dir) => {
      const res = await fetchImpl(rawUrl(`skills/${dir}/SKILL.md`), { headers: { Range: "bytes=0-1500" } });
      if (!res.ok) return null;
      const fm = parseFrontmatter(await res.text());
      return fm ? { name: fm.name, dir, description: fm.description } : null;
    }))).filter((s): s is CatalogSkill => s !== null);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), skills }));
    return skills;
  } catch (err) {
    if (cached) return cached.skills;
    throw err;
  }
}

/** Skills already installed in the given roots (e.g. ~/.claude/skills and <workspace>/.claude/skills). */
export function listLocal(roots: string[]): LocalSkill[] {
  const out: LocalSkill[] = [];
  for (const root of roots) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      try {
        const head = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8").slice(0, 2000);
        const fm = parseFrontmatter(head);
        if (fm) out.push({ name: fm.name, description: fm.description, dir });
      } catch { /* not a skill */ }
    }
  }
  return out;
}
