import { randomUUID } from "node:crypto";
import { isRoomId } from "@/harness/rooms";
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
import { loadLocal } from "@/server/localLlm";
import { loadBudget } from "@/server/budget";
import { appendUsage, recordRateLimit } from "@/server/usageLog";
import { FAKE, getWorkspace, sessions, validateWorkspace } from "@/server/config";
import { prepareSkills } from "@/server/skills";
import { activeBackend } from "@/server/backend";
import { loadConnectors } from "@/server/connectors";
import { getClaudeInfo } from "@/server/claudeInfo";
import { blockedServers, connectorNote, connectorRoots, connectorServers } from "@/harness/connectors";

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
  const local = loadLocal();
  const budget = loadBudget();
  const backend = activeBackend();
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
      const emit = (e: UiEvent) => {
        if (closed) return;
        if (e.type === "session") {
          runModel = e.model;
          if (!FAKE) sessions.upsert({ id: conversationId, sdkSessionId: e.sessionId });
        }
        // Usage for the Status page: plan meters from Claude Code, and a line per finished run.
        if (e.type === "rate_limit") { recordRateLimit(e.info); return; }
        if (e.type === "result") {
          appendUsage({ at: Date.now(), room, model: runModel, inputTokens: e.inputTokens, outputTokens: e.outputTokens, costUsd: e.costUsd });
        }
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; }
      };
      try {
        if (FAKE) {
          await fakeRun({
            room, prompt, emit, signal: abort.signal, prefs: parseRunPrefs(body.prefs), images, team, customAgents, local, budget,
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
          const skillsByAgent = await prepareSkills({ conversationId, room, prompt, workspace, firstTurn: !existing?.sdkSessionId, emit, signal: abort.signal, team, customAgents, offline: localOn });
          // Plugins connected on the Local LLM page: Gabo starts them itself, so they work on any account.
          const connectors = loadConnectors();
          const servers = { ...connectorServers(connectors), ...(ais.length ? { [AI_SERVER]: buildAiServer(ais) } : {}) };
          const notes = [ais.length ? aiSystemNote(ais) : undefined, connectorNote(connectors)].filter(Boolean).join("\n");
          // Local LLM: only the picked skills and the allowed MCP servers reach the model (docs/plan-local-llm-tools.md).
          const localSlim = localOn ? {
            skills: [...new Set([...Object.values(skillsByAgent).flat().filter((x): x is string => !!x), ...connectors.pinnedSkills])],
            blockedMcp: blockedServers(connectors, (await getClaudeInfo().catch(() => null))?.mcp.map((m) => m.name) ?? []),
          } : undefined;
          await runRoom({
            runId, conversationId, room, prompt, workspace, emit, signal: abort.signal,
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
