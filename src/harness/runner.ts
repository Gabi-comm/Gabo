import os from "node:os";
import path from "node:path";
import type { AgentDefinition, CanUseTool, Options, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { AGENTS, type AgentId } from "./agents";
import { createMapper, type Decision, type UiEvent } from "./events";
import { broker as defaultBroker, guardToolInput, sessionRuleKey, type PermissionBroker, type PermissionAsk } from "./permissions";
import { rosterFor, workflowFor, type RoomId } from "./rooms";
import { loadSpec, type ParsedSpec } from "./spec";
import { loadOverrides, type AgentOverride, type Overrides } from "./overrides";
import { summarizeTool } from "./events";
import { QUICK_AGENTS, arenaSizeGuard, detectPython, ensureIdeaArena, withIdeaRubric } from "./arena";

export const SKILL_READ_ROOTS = [path.join(os.homedir(), ".claude", "skills")];

function agentPrompt(id: AgentId, spec: ParsedSpec, override?: AgentOverride): string {
  const parts = [
    `You are ${AGENTS[id].name}, one agent on Gab's team. Your role:`,
    override?.prompt ?? spec.agents[id],
  ];
  if (override?.goal) parts.push(`Gab's added goal for you: ${override.goal}`);
  if (id === "emperor") parts.push(spec.ideaRubric, spec.emperorUsage);
  parts.push("Skill rule (applies to you):", spec.skillScout);
  return parts.join("\n\n");
}

export interface BuildOptionsInput {
  room: RoomId;
  workspace: string;
  spec: ParsedSpec;
  sessionId?: string;
  skillsByAgent?: Partial<Record<AgentId, string[]>>;
  /** Room-specific run notes appended after the workflow (e.g. where the arena skill lives). */
  extraWorkflow?: string;
  /** Gab's prompt and goal edits from the Settings page. */
  overrides?: Overrides;
}

/** Everything a room run passes to query(), minus the live callbacks. */
export function buildOptions({ room, workspace, spec, sessionId, skillsByAgent = {}, extraWorkflow, overrides = {} }: BuildOptionsInput): Options {
  const agents: Record<string, AgentDefinition> = {};
  for (const id of rosterFor(room)) {
    agents[id] = {
      description: `${AGENTS[id].name}: ${AGENTS[id].tagline}`,
      prompt: agentPrompt(id, spec, overrides[id]),
      ...(skillsByAgent[id]?.length ? { skills: skillsByAgent[id] } : {}),
    };
  }
  const env: Record<string, string | undefined> = { ...process.env };
  // Runs on the logged-in Claude subscription; a stray API key would silently switch billing.
  delete env.ANTHROPIC_API_KEY;
  return {
    cwd: workspace,
    env,
    agents,
    resume: sessionId,
    includePartialMessages: true,
    forwardSubagentText: true,
    agentProgressSummaries: true,
    settingSources: ["user", "project"],
    permissionMode: "default",
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: [workflowFor(room), extraWorkflow, `The user is Gab. Workspace: ${workspace}`].filter(Boolean).join("\n"),
    },
  };
}

export interface CanUseToolCtx {
  runId: string;
  workspace: string;
  broker: PermissionBroker;
  sessionRules: Set<string>;
  onAsk: (req: { requestId: string } & PermissionAsk) => void;
}

export function makeCanUseTool({ runId, workspace, broker, sessionRules, onAsk }: CanUseToolCtx): CanUseTool {
  return async (tool, input): Promise<PermissionResult> => {
    const blocked = guardToolInput(tool, input, workspace, SKILL_READ_ROOTS);
    if (blocked) return { behavior: "deny", message: blocked };
    const rule = sessionRuleKey(tool, input);
    if (sessionRules.has(rule)) return { behavior: "allow", updatedInput: input };
    const decision = await broker.request(runId, { tool, summary: summarizeTool(tool, input), input }, onAsk);
    if (decision === "deny") return { behavior: "deny", message: "Gab denied this tool call." };
    if (decision === "allow_session") sessionRules.add(rule);
    return { behavior: "allow", updatedInput: input };
  };
}

