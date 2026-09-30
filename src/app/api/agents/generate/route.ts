import { rejectForeign } from "@/server/guard";
import { generateBackdrop, generateCostume } from "@/server/generate";

export const runtime = "nodejs";

/** POST {what:"costume", description} or {what:"backdrop", name, prompt, goal}. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  if (body.what === "costume") {
    const description = str(body.description, 1000).trim();
    if (!description) return Response.json({ error: "Describe the mascot first." }, { status: 400 });
    return Response.json(await generateCostume(description));
  }
  if (body.what === "backdrop") {
    const input = { name: str(body.name, 60), prompt: str(body.prompt, 20_000), goal: str(body.goal, 4_000) };
    if (!input.prompt.trim() && !input.goal.trim()) return Response.json({ error: "Write the role or a goal first." }, { status: 400 });
    return Response.json(await generateBackdrop(input));
  }
  return Response.json({ error: "Unknown generator." }, { status: 400 });
}
