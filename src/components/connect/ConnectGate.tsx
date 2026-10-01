"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mascot } from "@/components/mascot/Mascot";
import { ConnectPanel } from "./ConnectPanel";
import styles from "./connect.module.css";

const DISMISSED_KEY = "gabo:connect-dismissed";

/** First-run pop-up after the intro: shown while no AI account (or Local LLM) is connected. */
export function ConnectGate({ ready }: { ready: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  // The pages it points to are where connecting happens; don't cover them.
  const onSetupPage = pathname === "/connect" || pathname === "/local-llm";
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || onSetupPage) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { /* storage blocked */ }
    if (dismissed) return;
    fetch("/api/backend", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => { if (b?.kind === "none" && !b?.local?.enabled) setOpen(true); })
      .catch(() => {});
  }, [ready, onSetupPage]);

  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLElement>("[role=radio][aria-checked=true]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* storage blocked */ }
  }

  if (!open || onSetupPage) return null;
  return (
    <div className={styles.scrim}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="connect-title">
        <header className={styles.dialogHead}>
          <Mascot size={44} sticker={false} />
          <div>
            <h2 id="connect-title">Connect your AI</h2>
            <p>Gabo&apos;s agents run on your own AI account. Press <strong>Connect</strong> to sign in to Claude, OpenAI or Gemini and create a key, or run everything free on this computer with a local model.</p>
          </div>
        </header>
        <ConnectPanel
          compact
          onConnected={() => setTimeout(close, 900)}
          onUseLocal={() => { close(); router.push("/local-llm?setup=1"); }}
        />
        <button type="button" className={styles.later} onClick={close}>Not now</button>
      </div>
    </div>
  );
}
