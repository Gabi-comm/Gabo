import fs from "node:fs";
import path from "node:path";
import { isInside } from "../permissions";
import { fetchTree, rawUrl, type CatalogSkill } from "./catalog";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function workspaceSkillsDir(workspace: string): string {
  return path.join(workspace, ".claude", "skills");
}

/**
 * Downloads each approved skill's folder from vercel-labs/agent-skills into
 * <workspace>/.claude/skills/<name>/ (project scope; the global skills folder is left alone).
 * Files land in a temp folder first so a failed download never leaves half a skill behind.
 */
export async function installSkills(names: string[], workspace: string, catalog: CatalogSkill[], fetchImpl: typeof fetch = fetch): Promise<string[]> {
  for (const n of names) {
    if (!SLUG.test(n)) throw new Error(`Invalid skill name: ${n}`);
    if (!catalog.some((c) => c.name === n)) throw new Error(`${n} is not in the catalog.`);
  }
  if (!names.length) return [];
  const tree = await fetchTree(fetchImpl);
  const root = workspaceSkillsDir(workspace);
  const installed: string[] = [];

  for (const name of names) {
    const { dir } = catalog.find((c) => c.name === name)!;
    const prefix = `skills/${dir}/`;
    const files = tree.filter((e) => e.type === "blob" && e.path.startsWith(prefix));
    const tmp = path.join(root, `.${name}.partial`);
    const dest = path.join(root, name);
    fs.rmSync(tmp, { recursive: true, force: true });
    try {
      for (const f of files) {
        const rel = f.path.slice(prefix.length);
        const target = path.resolve(tmp, rel);
        if (rel === "" || target === path.resolve(tmp) || !isInside(tmp, target)) {
          throw new Error(`Refusing ${f.path}: it points outside the skill folder.`);
        }
        const res = await fetchImpl(rawUrl(f.path));
        if (!res.ok) throw new Error(`Download failed for ${f.path} (${res.status}).`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
      }
      if (!fs.existsSync(path.join(tmp, "SKILL.md"))) throw new Error(`${name} has no SKILL.md.`);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);
      installed.push(name);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return installed;
}
