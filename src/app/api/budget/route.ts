import { isBudgetMode } from "@/harness/budget";
import { loadBudget, saveBudget } from "@/server/budget";
import { rejectForeign } from "@/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json({ mode: loadBudget() });
}

export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  if (!isBudgetMode(body.mode)) return Response.json({ error: "Pick economy, balanced or max." }, { status: 400 });
  return Response.json({ mode: saveBudget(body.mode) });
}
