import Link from "next/link";
import { AGENT_IDS, AGENTS } from "@/harness/agents";
import { ROOM_IDS, ROOMS } from "@/harness/rooms";
import { AgentStage } from "@/components/mascot/AgentStage";
import styles from "./agents.module.css";

export const metadata = { title: "Agents · Gabo" };

export default function AgentsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Agents</h1>
      </header>
      <ul className={styles.list}>
        {AGENT_IDS.map((id) => {
          const rooms = ROOM_IDS.filter((r) => ROOMS[r].roster.includes(id)).map((r) => ROOMS[r].label);
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
    </div>
  );
}
