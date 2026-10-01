import os from "node:os";
import { rejectForeign } from "@/server/guard";
import { loadLocal, modelDetails } from "@/server/localLlm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?model= → context window, tool support, and this computer's memory (for model advice). */
export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const model = new URL(req.url).searchParams.get("model") || loadLocal().model;
  const ramGb = Math.round(os.totalmem() / 1e9);
  if (!model) return Response.json({ ramGb, details: null });
  try {
    return Response.json({ ramGb, details: await modelDetails(loadLocal().baseUrl, model) });
  } catch (err) {
    return Response.json({ ramGb, details: null, error: err instanceof Error ? err.message : String(err) });
  }
}
