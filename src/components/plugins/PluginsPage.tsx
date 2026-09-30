"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchClaudeInfo, type ClaudeInfo } from "@/components/cli/useClaude";
import styles from "./plugins.module.css";

interface Provider {
  id: string;
  label: string;
  kind: "openai" | "gemini" | "openai-compatible";
  baseUrl: string;
  model: string;
  enabled: boolean;
  help: string;
  hasKey: boolean;
  keyHint: string;
}

const KIND_LABEL: Record<Provider["kind"], string> = {
  openai: "OpenAI API",
  gemini: "Google Gemini API",
  "openai-compatible": "OpenAI-compatible API",
};

export function PluginsPage() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ClaudeInfo | null | undefined>(undefined);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/providers", { cache: "no-store" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      setProviders(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchClaudeInfo().then(setInfo); }, []);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Plugins</h1>
        <p>
          Connect other AIs so Claude can consult them. Each one becomes a tool (<code>mcp__gabo-ai__ask_…</code>) that Claude asks
          your permission to use.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="other-ais">
        <h2 id="other-ais">Other AIs</h2>
        {error && <div className={styles.error} role="alert">Couldn&apos;t load: {error} <button className={styles.link} onClick={load}>Retry</button></div>}
        {!providers && !error && <p className={styles.muted}>Loading…</p>}
        <div className={styles.cards}>
          {providers?.map((p) => (
            <ProviderCard key={p.id} provider={p} onSaved={(np) => setProviders((ps) => ps?.map((x) => (x.id === np.id ? np : x)) ?? ps)} />
          ))}
        </div>
      </section>

      <section className={styles.section} aria-label="Claude Code plugins">
        <h2>Claude Code plugins</h2>
        <p className={styles.muted}>Loaded from your Claude Code settings, the same as the CLI. Install or remove them with <code>/plugin</code> in the CLI.</p>
        {info === undefined && <p className={styles.muted}>Loading…</p>}
        {info === null && <p className={styles.error}>Couldn&apos;t reach Claude Code.</p>}
        {info && (
          <>
            <ul className={styles.chips}>
              {(info.plugins ?? []).map((pl) => <li key={pl.id} title={pl.id}>{pl.name}<span className={styles.muted}> · {pl.marketplace}</span></li>)}
              {(info.plugins ?? []).length === 0 && <li className={styles.muted}>No plugins enabled.</li>}
            </ul>
            <h3>MCP servers</h3>
            <ul className={styles.mcp}>
              {info.mcp.map((m) => (
                <li key={m.name}>
                  <span className={styles.status} data-status={m.status}>{m.status}</span> {m.name}
                  {m.error && <span className={styles.muted}> — {m.error}</span>}
                </li>
              ))}
            </ul>
            <button className={styles.button} onClick={() => { setInfo(undefined); fetchClaudeInfo(true).then(setInfo); }}>Refresh</button>
          </>
        )}
      </section>
    </div>
  );
}

function ProviderCard({ provider: p, onSaved }: { provider: Provider; onSaved: (p: Provider) => void }) {
  const [enabled, setEnabled] = useState(p.enabled);
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [model, setModel] = useState(p.model);
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "testing" } | { kind: "error"; message: string } | { kind: "tested"; ok: boolean; text: string }>({ kind: "idle" });
  const id = `prov-${p.id}`;
  const dirty = enabled !== p.enabled || baseUrl !== p.baseUrl || model !== p.model || apiKey !== "";

  async function save(patch?: Record<string, unknown>) {
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, enabled, baseUrl, model, ...(apiKey ? { apiKey } : {}), ...patch }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      onSaved(body);
      setApiKey("");
      setState({ kind: "saved" });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function test() {
    setState({ kind: "testing" });
    const res = await fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setState(body?.ok ? { kind: "tested", ok: true, text: `${body.reply} · ${body.ms} ms` } : { kind: "tested", ok: false, text: body?.error ?? "No answer." });
  }

  return (
    <section className={styles.card} aria-label={p.label} data-enabled={p.enabled}>
      <div className={styles.cardHead}>
        <div>
          <h3>{p.label}</h3>
          <span className={styles.muted}>{KIND_LABEL[p.kind]} · tool <code>ask_{p.id}</code></span>
        </div>
        <label className={styles.switch}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} aria-label={`Enable ${p.label}`} />
          <span>{enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <p className={styles.help}>{p.help}</p>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className={styles.form}>
        <label htmlFor={`${id}-url`}>Base URL</label>
        <input id={`${id}-url`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
        <label htmlFor={`${id}-model`}>Model</label>
        <input id={`${id}-model`} value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
        <label htmlFor={`${id}-key`}>API key</label>
        <input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={p.hasKey ? "Leave empty to keep the saved key" : "Paste a key (not needed for a local server)"}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <div className={styles.keyLine}>
          {p.hasKey ? <>Key saved: {p.keyHint} <button type="button" className={styles.link} onClick={() => save({ apiKey: "" })}>Remove key</button></> : <span className={styles.muted}>No key saved.</span>}
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={!dirty || state.kind === "saving"}>{state.kind === "saving" ? "Saving…" : "Save"}</button>
          <button type="button" className={styles.button} onClick={test} disabled={dirty || state.kind === "testing"} title={dirty ? "Save first" : undefined}>
            {state.kind === "testing" ? "Testing…" : "Test connection"}
          </button>
          <span className={styles.status} role="status">
            {state.kind === "saved" && "Saved"}
            {state.kind === "tested" && <span className={state.ok ? styles.ok : styles.bad}>{state.text}</span>}
          </span>
        </div>
        {state.kind === "error" && <div className={styles.error} role="alert">{state.message}</div>}
      </form>
    </section>
  );
}
