// "Switch to Local LLM": run Claude Code against Ollama's Anthropic-compatible API instead of the Claude plan.

export interface LocalLlmConfig { enabled: boolean; baseUrl: string; model: string }

export const DEFAULT_LOCAL: LocalLlmConfig = { enabled: false, baseUrl: "http://127.0.0.1:11434", model: "" };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MODEL = /^[\w.:/-]{1,100}$/;

/** Null when fine. The endpoint must be on this machine: prompts and files go to it. */
export function validateLocal(c: LocalLlmConfig): string | null {
  let url: URL;
  try { url = new URL(c.baseUrl); } catch { return "The Ollama address must look like http://127.0.0.1:11434."; }
  if (!["http:", "https:"].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname)) return "Ollama must run on this machine (127.0.0.1 or localhost).";
  if (c.model && !MODEL.test(c.model)) return "The model name can use letters, numbers and . : / - only.";
  if (c.enabled && !c.model) return "Pick a model before switching on.";
  return null;
}

export function isLocalOn(c: LocalLlmConfig | undefined): c is LocalLlmConfig {
  return !!c && c.enabled && !!c.model && !validateLocal(c);
}

/**
 * Environment for the Claude Code process: Anthropic API calls go to Ollama with a dummy token, and every
 * model slot (main, subagents, the small background model) is the chosen local model.
 */
export function localEnv(c: LocalLlmConfig): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: c.baseUrl.replace(/\/+$/, ""),
    ANTHROPIC_AUTH_TOKEN: "ollama",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_MODEL: c.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: c.model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: c.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: c.model,
    CLAUDE_CODE_SUBAGENT_MODEL: c.model,
    // claude.ai connectors belong to a Claude login; a local model can't use them.
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
  };
}
