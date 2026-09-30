import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Decision } from "./events";

export interface PermissionAsk { tool: string; summary: string; input: Record<string, unknown> }

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

const g = globalThis as unknown as { __gaboBroker?: PermissionBroker };
/** One broker per server process; survives Next dev hot reloads. */
export const broker = (g.__gaboBroker ??= new PermissionBroker());

const PATH_KEYS = ["file_path", "notebook_path", "path"] as const;

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(root, target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
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
  for (const k of PATH_KEYS) {
    const v = input[k];
    if (typeof v !== "string" || v === "") continue;
    const abs = path.resolve(workspace, v);
    if (isInside(workspace, abs)) continue;
    if (readOnly && readRoots.some((r) => isInside(r, abs))) continue;
    return `${tool} blocked: ${abs} is outside the workspace ${workspace}`;
  }
  return null;
}

/** Key for "Yes, for this session" — exact command for Bash, tool name otherwise. */
export function sessionRuleKey(tool: string, input: Record<string, unknown>): string {
  return tool === "Bash" ? `Bash:${String(input.command ?? "")}` : tool;
}