const g = globalThis as unknown as { __gaboRules?: Map<string, Set<string>> };
const rulesByConversation = (g.__gaboRules ??= new Map());

export interface RunInput {
  runId: string;
  conversationId: string;
  room: RoomId;
  prompt: string;
  workspace: string;
  sessionId?: string;
  skillsByAgent?: Partial<Record<AgentId, string[]>>;
  /** Gab confirmed a full (more than --quick) arena run. */
  fullArena?: boolean;
  emit: (e: UiEvent) => void;
  signal: AbortSignal;
  /** Test seam; defaults to the Agent SDK's query(). */
  queryImpl?: typeof import("@anthropic-ai/claude-agent-sdk").query;
}

/** The hard checks every tool call passes through, whatever the permission rules say. */
export function preToolUseReason(tool: string, toolInput: Record<string, unknown>, workspace: string, fullArena: boolean): string | null {
  return guardToolInput(tool, toolInput, workspace, SKILL_READ_ROOTS)
    ?? (tool === "Bash" || tool === "PowerShell" ? arenaSizeGuard(String(toolInput.command ?? ""), fullArena) : null);
}

const LOGIN_HINT = "Open a terminal, run `claude`, then `/login` with your Pro/Max account.";

export async function runRoom(input: RunInput): Promise<void> {
  const { runId, conversationId, room, prompt, workspace, sessionId, skillsByAgent, fullArena = false, emit, signal } = input;
  // Esc can land while setup awaits (skill scout, SDK import, Python check); an abort before the
  // listener below is attached would otherwise be missed and the run would go on unseen.
  const stopped = () => {
    if (!signal.aborted) return false;
    emit({ type: "done" });
    return true;
  };
  if (stopped()) return;
  const query = input.queryImpl ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
  const spec = loadSpec();

  let arenaDir: string | null = null;
  let extraWorkflow: string | undefined;
  if (room === "arena") {
    const python = await detectPython();
    if (stopped()) return;
    if (!python) {
      emit({ type: "error", message: "The Arena needs Python 3.8 or newer to run bracket.py.", hint: "Install Python from python.org, then restart `npm run dev`." });
      emit({ type: "done" });
      return;
    }
    arenaDir = ensureIdeaArena(workspace, spec.ideaRubric);
    extraWorkflow = [
      `The idea-arena skill is installed at ${arenaDir}; its rubric.md is already the Idea Rubric for this run. Run bracket.py with \`${python}\` (not python3 if that differs).`,
      fullArena
        ? "Gab confirmed a full 100-agent run for this message."
        : `Use --quick (${QUICK_AGENTS} agents). A bigger run is blocked until Gab confirms one.`,
    ].join(" ");
  }
  const sessionRules = rulesByConversation.get(conversationId) ?? new Set<string>();
  rulesByConversation.set(conversationId, sessionRules);
  if (stopped()) return;
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  signal.addEventListener("abort", onAbort);

  const onAsk = (req: { requestId: string } & PermissionAsk) =>
    emit({ type: "permission_request", requestId: req.requestId, tool: req.tool, summary: req.summary });

  const options: Options = {
    ...buildOptions({ room, workspace, spec, sessionId, skillsByAgent, extraWorkflow, overrides: loadOverrides() }),
    abortController,
    canUseTool: makeCanUseTool({ runId, workspace, broker: defaultBroker, sessionRules, onAsk }),
    hooks: {
      // Reads outside the workspace are auto-allowed by the CLI and never reach canUseTool; lock them here.
      PreToolUse: [{
        hooks: [async (hookInput) => {
          const h = hookInput as { tool_name?: string; tool_input?: Record<string, unknown> };
          const reason = preToolUseReason(String(h.tool_name), h.tool_input ?? {}, workspace, fullArena);
          return reason
            ? { hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: reason } }
            : {};
        }],
      }],
    },
  };

  const map = createMapper();
  const stream = async () => {
    for await (const msg of query({ prompt, options })) {
      for (const e of map(msg as never)) emit(e);
    }
  };
  try {
    await (arenaDir ? withIdeaRubric(arenaDir, stream) : stream());
  } catch (err) {
    if (!signal.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      const auth = /login|auth|credential|401|not logged/i.test(message);
      const missing = /ENOENT|not found|spawn/i.test(message);
      emit({
        type: "error",
        message,
        hint: auth ? LOGIN_HINT : missing ? "The Claude Code CLI wasn't found. Install it, then run `claude` once." : undefined,
      });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    defaultBroker.cancelRun(runId);
    emit({ type: "done" });
  }
}

