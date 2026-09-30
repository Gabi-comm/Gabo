import { AGENT_IDS, AGENTS, isAgentId } from "@/harness/agents";
import { loadSpec } from "@/harness/spec";
import { OVERRIDES_FILE, loadOverrides, resetOverride, saveOverride } from "@/harness/overrides";
import { rejectForeign } from "@/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function list() {
  const spec = loadSpec();
  const overrides = loadOverrides(OVERRIDES_FILE);
  return AGENT_IDS.map((id) => {
    const o = overrides[id];
    return {
      id,
      name: AGENTS[id].name,
      tagline: AGENTS[id].tagline,
      specPrompt: spec.agents[id],
      prompt: o?.prompt ?? spec.agents[id],
      goal: o?.goal ?? "",
      promptEdited: o?.prompt !== undefined,
      updatedAt: o?.updatedAt ?? null,
    };
  });
}

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(list());
}

export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; prompt?: unknown; goal?: unknown };
  if (!isAgentId(body.id)) return Response.json({ error: "Unknown agent." }, { status: 400 });
  const id = body.id;
  if (typeof body.prompt !== "string" || typeof body.goal !== "string") {
    return Response.json({ error: "Send prompt and goal as text." }, { status: 400 });
  }
  const specText = loadSpec().agents[id];
  // Saving the spec's own text (or nothing) means "use the default", not a custom copy of it.
  const same = body.prompt.replace(/\r\n/g, "\n").trim() === specText.trim();
  try {
    saveOverride(OVERRIDES_FILE, id, { prompt: same ? "" : body.prompt, goal: body.goal });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  return Response.json(list().find((a) => a.id === id));
}

export async function DELETE(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!isAgentId(id)) return Response.json({ error: "Unknown agent." }, { status: 400 });
  resetOverride(OVERRIDES_FILE, id);
  return Response.json(list().find((a) => a.id === id));
}
