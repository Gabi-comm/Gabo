"use client";

import { useCallback, useEffect, useState } from "react";
import { isMode, type Effort, type Mode, type RunPrefs } from "@/harness/controls";

export interface ClaudeInfo {
  commands: { name: string; description: string; argumentHint: string }[];
  models: { value: string; displayName: string; description: string }[];
  mcp: { name: string; status: string; error?: string }[];
  account: { email?: string; subscriptionType?: string };
  outputStyle: string;
  defaultMode: string;
}

let infoPromise: Promise<ClaudeInfo | null> | null = null;

export function fetchClaudeInfo(refresh = false): Promise<ClaudeInfo | null> {
  if (!infoPromise || refresh) {
    infoPromise = fetch(`/api/claude/info${refresh ? "?refresh=1" : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ClaudeInfo>) : null))
      .catch(() => null);
  }
  return infoPromise;
}

/** Commands, models, MCP servers and account from the CLI. Null until loaded (or if the CLI isn't reachable). */
export function useClaudeInfo(): ClaudeInfo | null {
  const [info, setInfo] = useState<ClaudeInfo | null>(null);
  useEffect(() => {
    let alive = true;
    fetchClaudeInfo().then((i) => { if (alive) setInfo(i); });
    return () => { alive = false; };
  }, []);
  return info;
}

const PREFS_KEY = "gabo:prefs";

export interface Prefs { model: string; mode: Mode; effort: Effort | "" }

/** Model, permission mode and effort, remembered in this browser. Mode starts at the CLI's defaultMode. */
export function usePrefs(defaultMode: string | undefined): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>({ model: "", mode: "default", effort: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
      if (saved) setPrefs((p) => ({ ...p, ...saved, mode: isMode(saved.mode) ? saved.mode : p.mode }));
      setLoaded(!!saved);
    } catch { /* storage blocked */ }
  }, []);

  useEffect(() => {
    if (!loaded && isMode(defaultMode)) setPrefs((p) => ({ ...p, mode: defaultMode }));
  }, [defaultMode, loaded]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
    setLoaded(true);
  }, []);

  return [prefs, update];
}

export function toRunPrefs(p: Prefs): RunPrefs {
  return { ...(p.model ? { model: p.model } : {}), mode: p.mode, ...(p.effort ? { effort: p.effort } : {}) };
}
