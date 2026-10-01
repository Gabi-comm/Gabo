import { rejectForeign } from "@/server/guard";
import { countTokens } from "@/server/translateProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return countTokens(req);
}
