import { activeBackend } from "./backend";

/**
 * One tool-less turn on the fast model of the connected account (Haiku on Claude, the fast tier on
 * OpenAI/Gemini, the local model when the Local LLM is on) for small bookkeeping jobs. Never saved to history.
 */
export async function askHaiku(prompt: string, timeoutMs = 45_000): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const active = activeBackend();
  if (active.problem) throw new Error(active.problem);
  const env = active.env;
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  let text = "";
  try {
    for await (const m of query({
      prompt,
      options: {
        model: "haiku", maxTurns: 1, env, abortController, settingSources: [], persistSession: false,
        systemPrompt: "You output JSON only. No prose.",
        canUseTool: async () => ({ behavior: "deny", message: "No tools for this job." }),
      },
    })) {
      if (m.type === "result" && m.subtype === "success") text = m.result;
    }
  } finally {
    clearTimeout(timer);
  }
  return text;
}

export function firstJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
