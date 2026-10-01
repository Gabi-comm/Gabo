"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, type ModelTiers, type ProviderId, type PublicBackend } from "@/harness/backend";
import styles from "./connect.module.css";

export const BACKEND_CHANGED = "gabo:backend-changed";

const ORDER: ProviderId[] = ["claude", "openai", "gemini"];
const TIER_LABELS: Record<keyof ModelTiers, string> = { opus: "Strong model", sonnet: "Standard model", haiku: "Fast model" };

/**
 * Connect: pick a provider, sign in on its site to create an API key (opened in a new tab), paste it,
 * and Gabo checks it before saving. Shared by the first-run pop-up and the Connect page.
 */
export function ConnectPanel({ onConnected, onUseLocal, compact = false }: {
  onConnected?: (b: PublicBackend) => void;
  onUseLocal: () => void;
  compact?: boolean;
}) {
  const [backend, setBackend] = useState<PublicBackend | null>(null);
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [step, setStep] = useState<"pick" | "key">("pick");
  const [key, setKey] = useState("");
  const [tiers, setTiers] = useState<ModelTiers>(PROVIDERS.claude.tiers);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/backend", { cache: "no-store" }).then((r) => r.json()).then(setBackend).catch(() => {});
  }, []);

  useEffect(() => {
    setTiers(backend?.tiers[provider] ?? PROVIDERS[provider].tiers);
    setModels([]);
    setMsg(null);
  }, [provider, backend]);

  const p = PROVIDERS[provider];
  const saved = backend?.keys[provider];

  function connect() {
    setStep("key");
    setMsg(null);
    // The provider's own sign-in: the person logs in there and creates a key for Gabo.
    window.open(p.keyUrl, "_blank", "noopener,noreferrer");
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/backend", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey: key.trim() || undefined, tiers }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setMsg({ kind: "error", text: body?.error ?? "Couldn't reach Gabo's server." }); return; }
    setKey("");
    setModels(body.models ?? []);
    setBackend(body);
    setMsg({ kind: "ok", text: `Connected to ${p.label}. Agents now run on your ${p.label} account.` });
    window.dispatchEvent(new Event(BACKEND_CHANGED));
    onConnected?.(body);
  }

  return (
    <div className={styles.panel} data-compact={compact}>
      <div role="radiogroup" aria-label="AI provider" className={styles.providers}>
        {ORDER.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={provider === id} onClick={() => { setProvider(id); setStep("pick"); }}>
            <strong>{PROVIDERS[id].label}</strong>
            <span>{PROVIDERS[id].note}</span>
            {backend?.keys[id] && <em>key saved</em>}
          </button>
        ))}
      </div>

      {step === "pick" ? (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={connect}>Connect</button>
          <button type="button" onClick={onUseLocal}>Use Local LLM</button>
        </div>
      ) : (
        <form className={styles.keyStep} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <ol className={styles.steps}>
            <li>
              {p.signIn} in the tab that just opened (<a href={p.keyUrl} target="_blank" rel="noopener noreferrer">open it again</a>) and create an API key for Gabo.
            </li>
            <li>Paste the key here. It stays on this computer in <code>.data/</code> and is never shown again.</li>
          </ol>
          <label htmlFor="connect-key">{p.label} API key</label>
          <input
            id="connect-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={saved ? `Saved: ${saved} (leave empty to keep it)` : p.keyHint}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <details className={styles.models}>
            <summary>Models ({tiers.opus} · {tiers.sonnet} · {tiers.haiku})</summary>
            <p>Gabo uses three slots: strong for the Judge, Coder and Emperor; standard for most agents; fast for small jobs.</p>
            {(Object.keys(TIER_LABELS) as (keyof ModelTiers)[]).map((k) => (
              <label key={k}>
                {TIER_LABELS[k]}
                <input list="connect-models" value={tiers[k]} onChange={(e) => setTiers((t) => ({ ...t, [k]: e.target.value }))} spellCheck={false} />
              </label>
            ))}
            <datalist id="connect-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </details>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy || (!key.trim() && !saved)}>{busy ? "Checking…" : "Test and connect"}</button>
            <button type="button" onClick={() => setStep("pick")}>Back</button>
          </div>
          <p className={styles.fine}>Usage is billed by {p.label} to your account. {provider !== "claude" && "Gabo translates for Claude Code, so a few Claude-only features (web search) are off."}</p>
        </form>
      )}
      {msg && <p className={styles[msg.kind]} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}
