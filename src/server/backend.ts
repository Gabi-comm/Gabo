import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PROVIDERS, backendLabel, providerForKind, validTiers, type BackendKind, type ModelTiers, type ProviderId, type PublicBackend } from "@/harness/backend";
import { isLocalOn, localEnv } from "@/harness/localLlm";
import { maskKey } from "@/harness/providers";
import { DATA_DIR, FAKE } from "./config";
import { loadLocal } from "./localLlm";

/** Keys live here: .data/ is git-ignored and keys are never sent to the browser. */
export const BACKEND_FILE = path.join(DATA_DIR, "backend.json");

interface Saved {
  kind?: BackendKind;
  keys?: Partial<Record<ProviderId, string>>;
  tiers?: Partial<Record<ProviderId, Partial<ModelTiers>>>;
}

const KINDS: BackendKind[] = ["none", "claude-login", "claude-key", "openai", "gemini"];

function read(file: string): Saved {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

function write(file: string, s: Saved) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * The saved connection. An install that already has chats (the owner's, made before Connect existed)
 * keeps using its Claude Code login; a fresh install starts unconnected and gets the Connect pop-up.
 */
export function loadKind(file = BACKEND_FILE): BackendKind {
  const s = read(file);
  if (s.kind && KINDS.includes(s.kind)) return s.kind;
  if (FAKE || fs.existsSync(path.join(path.dirname(file), "sessions.json"))) return "claude-login";
  return "none";
}

export function tiersFor(id: ProviderId, file = BACKEND_FILE): ModelTiers {
  return validTiers(read(file).tiers?.[id], PROVIDERS[id].tiers);
}

export function keyFor(id: ProviderId, file = BACKEND_FILE): string {
  return read(file).keys?.[id] ?? "";
}

export interface ConnectInput { provider: ProviderId; apiKey?: string; tiers?: Partial<ModelTiers> }

/** Saves a provider key (and models) and makes it the connection. apiKey undefined keeps the saved key. */
export function saveConnection(input: ConnectInput, file = BACKEND_FILE): void {
  const p = PROVIDERS[input.provider];
  if (!p) throw new Error("Pick Claude, OpenAI or Gemini.");
  const s = read(file);
  const key = input.apiKey?.trim();
  if (key !== undefined && key !== "" && !p.keyPattern.test(key)) throw new Error(`That doesn't look like a ${p.label} API key (${p.keyHint}).`);
  const keys = { ...s.keys, ...(key ? { [input.provider]: key } : {}) };
  if (!keys[input.provider]) throw new Error(`Paste your ${p.label} API key.`);
  const tiers = { ...s.tiers, [input.provider]: validTiers(input.tiers, p.tiers) };
  write(file, { ...s, kind: p.kind, keys, tiers });
}

/** Forget the connection (keys stay unless removed); the Connect pop-up shows again. */
export function disconnect(removeKeys = false, file = BACKEND_FILE): void {
  const s = read(file);
  write(file, { ...s, kind: "none", ...(removeKeys ? { keys: {} } : {}) });
}

export function publicBackend(file = BACKEND_FILE): PublicBackend {
  const s = read(file);
  const kind = loadKind(file);
  const local = loadLocal();
  const keys: PublicBackend["keys"] = {};
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) if (s.keys?.[id]) keys[id] = maskKey(s.keys[id]);
  const tiers: PublicBackend["tiers"] = {};
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) tiers[id] = tiersFor(id, file);
  return { kind, label: backendLabel(kind), keys, tiers, local: { enabled: isLocalOn(local), model: local.model } };
}

/* ---------- The environment every Claude Code process gets ---------- */

const g = globalThis as unknown as { __gaboTranslateSecret?: string; __gaboHost?: string };

/** Claude Code authenticates to /api/translate with this; it changes on every server start. */
export function translateSecret(): string {
  return (g.__gaboTranslateSecret ??= randomBytes(24).toString("hex"));
}

/** The guard records the Host of local requests so child processes can call back into this server. */
export function rememberHost(host: string) {
  if (host) g.__gaboHost = host;
}

function selfOrigin(): string {
  return `http://${g.__gaboHost ?? `127.0.0.1:${process.env.PORT ?? 3217}`}`;
}

export type ActiveKind = BackendKind | "local";

export interface Active {
  kind: ActiveKind;
  label: string;
  /** Full environment for the Claude Code process (replaces process.env). */
  env: Record<string, string | undefined>;
  /** Null when runs can go ahead. */
  problem: string | null;
}

/** What a run uses right now: the Local LLM switch first, then the saved connection. */
export function activeBackend(file = BACKEND_FILE, local = loadLocal()): Active {
  const base: Record<string, string | undefined> = { ...process.env };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN"]) delete base[k];

  if (isLocalOn(local)) return { kind: "local", label: `Local LLM · ${local.model}`, env: { ...base, ...localEnv(local) }, problem: null };

  const kind = loadKind(file);
  if (kind === "none") {
    return { kind, label: backendLabel(kind), env: base, problem: "Connect an AI first: press Connect in the pop-up (or on the Connect page), or switch on a Local LLM." };
  }
  if (kind === "claude-login") return { kind, label: backendLabel(kind), env: base, problem: null };

  const p = providerForKind(kind)!;
  const key = keyFor(p.id, file);
  if (!key) return { kind, label: backendLabel(kind), env: base, problem: `Your ${p.label} key is missing. Connect again.` };
  if (kind === "claude-key") return { kind, label: backendLabel(kind), env: { ...base, ANTHROPIC_API_KEY: key }, problem: null };

  const t = tiersFor(p.id, file);
  return {
    kind,
    label: backendLabel(kind),
    problem: null,
    env: {
      ...base,
      ANTHROPIC_BASE_URL: `${selfOrigin()}/api/translate/${kind}`,
      ANTHROPIC_AUTH_TOKEN: translateSecret(),
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_MODEL: t.sonnet,
      ANTHROPIC_DEFAULT_OPUS_MODEL: t.opus,
      ANTHROPIC_DEFAULT_SONNET_MODEL: t.sonnet,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: t.haiku,
      ANTHROPIC_SMALL_FAST_MODEL: t.haiku,
    },
  };
}
