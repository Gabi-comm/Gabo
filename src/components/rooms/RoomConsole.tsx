"use client";

import { AGENTS, type AgentId } from "@/harness/agents";
import { ROOMS, type BaseRoomId, type RoomId } from "@/harness/rooms";
import { Console } from "@/components/cli/Console";
import { Mascot } from "@/components/mascot/Mascot";
import {
  ArenaIntro, ArenaWidget, HackathonIntro, HackathonWidget, LibraryIntro, LibraryWidget, OfficeScene,
} from "@/components/scenes/scenes";
import styles from "./rooms.module.css";

const SUGGESTIONS: Record<BaseRoomId, string[]> = {
  home: ["Explain this workspace", "Find TODOs in this folder", "Write a README for this project"],
  library: ["Teach me gradient descent from zero", "Quiz me on TCP vs UDP", "Plan my study week for a stats exam"],
  arena: ["Ideas for a study app for Filipino engineering students", "How could a small café get more regulars?"],
  hackathon: ["Build a one-page pomodoro timer", "Ship a landing page for a road-defect app"],
};

const SCENES = {
  home: { hero: <OfficeScene />, scene: undefined },
  library: { hero: <LibraryIntro />, scene: (p: AgentId[], a: AgentId[]) => <LibraryWidget pulled={p} active={a} /> },
  arena: { hero: <ArenaIntro />, scene: (p: AgentId[], a: AgentId[]) => <ArenaWidget pulled={p} active={a} /> },
  hackathon: { hero: <HackathonIntro />, scene: (p: AgentId[], a: AgentId[]) => <HackathonWidget pulled={p} active={a} /> },
} as const;

export function RoomConsole({ room, conversationId, sessionId }: { room: RoomId; conversationId?: string; sessionId?: string }) {
  if (room.startsWith("agent:")) {
    const id = room.slice(6) as AgentId;
    return (
      <Console
        key={conversationId ?? sessionId ?? room}
        room={room}
        conversationId={conversationId}
        sessionId={sessionId}
        label={AGENTS[id].name}
        placeholder={`Give ${AGENTS[id].name} a task`}
        hero={
          <div className={styles.soloHero}>
            <Mascot kind={id} size={150} />
            <div className={styles.soloName}>{AGENTS[id].name}</div>
            <div className={styles.soloTag}>{AGENTS[id].tagline}</div>
          </div>
        }
      />
    );
  }
  const base = room as BaseRoomId;
  const { hero, scene } = SCENES[base];
  return (
    <Console
      key={conversationId ?? sessionId ?? room}
      room={room}
      conversationId={conversationId}
        sessionId={sessionId}
      label={ROOMS[base].label}
      placeholder={ROOMS[base].placeholder}
      hero={hero}
      scene={scene}
      suggestions={SUGGESTIONS[base]}
    />
  );
}
