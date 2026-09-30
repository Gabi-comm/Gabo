import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { workspaceSkillsDir } from "./skills/install";

/** Jakeschincariol/arena-skill, vendored at a pinned commit (see vendor/idea-arena/UPSTREAM_SHA). */
export const VENDOR_DIR = path.join(process.cwd(), "vendor", "idea-arena");
const FILES = ["SKILL.md", "bracket.py", "strategies.json", "rubric.md", "LICENSE"];
export const QUICK_AGENTS = 16;

const active = new Map<string, number>();

/**
 * Installs the arena skill into <workspace>/.claude/skills/idea-arena. It is renamed from `arena`
 * because Gab's global skills already have a different `arena` (pstack). Writes the Idea Rubric as
 * idea-rubric.md next to rubric.md, and puts back an original rubric left behind by a crash.
 */
export function ensureIdeaArena(workspace: string, ideaRubric: string): string {
  const dir = path.join(workspaceSkillsDir(workspace), "idea-arena");
  fs.mkdirSync(dir, { recursive: true });
  const busy = (active.get(dir) ?? 0) > 0;
  for (const f of FILES) {
    if (busy && f === "rubric.md") continue;
    let content = fs.readFileSync(path.join(VENDOR_DIR, f), "utf8");
    if (f === "SKILL.md") content = content.replace(/^name: arena\s*$/m, "name: idea-arena");
    fs.writeFileSync(path.join(dir, f), content);
  }
  if (!busy) fs.rmSync(path.join(dir, "rubric.original.md"), { force: true });
  fs.writeFileSync(path.join(dir, "idea-rubric.md"), `${ideaRubric.trim()}\n`);
  return dir;
}

/**
 * The Emperor's swap from the spec: copy idea-rubric.md over rubric.md for the run, then swap the
 * original back so normal arena runs keep their rubric. Overlapping runs share one swap.
 */
export async function withIdeaRubric<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const rubric = path.join(dir, "rubric.md");
  const backup = path.join(dir, "rubric.original.md");
  const count = active.get(dir) ?? 0;
  if (count === 0) {
    fs.copyFileSync(rubric, backup);
    fs.copyFileSync(path.join(dir, "idea-rubric.md"), rubric);
  }
  active.set(dir, count + 1);
  try {
    return await run();
  } finally {
    const left = (active.get(dir) ?? 1) - 1;
    if (left === 0) {
      active.delete(dir);
      fs.copyFileSync(backup, rubric);
      fs.rmSync(backup, { force: true });
    } else {
      active.set(dir, left);
    }
  }
}

/** Blocks a bracket.py init bigger than --quick unless Gab confirmed a full run. */
export function arenaSizeGuard(command: string, fullConfirmed: boolean): string | null {
  if (fullConfirmed || !/bracket\.py["']?\s+(init|plan)\b/.test(command)) return null;
  if (/\s--quick\b/.test(command)) return null;
  const m = /--agents[=\s]+(\d+)/.exec(command);
  const n = m ? Number(m[1]) : 100;
  if (n <= QUICK_AGENTS) return null;
  return `Blocked: a ${n}-agent arena needs Gab to confirm a full run in the Arena tab (add --full to the message). Run --quick (${QUICK_AGENTS} agents) first.`;
}

export function parsePythonVersion(out: string): boolean {
  const m = /Python (\d+)\.(\d+)/.exec(out);
  return !!m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 8));
}

let pythonCmd: Promise<string | null> | null = null;

/** First of python3 / python / py -3 that reports Python ≥ 3.8, or null. Cached per server process. */
export function detectPython(): Promise<string | null> {
  const tryCmd = (cmd: string, args: string[]) =>
    new Promise<boolean>((resolve) =>
      execFile(cmd, [...args, "--version"], { timeout: 5000, windowsHide: true }, (err, stdout, stderr) =>
        resolve(!err && parsePythonVersion(`${stdout}${stderr}`))));
  pythonCmd ??= (async () => {
    for (const [cmd, args] of [["python3", []], ["python", []], ["py", ["-3"]]] as const) {
      if (await tryCmd(cmd, [...args])) return [cmd, ...args].join(" ");
    }
    return null;
  })();
  return pythonCmd;
}
