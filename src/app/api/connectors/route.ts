import { rejectForeign } from "@/server/guard";
import { loadConnectors, publicConnectors, saveConnectors, type ConnectorsPatch } from "@/server/connectors";
import { getClaudeInfo } from "@/server/claudeInfo";
import { pluginAllowed } from "@/harness/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function view() {
  const c = loadConnectors();
  // Claude Code's own MCP servers (plugins, settings). claude.ai connectors need the Claude login.
  const info = await getClaudeInfo().catch(() => null);
  const servers = (info?.mcp ?? []).map((m) => ({ name: m.name, status: m.status, allowed: pluginAllowed(c, m.name), claudeAi: m.name.startsWith("claude.ai") }));
  return { ...publicConnectors(c), servers };
}

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(await view());
}

export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as ConnectorsPatch;
  try {
    saveConnectors(body);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  return Response.json(await view());
}