/* ---------- Fake mode (HARNESS_FAKE=1): scripted runs for UI tests, no subscription use ---------- */

export interface FakeRunInput {
  room: RoomId;
  prompt: string;
  emit: (e: UiEvent) => void;
  signal: AbortSignal;
  delayMs?: number;
  ask?: (tool: string, summary: string) => Promise<Decision>;
}

export async function fakeRun({ room, prompt, emit, signal, delayMs = 120, ask }: FakeRunInput): Promise<void> {
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  const step = async (e: UiEvent) => {
    if (signal.aborted) throw new Error("aborted");
    emit(e);
    if (delayMs) await wait();
  };
  try {
    await step({ type: "session", sessionId: "fake-session", model: "fake-model", cwd: "C:/fake/workspace" });
    const roster = rosterFor(room);
    const uiAgents = new Set<AgentId>(["designer", "tester"]);
    await step({
      type: "skills",
      lines: roster.map((agent) => uiAgents.has(agent)
        ? { agent, skills: ["web-design-guidelines"], why: agent === "designer" ? "design rules" : "audit the UI" }
        : { agent, skills: [], why: "" }),
      missing: roster.some((a) => uiAgents.has(a))
        ? [{ name: "web-design-guidelines", description: "Review UI code for Web Interface Guidelines compliance.", agents: roster.filter((a) => uiAgents.has(a)) }]
        : [],
    });
    if (/error/i.test(prompt)) {
      emit({ type: "error", message: "Claude Code process exited with code 1: not logged in", hint: LOGIN_HINT });
      return;
    }
    await step({ type: "tool_start", id: "f1", name: "Read", summary: "Read(README.md)", agent: null });
    await step({ type: "tool_result", id: "f1", ok: true, preview: "# Fake workspace\nNothing here yet.", lines: 2 });
    if (/write|build/i.test(prompt) && ask) {
      await step({ type: "tool_start", id: "f2", name: "Write", summary: "Write(notes.md)", agent: null });
      const decision = await ask("Write", "Write(notes.md)");
      await step({ type: "tool_result", id: "f2", ok: decision !== "deny", preview: decision === "deny" ? "Denied by Gab." : "Wrote 1 line.", lines: 1 });
    }
    for (const [i, agent] of roster.entries()) {
      const id = `a${i}`;
      await step({ type: "agent_start", agent, toolUseId: id, description: `${AGENTS[agent].verb.toLowerCase()} on: ${prompt.slice(0, 40)}` });
      for (const word of `${AGENTS[agent].name} reporting. `.split(/(?<= )/)) await step({ type: "text", delta: word, agent });
      await step({ type: "agent_stop", agent, toolUseId: id, ok: true });
    }
    for (const word of "Done. Fake run finished.".split(/(?<= )/)) await step({ type: "text", delta: word, agent: null });
    emit({ type: "result", ok: true, costUsd: 0, inputTokens: 1200, outputTokens: 340, durationMs: 1800 });
  } catch {
    /* aborted */
  } finally {
    emit({ type: "done" });
  }
}
