import { rejectForeign } from "@/server/guard";
import { messages } from "@/server/translateProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Claude Code (running on an OpenAI or Gemini key) sends Anthropic requests here; see src/harness/translate.ts. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return messages(req);
}
