import { randomUUID } from "node:crypto";
import { broker, pendingAnswers } from "@/harness/permissions";
import { fakeRun, runRoom } from "@/harness/runner";
import type { UiEvent } from "@/harness/events";
import { rejectForeign } from "@/server/guard";
import { parseRunPrefs } from "@/harness/controls";
import { checkImages, type ImageAttachment } from "@/harness/images";
import { usableProviders } from "@/harness/providers";
import { AI_SERVER, aiSystemNote, buildAiServer } from "@/harness/aiTools";
import { loadProviders } from "@/server/providers";
import { loadCustomAgents } from "@/server/customAgents";
import { loadLocal, modelDetails, prepareModel, saveLocal } from "@/server/localLlm";
import { loadBudget, loadHooks } from "@/server/budget";
import { logRun, recordRateLimit } from "@/server/usageLog";
import { FAKE, getWorkspace, sessions, validateWorkspace } from "@/server/config";
import { prepareSkills } from "@/server/skills";
import { makeHeaderFilter } from "@/harness/localFilter";
import { routePrompt, tierTag } from "@/harness/router";
import { recordOverride, roomBias } from "@/server/routerFeedback";
import { makePersonaSplitter } from "@/harness/personaSplit";
import { isRoomId, isTeamRoom, rosterFor } from "@/harness/rooms";
import { AGENTS, isAgentId } from "@/harness/agents";
import { activeBackend } from "@/server/backend";
import { loadConnectors } from "@/server/connectors";
import { mcpConfigs } from "@/server/claudeInfo";
import { connectorNote, connectorRoots, connectorServers, neededContext, pluginAllowed } from "@/harness/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPT = 100_000;
const g = globalThis as unknown as { __gaboActive?: Set<string> };
const active = (g.__gaboActive ??= new Set());

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;

  let body: { conversationId?: unknown; room?: unknown; prompt?: unknown; full?: unknown; prefs?: unknown; images?: unknown; team?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const { conversationId, room, prompt } = body;
  if (typeof conversationId !== "string" || !/^[\w-]{1,64}$/.test(conversationId)) {
    return Response.json({ error: "Bad conversationId." }, { status: 400 });
  }
  if (!isRoomId(room)) return Response.json({ error: "Unknown room." }, { status: 400 });
  const customAgents = loadCustomAgents();
  let local = loadLocal();
  const budget = loadBudget();
  let backend = activeBackend();
  if (backend.problem) return Response.json({ error: backend.problem }, { status: 409 });
  if (room.startsWith("agent:x-") && !customAgents.some((a) => `agent:${a.id}` === room)) {
    return Response.json({ error: "That agent was deleted." }, { status: 404 });
  }
  const askedTeam = Array.isArray(body.team) ? body.team.filter((t): t is string => typeof t === "string").slice(0, 24) : undefined;
  const imageError = checkImages(body.images);
  if (imageError) return Response.json({ error: imageError }, { status: 400 });
  const images = (body.images ?? []) as ImageAttachment[];
  if (typeof prompt !== "string" || (prompt.trim() === "" && images.length === 0)) return Response.json({ error: "Say something first." }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return Response.json({ error: `Prompt is over ${MAX_PROMPT.toLocaleString()} characters.` }, { status: 413 });
  if (active.has(conversationId)) return Response.json({ error: "A run is already going in this chat." }, { status: 409 });

  // Workspace rooms on a strong model: pick how much team the prompt needs (docs/plan-faster-replies.md §1).
  // Local models can't write several roles well, so they keep real agents one at a time.
  const route = isTeamRoom(room) && backend.kind !== "local" ? routePrompt(prompt, room, images.length, roomBias(room)) : null;
  // --deep / --lite (and "Redo with real agents") are corrections: the router leans with them next time.
  if (route && /(^|\s)--(deep|lite)\b/i.test(prompt)) recordOverride(room, route.tier === "deep" ? "deep" : "lite");
  // The tier rides on the message (after the cached prefix), not in the system prompt.
  const runPrompt = route ? `${tierTag(route.tier)} ${route.prompt}` : prompt;

  active.add(conversationId);
  const existing = sessions.get(conversationId);
  // The Laboratory team is fixed per chat: first message sets it, later messages reuse it.
  const team = room === "laboratory" ? (existing?.team ?? askedTeam ?? []) : undefined;
  const record = existing ?? sessions.upsert({ id: conversationId, room, title: prompt.trim().slice(0, 60) || "Image", ...(team ? { team } : {}) });
  const runId = randomUUID();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let runModel = local.enabled ? local.model : "";
      let runSession: string | null = null;
      // Reply speed for Status → Analytics: when the first words arrived, and when the run ended.
      const runStart = Date.now();
      let firstTokenAt = 0;
      const headerFilter = backend.kind === "local" ? makeHeaderFilter() : null;
      // Team in one reply: the lead's `### <agent>` turns become agent blocks.
      const splitter = route && route.tier !== "deep"
        ? makePersonaSplitter(rosterFor(room, team).map((id) => ({
            id,
            names: isAgentId(id) ? [AGENTS[id].name] : [customAgents.find((c) => c.id === id)?.name ?? id],
          })))
        : null;
      const emit = (raw: UiEvent) => {
        if (closed) return;
        const filtered = headerFilter ? headerFilter(raw) : [raw];
        for (const e of filtered) for (const out of splitter ? splitter.push(e) : [e]) send(out);
      };
      const send = (e: UiEvent) => {
        if (!firstTokenAt && e.type === "text" && e.delta) firstTokenAt = Date.now();
        if (e.type === "session") {
          runModel = e.model;
          runSession = e.sessionId;
          if (!FAKE) sessions.upsert({ id: conversationId, sdkSessionId: e.sessionId });
        }
        // Usage for the Status page: plan meters from Claude Code, and a line per finished run.
        if (e.type === "rate_limit") { recordRateLimit(e.info); return; }
        if (e.type === "result") {
          logRun({
            at: Date.now(), room, model: runModel, sessionId: FAKE ? null : runSession, resumed: !!existing?.sdkSessionId,
            total: e.tokens,
            turn: e.turnTokens ?? { input: e.inputTokens, output: e.outputTokens, cacheRead: 0, cacheWrite: 0, costUsd: e.costUsd },
            durationMs: Date.now() - runStart,
            ...(firstTokenAt ? { ttftMs: firstTokenAt - runStart } : {}),
          });
        }
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; }
      };
      try {
        if (route && route.tier !== "deep") {
          emit({ type: "tier", tier: route.tier, reason: route.reason, prompt: route.prompt });
        }
        if (FAKE) {
          await fakeRun({
            tier: route?.tier,
            room, prompt: runPrompt, emit, signal: abort.signal, prefs: parseRunPrefs(body.prefs), images, team, customAgents, local, budget,
            ask: async (tool, summary, extra = {}) => {
              let requestId = "";
              const decision = await broker.request(runId, { tool, summary, input: {}, ...extra }, (r) => {
                requestId = r.requestId;
                emit({ type: "permission_request", requestId: r.requestId, tool, summary, ...extra });
              });
              const answers = pendingAnswers.get(requestId);
              pendingAnswers.delete(requestId);
              return { decision, answers };
            },
          });
        } else {
          // A Claude Code session opened from history keeps running in its own project folder.
          const own = record.cwd ? validateWorkspace(record.cwd) : null;
          const workspace = own?.ok ? own.path : getWorkspace();
          // Other AIs from the Plugins page, as tools Claude can call (each call still asks Gab).
          const ais = usableProviders(loadProviders());
          const localOn = backend.kind === "local";
          const connectors = loadConnectors();
          // Local LLM: strict MCP, so only these servers load: Claude Code plugins Gab ticked, plus Gabo's own.
          const allowedPlugins = localOn
            ? Object.fromEntries(Object.entries(await mcpConfigs()).filter(([name]) => pluginAllowed(connectors, name)))
            : {};
          if (localOn) {
            // A model on a window smaller than Gabo's prompt only sees its end and answers nonsense; give it a
            // big enough window once (a copy, made in seconds) and use that from now on.
            const need = neededContext(Object.keys(allowedPlugins).length);
            const details = await modelDetails(local.baseUrl, local.model).catch(() => null);
            if (details && (details.contextWindow ?? 0) < need) {
              const prepared = await prepareModel(local.baseUrl, local.model, need);
              emit({ type: "notice", text: `${local.model} only read ${details.contextWindow ? details.contextWindow.toLocaleString() : "about 4,000"} tokens, less than Gabo's prompt, so Gabo made ${prepared} with a ${need / 1024}k window and switched to it.` });
              local = saveLocal({ model: prepared });
              backend = activeBackend();
              runModel = local.model;
            }
          }
          // Quick replies open no subagents, so there is nothing to pick skills for.
          const skillsByAgent = route?.tier === "quick" ? {} : await prepareSkills({ conversationId, room, prompt: runPrompt, workspace, firstTurn: !existing?.sdkSessionId, emit, signal: abort.signal, team, customAgents, offline: localOn });
          // Plugins connected on the Local LLM page: Gabo starts them itself, so they work on any account.
          const servers = { ...allowedPlugins, ...connectorServers(connectors), ...(ais.length ? { [AI_SERVER]: buildAiServer(ais) } : {}) };
          const notes = [ais.length ? aiSystemNote(ais) : undefined, connectorNote(connectors)].filter(Boolean).join("\n");
          // Local LLM: only the picked skills and the allowed MCP servers reach the model (docs/plan-local-llm-tools.md).
          const localSlim = localOn ? {
            skills: [...new Set([...Object.values(skillsByAgent).flat().filter((x): x is string => !!x), ...connectors.pinnedSkills])],
            blockedMcp: [],
          } : undefined;
          await runRoom({
            runId, conversationId, room, prompt: runPrompt, workspace, emit, signal: abort.signal, tier: route?.tier, userHooks: loadHooks(),
            sessionId: record.sdkSessionId, skillsByAgent, fullArena: body.full === true, prefs: parseRunPrefs(body.prefs), images, team, customAgents, local, budget,
            env: backend.env, localSlim, extraRoots: connectorRoots(connectors),
            ...(Object.keys(servers).length ? { mcpServers: servers } : {}),
            ...(notes ? { systemNote: notes } : {}),
          });
        }
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
        emit({ type: "done" });
      } finally {
        active.delete(conversationId);
        broker.cancelRun(runId);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
