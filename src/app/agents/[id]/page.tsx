import { notFound } from "next/navigation";
import { AGENTS, isAgentId, isCustomId } from "@/harness/agents";
import { ROOM_IDS, ROOMS } from "@/harness/rooms";
import { loadSpec } from "@/harness/spec";
import { loadOverrides } from "@/harness/overrides";
import { loadCustomAgents } from "@/server/customAgents";
import { RoomConsole } from "@/components/rooms/RoomConsole";
import styles from "../agents.module.css";

export const dynamic = "force-dynamic";

function find(id: string) {
  if (isAgentId(id)) {
    const override = loadOverrides()[id];
    return { name: AGENTS[id].name, role: (override?.prompt ?? loadSpec().agents[id]).replace(/^\d+\.\s*/, ""), goal: override?.goal ?? "" };
  }
  const custom = isCustomId(id) ? loadCustomAgents().find((a) => a.id === id) : undefined;
  return custom ? { name: custom.name, role: custom.prompt, goal: custom.goal } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${find(id)?.name ?? "Agent"} · Gabo` };
}

export default async function AgentPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }>;
}) {
  const { id } = await params;
  const { c } = await searchParams;
  const agent = find(id);
  if (!agent || !(isAgentId(id) || isCustomId(id))) notFound();
  const rooms = isAgentId(id) ? ROOM_IDS.filter((r) => r !== "laboratory" && ROOMS[r].roster.includes(id)).map((r) => ROOMS[r].label) : [];
  return (
    <div className={styles.agentPage}>
      <details className={styles.role}>
        <summary>
          <span>Role</span>
          <span className={styles.tag}>{isCustomId(id) ? "your agent · Laboratory" : rooms.length ? `in ${rooms.join(", ")}` : "solo"}</span>
        </summary>
        <p>{agent.role}</p>
        {agent.goal && <p><strong>Goal:</strong> {agent.goal}</p>}
      </details>
      <RoomConsole room={`agent:${id}`} conversationId={c} />
    </div>
  );
}
