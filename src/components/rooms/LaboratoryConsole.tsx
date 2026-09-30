"use client";

import { useEffect, useState } from "react";
import { AGENT_IDS, isAgentKey, type AgentKey } from "@/harness/agents";
import { labTeam } from "@/harness/rooms";
import { AgentMascot, useAgentMeta, useCustomAgents } from "@/components/agents/registry";
import { RoomConsole } from "./RoomConsole";
import styles from "./lab.module.css";

const LAST_TEAM_KEY = "gabo:lab-team";
const teamKey = (c: string) => `gabo:lab-team:${c}`;

function readTeam(key: string): AgentKey[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(raw) ? raw.filter(isAgentKey) : null;
  } catch {
    return null;
  }
}

/** Laboratory: Gab picks who is on the team, then chats with exactly that team. */
export function LaboratoryConsole({ conversationId }: { conversationId?: string }) {
  const customs = useCustomAgents();
  const meta = useAgentMeta();
  const [team, setTeam] = useState<AgentKey[] | null>(null);
  const [picked, setPicked] = useState<Set<AgentKey>>(new Set(["caveman"]));

  // A resumed chat keeps its team; a new one starts from the last team picked (still editable).
  useEffect(() => {
    const saved = conversationId ? readTeam(teamKey(conversationId)) : null;
    if (saved) { setTeam(labTeam(saved)); return; }
    setTeam(null);
    const last = readTeam(LAST_TEAM_KEY);
    if (last) setPicked(new Set(labTeam(last)));
  }, [conversationId]);

  // Remember the team against the chat id once the first message creates it.
  useEffect(() => {
    if (!team) return;
    const remember = () => {
      const c = new URL(location.href).searchParams.get("c");
      if (c) try { localStorage.setItem(teamKey(c), JSON.stringify(team)); } catch { /* storage blocked */ }
    };
    window.addEventListener("gabo:sessions-changed", remember);
    return () => window.removeEventListener("gabo:sessions-changed", remember);
  }, [team]);

  const options: AgentKey[] = [...AGENT_IDS, ...(customs ?? []).map((c) => c.id)];

  function toggle(id: AgentKey) {
    if (id === "caveman") return;
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function start() {
    const chosen = labTeam(options.filter((id) => picked.has(id)));
    try { localStorage.setItem(LAST_TEAM_KEY, JSON.stringify(chosen)); } catch { /* storage blocked */ }
    setTeam(chosen);
  }

  if (!team) {
    const count = options.filter((id) => picked.has(id)).length;
    return (
      <div className={styles.picker}>
        <header>
          <h1>Laboratory</h1>
          <p>Which agents are you going to use? Tick the team for this chat. The Caveman is always in.</p>
        </header>
        <fieldset className={styles.options} aria-label="Pick your team">
          <legend className="sr-only">Pick your team</legend>
          {options.map((id) => {
            const info = meta(id);
            const locked = id === "caveman";
            return (
              <label key={id} className={styles.option} data-checked={picked.has(id)} data-custom={info.custom || undefined}>
                <input type="checkbox" checked={picked.has(id)} disabled={locked} onChange={() => toggle(id)} aria-label={`${info.name}${locked ? " (always in)" : ""}`} />
                <AgentMascot id={id} info={info} size={44} sticker={false} animate="hover" title={info.name} />
                <span className={styles.optionText}>
                  <strong>{info.name}</strong>
                  <span>{locked ? "Always in the room" : info.tagline || "Your agent"}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={start}>Start with {count} agent{count === 1 ? "" : "s"}</button>
          <button className={styles.button} onClick={() => setPicked(new Set(options))}>Select all</button>
          <button className={styles.button} onClick={() => setPicked(new Set(["caveman"]))}>Clear</button>
        </div>
      </div>
    );
  }

  const hero = (
    <div className={styles.teamHero}>
      <ul className={styles.team} aria-label="Your team">
        {team.map((id) => {
          const info = meta(id);
          return (
            <li key={id}>
              <AgentMascot id={id} info={info} size={64} title={info.name} />
              <span>{info.short}</span>
            </li>
          );
        })}
      </ul>
      <button className={styles.link} onClick={() => setTeam(null)}>Change team</button>
    </div>
  );

  return <RoomConsole room="laboratory" conversationId={conversationId} team={team} hero={hero} />;
}
