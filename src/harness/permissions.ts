import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Decision } from "./events";

import type { AskKind, Question } from "./events";

export interface PermissionAsk {
  tool: string;
  summary: string;
  input: Record<string, unknown>;
  kind?: AskKind;
  questions?: Question[];
  plan?: string;
}

interface Pending { runId: string; resolve: (d: Decision) => void; timer: ReturnType<typeof setTimeout> }

/**
 * Parks a canUseTool call until the browser answers it. Unanswered asks are denied after
 * the timeout so a closed tab never leaves a run hanging.
 */
export class PermissionBroker {
  private pending = new Map<string, Pending>();

  constructor(private timeoutMs = 10 * 60_000) {}

  request(runId: string, ask: PermissionAsk, onAsk: (req: { requestId: string } & PermissionAsk) => void): Promise<Decision> {
    const requestId = randomUUID();
    return new Promise<Decision>((resolve) => {
      const timer = setTimeout(() => this.settle(requestId, "deny"), this.timeoutMs);
      this.pending.set(requestId, { runId, resolve, timer });
      onAsk({ requestId, ...ask });
    });
  }

  resolve(requestId: string, decision: Decision): boolean {
    return this.settle(requestId, decision);
  }

  cancelRun(runId: string): void {
    for (const [id, p] of this.pending) if (p.runId === runId) this.settle(id, "deny");
  }

  private settle(requestId: string, decision: Decision): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(decision);
    return true;
  }
}

const g = globalThis as unknown as { __gaboBroker?: PermissionBroker; __gaboAnswers?: Map<string, Record<string, string>> };
/** One broker per server process; survives Next dev hot reloads. */
export const broker = (g.__gaboBroker ??= new PermissionBroker());
/** Gab's answers to AskUserQuestion, keyed by request id, picked up by canUseTool when the request resolves. */
export const pendingAnswers = (g.__gaboAnswers ??= new Map<string, Record<string, string>>());

const PATH_KEYS = ["file_path", "notebook_path", "path"] as const;

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(root, target));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Resolves junctions and symlinks on the part of the path that exists, so a link inside the
 * workspace that points elsewhere is judged by where it really goes.
 */
export function realPath(p: string): string {
  let head = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(p);
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

/** The fixed directory in front of the first wildcard of an absolute glob, e.g. `C:/Users/Gab/**` → `C:/Users/Gab`. */
function globRoot(pattern: string): string | null {
  if (!path.isAbsolute(pattern) && !/^[A-Za-z]:/.test(pattern)) return null;
  const firstWild = pattern.search(/[*?[{]/);
  const fixed = firstWild === -1 ? pattern : pattern.slice(0, firstWild);
  return fixed.replace(/[\\/][^\\/]*$/, "") || fixed;
}

/**
 * Hard lock for file tools: returns a deny reason when a path points outside the workspace
 * (read-only extra roots, like the skills folders, are allowed for reads).
 */
export function guardToolInput(
  tool: string,
  input: Record<string, unknown>,
  workspace: string,
  readRoots: string[] = [],
): string | null {
  const readOnly = tool === "Read" || tool === "Glob" || tool === "Grep";
  const candidates: string[] = [];
  for (const k of PATH_KEYS) {
    const v = input[k];
    if (typeof v === "string" && v !== "") candidates.push(v);
  }
  if (tool === "Glob" && typeof input.pattern === "string") {
    const root = globRoot(input.pattern);
    if (root) candidates.push(root);
  }
  const realWorkspace = realPath(workspace);
  for (const v of candidates) {
    const abs = realPath(path.resolve(workspace, v));
    if (isInside(realWorkspace, abs)) continue;
    if (readOnly && readRoots.some((r) => isInside(realPath(r), abs))) continue;
    return `${tool} blocked: ${abs} is outside the workspace ${workspace}`;
  }
  return null;
}

/** Key for "Yes, for this chat": the exact command for shell tools, the tool name otherwise. */
export function sessionRuleKey(tool: string, input: Record<string, unknown>): string {
  return tool === "Bash" || tool === "PowerShell" ? `${tool}:${String(input.command ?? "")}` : tool;
}
