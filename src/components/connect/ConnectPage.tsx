"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicBackend } from "@/harness/backend";
import { BACKEND_CHANGED, ConnectPanel } from "./ConnectPanel";
import styles from "./connect.module.css";

export function ConnectPage() {
  const router = useRouter();
  const [backend, setBackend] = useState<PublicBackend | null>(null);
  const load = useCallback(() => {
    fetch("/api/backend", { cache: "no-store" }).then((r) => r.json()).then(setBackend).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(BACKEND_CHANGED, load);
    return () => window.removeEventListener(BACKEND_CHANGED, load);
  }, [load]);

  async function disconnect() {
    if (!window.confirm("Disconnect? Gabo stops running agents until you connect again or switch on a Local LLM. Saved keys stay.")) return;
    const res = await fetch("/api/backend", { method: "DELETE" }).catch(() => null);
    if (res?.ok) setBackend(await res.json());
  }

  const current = backend?.local.enabled ? `Local LLM · ${backend.local.model}` : backend?.label ?? "Checking…";
  return (
    <div className={styles.page}>
      <div className={styles.pageInner}>
        <h1>Connect AI</h1>
        <p>Gabo&apos;s agents run on an AI account you connect: <strong>Claude</strong>, <strong>OpenAI</strong> or <strong>Gemini</strong> with your own API key, or a free <strong>Local LLM</strong> on this computer. Keys stay on this computer and are never shown again.</p>
        <section className={styles.current} aria-label="Current connection">
          <span>Now running on: <strong>{current}</strong></span>
          {backend && backend.kind !== "none" && !backend.local.enabled && <button type="button" onClick={disconnect}>Disconnect</button>}
        </section>
        {backend?.local.enabled && <p>The Local LLM switch is on, so it takes priority. Connecting an account below switches it off.</p>}
        <ConnectPanel onConnected={setBackend} onUseLocal={() => router.push("/local-llm?setup=1")} />
      </div>
    </div>
  );
}
