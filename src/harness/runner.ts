import os from "node:os";
import path from "node:path";
import type { AgentDefinition, CanUseTool, McpServerConfig, Options, PermissionResult, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { userContent, type ImageAttachment } from "./images";
import { AGENTS, isAgentId, type AgentKey } from "./agents";
import type { CustomAgent } from "./customAgents";
import { metaOf } from "./agentMeta";
import { createMapper, type Decision, type Question, type UiEvent } from "./events";
import { broker as defaultBroker, guardToolInput, pendingAnswers, sessionRuleKey, type PermissionBroker, type PermissionAsk } from "./permissions";
import { rosterFor, workflowFor, type RoomId } from "./rooms";
import { loadSpec, type ParsedSpec } from "./spec";
import { loadOverrides, type AgentOverride, type Overrides } from "./overrides";
import type { RunPrefs } from "./controls";
import { isLocalOn, localEnv, type LocalLlmConfig } from "./localLlm";
import { blockedTools, leadDefaults, profileFor, type BudgetMode } from "./budget";
import { summarizeTool } from "./events";
import { QUICK_AGENTS, arenaSizeGuard, detectPython, ensureIdeaArena, withIdeaRubric } from "./arena";

export const SKILL_READ_ROOTS = [path.join(os.homedir(), ".claude", "skills")];

function agentPrompt(id: AgentKey, spec: ParsedSpec, overrides: Overrides, customs: CustomAgent[], skills: string[], words: number): string | null {
  let parts: string[];
  if (isAgentId(id)) {
    const override: AgentOverride | undefined = overrides[id];
    parts = [`You are ${AGENTS[id].name}, one agent on Gab's team. Your role:`, override?.prompt ?? spec.agents[id]];
    if (override?.goal) parts.push(`Gab's added goal for you: ${override.goal}`);
    if (id === "emperor") parts.push(spec.ideaRubric, spec.emperorUsage);
  } else {
    const custom = customs.find((c) => c.id === id);
    if (!custom) return null;
    parts = [`You are ${custom.name}, an agent Gab made. Your role:`, custom.prompt];
    if (custom.goal) parts.push(`Gab's added goal for you: ${custom.goal}`);
  }
  // The server-side scout already applied the spec's skill rule; agents only get the result (no repo browsing).
  parts.push(skills.length
    ? `Skills picked for you: ${skills.join(", ")}. Load one with the Skill tool only when the task needs it.`
    : "No extra skills were picked for this task.");
  parts.push(`Output budget: at most ${words} words, in the sections your role asks for. The lead passes your output on as-is, so don't restate the task or repeat what others said.`);
  return parts.join("\n\n");
}

function describeAgent(id: AgentKey, customs: CustomAgent[]): string {
  if (isAgentId(id)) return `${AGENTS[id].name}: ${AGENTS[id].tagline}`;
  const c = customs.find((x) => x.id === id);
  return c ? `${c.name}: ${c.tagline || "an agent Gab made"}` : id;
}

export interface BuildOptionsInput {
  room: RoomId;
  workspace: string;
  spec: ParsedSpec;
  sessionId?: string;
  skillsByAgent?: Partial<Record<AgentKey, string[]>>;
  /** Laboratory: the team Gab picked. */
  team?: string[];
  /** Agents Gab made in Settings (needed when the roster includes them). */
  customAgents?: CustomAgent[];
  /** Room-specific run notes appended after the workflow (e.g. where the arena skill lives). */
  extraWorkflow?: string;
  /** Gab's prompt and goal edits from the Settings page. */
  overrides?: Overrides;
  /** Model, permission mode and effort picked in the status line. */
  prefs?: RunPrefs;
  /** Extra MCP servers for this run (e.g. gabo-ai: the other AIs from the Plugins page). */
  mcpServers?: Record<string, McpServerConfig>;
  /** "Switch to Local LLM": when on, everything runs on this Ollama model instead of the Claude plan. */
  local?: LocalLlmConfig;
  /** Economy / Balanced / Max quality: picks every agent's model and effort (docs/token-budget.md). */
  budget?: BudgetMode;
  /** The connected account's environment (src/server/backend.ts). Omitted: the Claude Code login. */
  env?: Record<string, string | undefined>;
  /** Local LLM only: the skills to list and the MCP servers to hide, to keep the prompt small. */
  localSlim?: LocalSlim;
  /** Folders besides the workspace the agents may use (e.g. the Obsidian vault). */
  extraRoots?: string[];
}

export interface LocalSlim { skills: string[]; blockedMcp: string[] }

/** Built-in tools a local model gets: the essentials, so the prompt fits a small context window. */
export const LOCAL_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Skill", "WebFetch"];
const LOCAL_NOTE = "You run on a small local model. Keep replies short. Use one agent at a time and only when needed; do not run the idea-arena tournament. Load a skill with the Skill tool only when the task needs it.";

/** Everything a room run passes to query(), minus the live callbacks. */
export function buildOptions({ room, workspace, spec, sessionId, skillsByAgent = {}, team, customAgents = [], extraWorkflow, overrides = {}, prefs = {}, mcpServers, local, budget = "balanced", env: backendEnv, localSlim, extraRoots = [] }: BuildOptionsInput): Options {
  const localOn = isLocalOn(local);
  const lead = leadDefaults(budget);
  const agents: Record<string, AgentDefinition> = {};
  for (const id of rosterFor(room, team)) {
    const custom = customAgents.find((c) => c.id === id);
    const profile = profileFor(id, budget, isAgentId(id) ? overrides[id] ?? {} : { model: custom?.model, effort: custom?.effort });
    const prompt = agentPrompt(id, spec, overrides, customAgents, skillsByAgent[id] ?? [], profile.words);
    if (!prompt) continue; // a custom agent that was deleted since the chat started
    const blocked = blockedTools(profile.tools);
    agents[id] = {
      description: describeAgent(id, customAgents),
      prompt,
      model: localOn ? local.model : profile.model,
      effort: profile.effort as AgentDefinition["effort"],
      maxTurns: profile.maxTurns,
      ...(blocked ? { disallowedTools: blocked } : {}),
    };
  }
  let env: Record<string, string | undefined>;
  if (backendEnv) env = backendEnv;
  else {
    env = { ...process.env };
    // Runs on the logged-in Claude subscription; a stray API key would silently switch billing.
    delete env.ANTHROPIC_API_KEY;
    if (localOn) Object.assign(env, localEnv(local));
  }
  const slim = localOn ? localSlim ?? { skills: [], blockedMcp: [] } : undefined;
  return {
    cwd: workspace,
    env,
    agents,
    resume: sessionId,
    includePartialMessages: true,
    forwardSubagentText: true,
    // Cosmetic one-line progress notes cost extra background model calls; off by default.
    agentProgressSummaries: false,
    // settingSources omitted = everything the CLI loads: user, project and local settings, CLAUDE.md, plugins, MCP.
    permissionMode: prefs.mode ?? "default",
    ...(mcpServers && Object.keys(mcpServers).length ? { mcpServers } : {}),
    ...(extraRoots.length ? { additionalDirectories: extraRoots } : {}),
    ...(slim ? {
      tools: room === "home" ? LOCAL_TOOLS : [...LOCAL_TOOLS, "Agent"],
      strictMcpConfig: true,
      // Instructions a small model tends to read back to the user instead of following.
      settings: { includeGitInstructions: false, includeCoAuthoredBy: false, attribution: { commit: "", pr: "" }, disableClaudeAiConnectors: true },
      skills: slim.skills,
      ...(slim.blockedMcp.length ? { disallowedTools: slim.blockedMcp } : {}),
    } : {}),
    model: localOn ? local.model : prefs.model || lead.model,
    effort: prefs.effort || lead.effort,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: [workflowFor(room, Object.keys(agents)), slim ? LOCAL_NOTE : undefined, extraWorkflow, `The user is Gab. Workspace: ${workspace}`].filter(Boolean).join("\n"),
    },
  };
}

