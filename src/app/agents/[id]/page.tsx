import { notFound } from "next/navigation";
import { AGENTS, isAgentId } from "@/harness/agents";
import { ROOM_IDS, ROOMS } from "@/harness/rooms";
import { loadSpec } from "@/harness/spec";
import { RoomConsole } from "@/components/rooms/RoomConsole";
import styles from "../agents.module.css";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: isAgentId(id) ? `${AGENTS[id].name} · Gabo` : "Agent · Gabo" };
}

export default async function AgentPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }>;
}) {
  const { id } = await params;
  const { c } = await searchParams;
  if (!isAgentId(id)) notFound();
  const role = loadSpec().agents[id].replace(/^\d+\.\s*/, "");
  const rooms = ROOM_IDS.filter((r) => ROOMS[r].roster.includes(id)).map((r) => ROOMS[r].label);
  return (
    <div className={styles.agentPage}>
      <details className={styles.role}>
        <summary>
          <span>Role</span>
          <span className={styles.tag}>{rooms.length ? `in ${rooms.join(", ")}` : "solo"}</span>
        </summary>
        <p>{role}</p>
      </details>
      <RoomConsole room={`agent:${id}`} conversationId={c} />
    </div>
  );
}
