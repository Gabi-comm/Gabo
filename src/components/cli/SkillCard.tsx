"use client";

import { useState } from "react";
import { AGENTS } from "@/harness/agents";
import type { Item } from "./transcript";
import styles from "./console.module.css";

type SkillsItem = Extract<Item, { kind: "skills" }>;

/** Skill scout output: one line per agent, plus a Download prompt for skills that aren't installed. */
export function SkillCard({ item, onDone }: { item: SkillsItem; onDone: (installed: string[]) => void }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");
  const settled = item.installed !== undefined || item.dismissed;

  async function download() {
    setState("busy");
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: item.missing.map((m) => m.name) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Install failed (${res.status}).`);
      onDone(body.installed ?? []);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <div className={styles.skills}>
      <div className={styles.skillsHead}>Skills</div>
      {item.note && <div className={styles.via}>{item.note}</div>}
      <ul>
        {item.lines.map((l) => (
          <li key={l.agent}>
            <span className={styles.skillAgent}>{AGENTS[l.agent].name.replace("The ", "")}</span>
            {l.skills.length ? l.skills.join(", ") : "none"}
            {l.why && <span className={styles.via}> — {l.why}</span>}
          </li>
        ))}
      </ul>
      {item.missing.length > 0 && !settled && (
        <div className={styles.skillAsk}>
          <div>
            Recommended, not installed:{" "}
            {item.missing.map((m) => (
              <span key={m.name} className={styles.skillName} title={m.description}>
                {m.name} <span className={styles.via}>({m.agents.map((a) => AGENTS[a].name.replace("The ", "")).join(", ")})</span>
              </span>
            ))}
          </div>
          <div className={styles.permOptions}>
            <button onClick={download} disabled={state === "busy"}>{state === "busy" ? "Downloading…" : "Download"}</button>
            <button onClick={() => onDone([])} disabled={state === "busy"}>Skip</button>
          </div>
          {state === "error" && <div className={styles.errText} role="alert">{error}</div>}
          <div className={styles.via}>Installs into this workspace&apos;s .claude/skills. Agents use them from your next message.</div>
        </div>
      )}
      {item.installed && item.installed.length > 0 && (
        <div className={styles.okText}>Installed {item.installed.join(", ")}. Agents will use them from your next message.</div>
      )}
      {item.dismissed && <div className={styles.via}>Skipped.</div>}
    </div>
  );
}