export interface CanUseToolCtx {
  runId: string;
  workspace: string;
  extraRoots?: string[];
  broker: PermissionBroker;
  sessionRules: Set<string>;
  onAsk: (req: { requestId: string } & PermissionAsk) => void;
  /** Where /api/permission leaves AskUserQuestion answers. */
  answers?: Map<string, Record<string, string>>;
}

export function makeCanUseTool({ runId, workspace, extraRoots = [], broker, sessionRules, onAsk, answers = pendingAnswers }: CanUseToolCtx): CanUseTool {
  return async (tool, input): Promise<PermissionResult> => {
    // Claude asking Gab something: always shown, never covered by a "yes for this chat" rule.
    if (tool === "AskUserQuestion") {
      let requestId = "";
      const questions = (Array.isArray(input.questions) ? input.questions : []) as Question[];
      const decision = await broker.request(runId, { tool, summary: "Claude has a question", input, kind: "question", questions }, (req) => {
        requestId = req.requestId;
        onAsk(req);
      });
      const picked = answers.get(requestId);
      answers.delete(requestId);
      if (decision === "deny" || !picked) return { behavior: "deny", message: "Gab skipped the question. Continue with your best judgement or ask differently." };
      return { behavior: "allow", updatedInput: { ...input, answers: picked } };
    }
    // Plan approval, with the CLI's three choices.
    if (tool === "ExitPlanMode") {
      const plan = typeof input.plan === "string" ? input.plan : "";
      const decision = await broker.request(runId, { tool, summary: "Claude has a plan", input, kind: "plan", plan }, onAsk);
      if (decision === "deny") return { behavior: "deny", message: "Gab wants to keep planning. Refine the plan before editing anything." };
      const mode = decision === "allow_session" ? "acceptEdits" : "default";
      return { behavior: "allow", updatedInput: input, updatedPermissions: [{ type: "setMode", mode, destination: "session" }] };
    }
    const blocked = guardToolInput(tool, input, workspace, SKILL_READ_ROOTS, extraRoots);
    if (blocked) return { behavior: "deny", message: blocked };
    const rule = sessionRuleKey(tool, input);
    if (sessionRules.has(rule)) return { behavior: "allow", updatedInput: input };
    const decision = await broker.request(runId, { tool, summary: summarizeTool(tool, input), input }, onAsk);
    if (decision === "deny") return { behavior: "deny", message: "Gab denied this tool call." };
    if (decision === "allow_session") sessionRules.add(rule);
    return { behavior: "allow", updatedInput: input };
  };
}

