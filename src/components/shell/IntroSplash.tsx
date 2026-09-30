"use client";

import { useCallback, useEffect, useState } from "react";
import { Mascot } from "@/components/mascot/Mascot";
import styles from "./intro.module.css";

import { INTRO_KEY } from "./introScript";

const WORD = "GABO";

// Timeline (ms): Gabo pops in, GABO types out, the tagline fades up, then everything fades away.
const TYPE_START = 560;
const TYPE_STEP = 170;
const TAGLINE_AT = TYPE_START + WORD.length * TYPE_STEP + 120;
const LEAVE_AT = TAGLINE_AT + 1300;
const GONE_AFTER = 420;

export function IntroSplash() {
  const [phase, setPhase] = useState<"hidden" | "show" | "leaving">("show");
  const [typed, setTyped] = useState(0);
  const [tagline, setTagline] = useState(false);

  const leave = useCallback(() => {
    setPhase((p) => (p === "show" ? "leaving" : p));
  }, []);

  useEffect(() => {
    // "Seen" comes from the pre-paint script's flag, not from storage read here: React's dev mode runs this
    // effect twice, and the first run's write would otherwise make the second skip the intro.
    if (document.documentElement.dataset.intro === "seen") { setPhase("hidden"); return; }
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* storage blocked: it just plays again next load */ }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduced) {
      setTyped(WORD.length);
      setTagline(true);
      timers.push(setTimeout(leave, 1400));
    } else {
      for (let i = 1; i <= WORD.length; i++) timers.push(setTimeout(() => setTyped(i), TYPE_START + (i - 1) * TYPE_STEP));
      timers.push(setTimeout(() => setTagline(true), TAGLINE_AT));
      timers.push(setTimeout(leave, LEAVE_AT));
    }
    const skip = () => leave();
    window.addEventListener("keydown", skip);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("keydown", skip); };
  }, [leave]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("hidden"), GONE_AFTER);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "hidden") return null;
  return (
    <div className={styles.intro} data-phase={phase} role="status" aria-label="Gabo intro" onClick={leave}>
      <div className={styles.mascot}><Mascot size={168} title="Gabo mascot" /></div>
      <div className={styles.word} aria-hidden={typed < WORD.length}>
        <span>{WORD.slice(0, typed)}</span>
        <span className={styles.caret} aria-hidden="true" />
      </div>
      <p className={styles.tagline} data-on={tagline}>A Multi-Agent Harness</p>
      <span className={styles.skip}>click or press any key to skip</span>
    </div>
  );
}
