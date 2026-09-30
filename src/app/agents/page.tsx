import Link from "next/link";
import { AGENT_IDS, AGENTS } from "@/harness/agents";
import { ROOM_IDS, ROOMS } from "@/harness/rooms";
import { loadCustomAgents } from "@/server/customAgents";
import { AgentStage } from "@/components/mascot/AgentStage";
import styles from "./agents.module.css";

export const metadata = { title: "Agents · Gabo" };
export const dynamic = "force-dynamic";

export default function AgentsPage() {
  const customs = loadCustomAgents();
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Agents</h1>
      </header>
      <ul className={styles.list}>
        {AGENT_IDS.map((id) => {
          const rooms = ROOM_IDS.filter((r) => r !== "laboratory" && ROOMS[r].roster.includes(id)).map((r) => ROOMS[r].label);
          return (
            <li key={id}>
              <Link href={`/agents/${id}`} className={styles.row}>
                <AgentStage agent={id} label={AGENTS[id].name} mascotWidth={58} className={styles.stage} />
                <span className={styles.name}>{AGENTS[id].name}</span>
                <span className={styles.tag}>{AGENTS[id].tagline}</span>
                <span className={styles.rooms}>{rooms.length ? rooms.join(" · ") : "solo only"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <header className={styles.head}>
        <h2 className={styles.subhead}>Your agents</h2>
      </header>
      {customs.length === 0 ? (
        <p className={styles.empty}>None yet. Make one in <Link href="/settings?tab=new">Settings → Add agent</Link>.</p>
      ) : (
        <ul className={styles.list}>
          {customs.map((a) => (
            <li key={a.id}>
              <Link href={`/agents/${a.id}`} className={styles.row}>
                <AgentStage costume={a.costume} theme={a.backdrop} label={a.name} mascotWidth={58} className={styles.stage} />
                <span className={styles.name}>{a.name}</span>
                <span className={styles.tag}>{a.tagline || "Your agent"}</span>
                <span className={styles.rooms}>Laboratory · solo</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