const g = globalThis as unknown as { __gaboRules?: Map<string, Set<string>>; __gaboLive?: Map<string, Query> };
const rulesByConversation = (g.__gaboRules ??= new Map());
/** The running query per chat, so the status line can switch mode or model mid-run like the CLI. */
export const liveQueries = (g.__gaboLive ??= new Map<string, Query>());

export interface RunInput {
  runId: string;
  conversationId: string;
  room: RoomId;
  prompt: string;
  workspace: string;
  sessionId?: string;
  skillsByAgent?: Partial<Record<AgentKey, string[]>>;
  /** Laboratory team, and the custom agents that may be on it. */
  team?: string[];
  customAgents?: CustomAgent[];
  /** "Switch to Local LLM" settings. */
  local?: LocalLlmConfig;
  /** Economy / Balanced / Max quality (docs/token-budget.md). */
  budget?: BudgetMode;
  /** The connected account's environment, the Local LLM's slim profile and extra folders. */
  env?: Record<string, string | undefined>;
  localSlim?: LocalSlim;
  extraRoots?: string[];
  /** Gab confirmed a full (more than --quick) arena run. */
  fullArena?: boolean;
  /** Model, permission mode and effort picked in the status line. */
  prefs?: RunPrefs;
  /** Images pasted into the message. */
  images?: ImageAttachment[];
  /** Extra MCP servers and a note about them for the lead (Plugins page AIs). */
  mcpServers?: Record<string, McpServerConfig>;
  systemNote?: string;
  emit: (e: UiEvent) => void;
  signal: AbortSignal;
  /** Test seam; defaults to the Agent SDK's query(). */
  queryImpl?: typeof import("@anthropic-ai/claude-agent-sdk").query;
}

/** The hard checks every tool call passes through, whatever the permission rules say. */
export function preToolUseReason(tool: string, toolInput: Record<string, unknown>, workspace: string, fullArena: boolean, extraRoots: string[] = []): string | null {
  return guardToolInput(tool, toolInput, workspace, SKILL_READ_ROOTS, extraRoots)
    ?? (tool === "Bash" || tool === "PowerShell" ? arenaSizeGuard(String(toolInput.command ?? ""), fullArena) : null);
}

const LOGIN_HINT = "Open a terminal, run `claude`, then `/login` with your Pro/Max account.";

