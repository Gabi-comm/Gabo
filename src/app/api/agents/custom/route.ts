import { rejectForeign } from "@/server/guard";
import { CUSTOM_AGENTS_FILE, createCustomAgent, deleteCustomAgent, loadCustomAgents, updateCustomAgent } from "@/server/customAgents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (err: unknown, status = 400) => Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(loadCustomAgents(CUSTOM_AGENTS_FILE));
}

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  try { return Response.json(createCustomAgent(CUSTOM_AGENTS_FILE, await req.json())); } catch (e) { return fail(e); }
}

export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") return fail("Need id.");
  try { return Response.json(updateCustomAgent(CUSTOM_AGENTS_FILE, body.id, body)); } catch (e) { return fail(e, /not found/.test(String(e)) ? 404 : 400); }
}

export async function DELETE(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Need ?id=");
  deleteCustomAgent(CUSTOM_AGENTS_FILE, id);
  return Response.json({ ok: true });
}
