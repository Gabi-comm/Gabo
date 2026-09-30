import fs from "node:fs";
import path from "node:path";

const SKIP = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo", ".venv", "venv", "__pycache__",
  ".data", ".superpowers", ".cache", "test-results", "playwright-report",
]);
const MAX_SCANNED = 5000;
const MAX_DEPTH = 8;

/** Workspace files for `@` mentions: breadth-first (shallow files first), dependency and build folders skipped. */
function walk(root: string): string[] {
  const out: string[] = [];
  const queue: [string, number][] = [["", 0]];
  while (queue.length && out.length < MAX_SCANNED) {
    const [rel, depth] = queue.shift()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && depth < MAX_DEPTH) queue.push([child, depth + 1]);
      } else if (e.isFile()) {
        out.push(child);
        if (out.length >= MAX_SCANNED) break;
      }
    }
  }
  return out;
}

/** Ranked matches: file names that start with the query, then names that contain it, then paths that contain it. */
export function findFiles(root: string, query: string, limit = 20): string[] {
  const files = walk(root);
  const q = query.toLowerCase().replace(/\\/g, "/");
  if (!q) return files.slice(0, limit);
  const rank = (f: string) => {
    const lower = f.toLowerCase();
    const name = lower.slice(lower.lastIndexOf("/") + 1);
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (lower.includes(q)) return 2;
    return -1;
  };
  return files
    .map((f) => ({ f, r: rank(f) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.f.length - b.f.length || a.f.localeCompare(b.f))
    .slice(0, limit)
    .map((x) => x.f);
}
