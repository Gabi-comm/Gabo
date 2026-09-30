import { installSkills } from "@/harness/skills/install";
import { fetchCatalog } from "@/harness/skills/catalog";
import { rejectForeign } from "@/server/guard";
import { FAKE, getWorkspace } from "@/server/config";
import { CATALOG_CACHE } from "@/server/skills";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const names = body.names;
  if (!Array.isArray(names) || names.length === 0 || names.length > 10 || !names.every((n) => typeof n === "string")) {
    return Response.json({ error: "Send 1 to 10 skill names." }, { status: 400 });
  }
  if (FAKE) return Response.json({ installed: names });
  try {
    const catalog = await fetchCatalog({ cacheFile: CATALOG_CACHE });
    const installed = await installSkills(names, getWorkspace(), catalog);
    return Response.json({ installed });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
