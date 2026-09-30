import Link from "next/link";
import { AGENT_IDS, AGENTS } from "@/harness/agents";
import { ROOM_IDS, ROOMS } from "@/harness/rooms";
import { Mascot } from "@/components/mascot/Mascot";
import styles from "./agents.module.css";

export const metadata = { title: "Agents · Gabo" };

export default function AgentsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Agents</h1>
        <p>Twelve roles. Rooms pull the ones a task needs; the Caveman sits in every room.</p>
      </header>
      <ul className={styles.list}>
        {AGENT_IDS.map((id) => {
          const rooms = ROOM_IDS.filter((r) => ROOMS[r].roster.includes(id)).map((r) => ROOMS[r].label);
          return (
            <li key={id}>
              <Link href={`/agents/${id}`} className={styles.row}>
                <Mascot kind={id} size={64} />
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
