// Which AI account runs Gabo's agents. Shared by the browser (Connect pop-up) and the server (runs).
//
// Anthropic does not allow third-party apps to offer claude.ai (subscription) login, and OpenAI and Google
// don't offer subscription login to other apps either, so people connect with their own API key.
// "claude-login" is the Claude Code login already on this computer: kept for the owner's existing install,
// never offered in the Connect pop-up.

export type BackendKind = "none" | "claude-login" | "claude-key" | "openai" | "gemini";
export type ProviderId = "claude" | "openai" | "gemini";

/** The three slots Gabo's budget uses (docs/token-budget.md): strong, standard and fast. */
export interface ModelTiers { opus: string; sonnet: string; haiku: string }

export interface ProviderInfo {
  id: ProviderId;
  kind: Exclude<BackendKind, "none" | "claude-login">;
  label: string;
  /** Where the user signs in and creates a key. */
  keyUrl: string;
  signIn: string;
  keyHint: string;
  keyPattern: RegExp;
  tiers: ModelTiers;
  note: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  claude: {
    id: "claude", kind: "claude-key", label: "Claude", keyUrl: "https://console.anthropic.com/settings/keys",
    signIn: "Sign in to the Claude Console", keyHint: "sk-ant-…", keyPattern: /^sk-ant-[\w-]{20,}$/,
    tiers: { opus: "opus", sonnet: "sonnet", haiku: "haiku" },
    note: "Runs natively: every Claude Code feature works.",
  },
  openai: {
    id: "openai", kind: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys",
    signIn: "Sign in to the OpenAI Platform", keyHint: "sk-…", keyPattern: /^sk-[\w-]{20,}$/,
    tiers: { opus: "gpt-5", sonnet: "gpt-5-mini", haiku: "gpt-5-nano" },
    note: "Runs through Gabo's built-in translator. Web search is not available.",
  },
  gemini: {
    id: "gemini", kind: "gemini", label: "Gemini", keyUrl: "https://aistudio.google.com/apikey",
    signIn: "Sign in to Google AI Studio", keyHint: "AIza…", keyPattern: /^[\w-]{30,}$/,
    tiers: { opus: "gemini-2.5-pro", sonnet: "gemini-2.5-flash", haiku: "gemini-2.5-flash-lite" },
    note: "Runs through Gabo's built-in translator. Web search is not available.",
  },
};

export const providerForKind = (kind: BackendKind): ProviderInfo | null =>
  Object.values(PROVIDERS).find((p) => p.kind === kind) ?? null;

const MODEL_NAME = /^[\w.:/-]{1,100}$/;

export function validTiers(t: Partial<ModelTiers> | undefined, fallback: ModelTiers): ModelTiers {
  const pick = (k: keyof ModelTiers) => (t?.[k] && MODEL_NAME.test(t[k]!.trim()) ? t[k]!.trim() : fallback[k]);
  return { opus: pick("opus"), sonnet: pick("sonnet"), haiku: pick("haiku") };
}

/** A Claude alias or full Claude name (from the status-line picker) mapped onto the provider's models. */
export function mapModel(requested: string, tiers: ModelTiers): string {
  const r = requested.toLowerCase();
  if (r === tiers.opus || r === tiers.sonnet || r === tiers.haiku) return requested;
  if (r.includes("opus")) return tiers.opus;
  if (r.includes("haiku")) return tiers.haiku;
  if (r.includes("sonnet") || r === "default" || r.startsWith("claude")) return tiers.sonnet;
  return requested;
}

export interface PublicBackend {
  kind: BackendKind;
  label: string;
  /** Masked keys only; real keys never leave the server. */
  keys: Partial<Record<ProviderId, string>>;
  tiers: Partial<Record<ProviderId, ModelTiers>>;
  /** Local LLM switch: when on, it overrides the connection. */
  local: { enabled: boolean; model: string };
}

export function backendLabel(kind: BackendKind): string {
  if (kind === "none") return "Not connected";
  if (kind === "claude-login") return "Claude Code login on this computer";
  return `${providerForKind(kind)!.label} API key`;
}
