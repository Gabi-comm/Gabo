import { rejectForeign } from "@/server/guard";
import { loadLocal, prepareModel, saveLocal } from "@/server/localLlm";

export const runtime = "nodejs";

/** POST { model, numCtx } → makes `<model>-gabo-<n>k` with a bigger context window and selects it. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const config = loadLocal();
  const model = typeof body.model === "string" && body.model ? body.model : config.model;
  const numCtx = [16384, 24576, 32768, 65536].includes(body.numCtx) ? body.numCtx : 32768;
  if (!model) return Response.json({ error: "Pick a model first." }, { status: 400 });
  try {
    const name = await prepareModel(config.baseUrl, model, numCtx);
    const saved = saveLocal({ model: name });
    return Response.json({ model: name, config: saved });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
