import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { workspaceSkillsDir } from "./skills/install";

/** Jakeschincariol/arena-skill, vendored at a pinned commit (see vendor/idea-arena/UPSTREAM_SHA). */
export const VENDOR_DIR = path.join(process.cwd(), "vendor", "idea-arena");
const FILES = ["SKILL.md", "bracket.py", "strategies.json", "rubric.md", "LICENSE"];
export const QUICK_AGENTS = 16;

// On globalThis so a Next dev hot reload mid-run doesn't forget a swap is in progress.
const g = globalThis as unknown as { __gaboArenaActive?: Map<string, number> };
const active = (g.__gaboArenaActive ??= new Map<string, number>());

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
      if (fs.existsSync(backup)) {
        fs.copyFileSync(backup, rubric);
        fs.rmSync(backup, { force: true });
      }
    } else {
      active.set(dir, left);
    }
  }
}

export const MAX_AGENTS = 100;
const DEFAULT_AGENTS = 100;

/** Drops an unquoted `#` comment, so `--quick` written in a comment doesn't count. */
function stripComment(command: string): string {
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(command[i - 1]))) return command.slice(0, i);
  }
  return command;
}

function tokenize(segment: string): string[] {
  return [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/**
 * Blocks a bracket.py `init` bigger than --quick unless Gab confirmed a full run, and anything over
 * 100 either way. Reads the command the way argparse will: per shell segment, flags in any order,
 * the last `--agents` wins, comments ignored.
 */
export function arenaSizeGuard(command: string, fullConfirmed: boolean): string | null {
  for (const segment of stripComment(command).split(/&&|\|\||[;|\n]/)) {
    const tokens = tokenize(segment);
    const at = tokens.findIndex((t) => /bracket\.py$/.test(t));
    if (at === -1) continue;
    const args = tokens.slice(at + 1);
    if (!args.includes("init")) continue;
    let agents: number | undefined;
    args.forEach((t, j) => {
      if (t === "--agents") agents = Number(args[j + 1]);
      else if (t.startsWith("--agents=")) agents = Number(t.slice("--agents=".length));
    });
    const n = agents ?? (args.includes("--quick") ? QUICK_AGENTS : DEFAULT_AGENTS);
    if (!Number.isFinite(n) || n > MAX_AGENTS) return `Blocked: the arena is capped at ${MAX_AGENTS} agents.`;
    if (n > QUICK_AGENTS && !fullConfirmed) {
      return `Blocked: a ${n}-agent arena needs Gab to confirm a full run in the Arena tab (add --full to the message). Run --quick (${QUICK_AGENTS} agents) first.`;
    }
  }
  return null;
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
