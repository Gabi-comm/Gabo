import fs from "node:fs";
import path from "node:path";
import { PRESETS, maskKey, validateProvider, type ProviderConfig } from "@/harness/providers";
import { DATA_DIR } from "./config";

/** API keys live here: .data/ is git-ignored and never sent to the browser. */
export const PROVIDERS_FILE = path.join(DATA_DIR, "ai-providers.json");

type Saved = Partial<Pick<ProviderConfig, "label" | "baseUrl" | "model" | "apiKey" | "enabled">>;

function readSaved(file: string): Record<string, Saved> {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Presets with Gab's saved settings on top. */
export function loadProviders(file = PROVIDERS_FILE): ProviderConfig[] {
  const saved = readSaved(file);
  return PRESETS.map((p) => ({ ...p, ...saved[p.id] }));
}

export interface ProviderPatch { label?: string; baseUrl?: string; model?: string; enabled?: boolean; apiKey?: string }

/** apiKey: undefined keeps the saved key, "" removes it. */
export function saveProvider(file: string, id: string, patch: ProviderPatch): ProviderConfig {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown provider: ${id}`);
  const all = readSaved(file);
  const next: Saved = { ...all[id] };
  if (patch.label !== undefined) next.label = patch.label.trim();
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl.trim();
  if (patch.model !== undefined) next.model = patch.model.trim();
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.apiKey !== undefined) {
    const key = patch.apiKey.trim();
    if (key) next.apiKey = key; else delete next.apiKey;
  }
  const merged = { ...preset, ...next };
  const problem = validateProvider(merged);
  if (problem) throw new Error(problem);
  all[id] = next;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, file);
  return merged;
}

export type PublicProvider = Omit<ProviderConfig, "apiKey"> & { hasKey: boolean; keyHint: string };

export function publicProviders(list: ProviderConfig[]): PublicProvider[] {
  return list.map(({ apiKey, ...rest }) => ({ ...rest, hasKey: !!apiKey, keyHint: maskKey(apiKey) }));
}