export async function runRoom(input: RunInput): Promise<void> {
  const { runId, conversationId, room, prompt, workspace, sessionId, skillsByAgent, fullArena = false, prefs, images = [], mcpServers, systemNote, team, customAgents = [], local, budget, env, localSlim, extraRoots = [], emit, signal } = input;
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
    emit({
      type: "permission_request", requestId: req.requestId, tool: req.tool, summary: req.summary,
      ...(req.kind ? { kind: req.kind } : {}), ...(req.questions ? { questions: req.questions } : {}), ...(req.kind === "plan" ? { plan: req.plan ?? "" } : {}),
    });

  const options: Options = {
    ...buildOptions({ room, workspace, spec, sessionId, skillsByAgent, extraWorkflow: [extraWorkflow, systemNote].filter(Boolean).join("\n") || undefined, overrides: loadOverrides(), prefs, mcpServers, team, customAgents, local, budget, env, localSlim, extraRoots }),
    abortController,
    canUseTool: makeCanUseTool({ runId, workspace, extraRoots, broker: defaultBroker, sessionRules, onAsk }),
    hooks: {
      // Reads outside the workspace are auto-allowed by the CLI and never reach canUseTool; lock them here.
      PreToolUse: [{
        hooks: [async (hookInput) => {
          const h = hookInput as { tool_name?: string; tool_input?: Record<string, unknown> };
          const reason = preToolUseReason(String(h.tool_name), h.tool_input ?? {}, workspace, fullArena, extraRoots);
          return reason
            ? { hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: reason } }
            : {};
        }],
      }],
    },
  };

  // Subagents on this run's roster (built-in or custom) get their own mascot in the transcript.
  const roster = new Set<string>(Object.keys(options.agents ?? {}));
  const map = createMapper((id) => typeof id === "string" && roster.has(id));
  const stream = async () => {
    // With images the message goes in as content blocks (one streamed user message), like a pasted screenshot.
    async function* withImages(): AsyncGenerator<SDKUserMessage> {
      const content = userContent(prompt, images).filter((b) => b.type !== "text" || b.text.trim() !== "");
      yield { type: "user", message: { role: "user", content: content as never }, parent_tool_use_id: null, session_id: sessionId ?? "" } as SDKUserMessage;
    }
    const live = query({ prompt: images.length ? withImages() : prompt, options });
    liveQueries.set(conversationId, live);
    for await (const msg of live) {
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
    if (liveQueries.get(conversationId)) liveQueries.delete(conversationId);
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
  ask?: (tool: string, summary: string, extra?: Pick<PermissionAsk, "kind" | "questions" | "plan">) => Promise<{ decision: Decision; answers?: Record<string, string> }>;
  prefs?: RunPrefs;
  images?: ImageAttachment[];
  team?: string[];
  customAgents?: CustomAgent[];
  local?: LocalLlmConfig;
  budget?: BudgetMode;
}

export async function fakeRun({ room, prompt, emit, signal, delayMs = 120, ask, prefs = {}, images = [], team, customAgents = [], local, budget = "balanced" }: FakeRunInput): Promise<void> {
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  const step = async (e: UiEvent) => {
    if (signal.aborted) throw new Error("aborted");
    emit(e);
    if (delayMs) await wait();
  };
  try {
    await step({ type: "session", sessionId: "fake-session", model: "fake-model", cwd: "C:/fake/workspace" });
    await step({ type: "notice", text: `Run settings: mode ${prefs.mode ?? "default"}, model ${isLocalOn(local) ? `${local.model} (local)` : prefs.model ?? "default"}, effort ${prefs.effort ?? "auto"}, budget ${budget}` });
    if (images.length) await step({ type: "notice", text: `Received ${images.length} image${images.length === 1 ? "" : "s"} (${images.map((i) => i.mediaType).join(", ")}).` });
    const roster = rosterFor(room, team).filter((a) => isAgentId(a) || customAgents.some((c) => c.id === a));
    const uiAgents = new Set<AgentKey>(["designer", "tester"]);
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
      await step({ type: "tool_start", id: "f2", name: "Write", summary: "Write(notes.md)", agent: null, diff: { path: "notes.md", added: "# Notes\nFirst line" } });
      const { decision } = await ask("Write", "Write(notes.md)");
      await step({ type: "tool_result", id: "f2", ok: decision !== "deny", preview: decision === "deny" ? "Denied by Gab." : "Wrote 1 line.", lines: 1 });
    }
    if (/todo/i.test(prompt)) {
      await step({ type: "tool_start", id: "td", name: "TodoWrite", summary: "Update Todos", agent: null, todos: [
        { content: "Read the code", status: "completed" }, { content: "Fix the bug", status: "in_progress" }, { content: "Add a test", status: "pending" },
      ] });
    }
    if (/ask me/i.test(prompt) && ask) {
      const questions = [{ question: "Which database?", header: "DB", multiSelect: false, options: [{ label: "Postgres", description: "Relational" }, { label: "SQLite", description: "One file" }] }];
      const { decision, answers } = await ask("AskUserQuestion", "Claude has a question", { kind: "question", questions });
      await step({ type: "notice", text: decision === "deny" ? "Question skipped." : `Answers: ${JSON.stringify(answers ?? {})}` });
    }
    if (/make a plan/i.test(prompt) && ask) {
      const { decision } = await ask("ExitPlanMode", "Claude has a plan", { kind: "plan", plan: "## Plan\n1. Add tests\n2. Fix the bug" });
      if (decision === "allow_session") await step({ type: "mode", mode: "acceptEdits" });
      await step({ type: "notice", text: decision === "deny" ? "Keeps planning." : "Plan approved." });
    }
    for (const [i, agent] of roster.entries()) {
      const id = `a${i}`;
      const meta = metaOf(agent, customAgents);
      await step({ type: "agent_start", agent, toolUseId: id, description: `${meta.verb.toLowerCase()} on: ${prompt.slice(0, 40)}` });
      for (const word of `${meta.name} reporting. `.split(/(?<= )/)) await step({ type: "text", delta: word, agent });
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
