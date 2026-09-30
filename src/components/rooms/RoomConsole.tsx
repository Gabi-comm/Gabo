"use client";

import type { ReactNode } from "react";
import { isAgentId, type AgentKey } from "@/harness/agents";
import { ROOMS, type BaseRoomId, type RoomId } from "@/harness/rooms";
import { Console } from "@/components/cli/Console";
import { AgentStage } from "@/components/mascot/AgentStage";
import { useAgentMeta } from "@/components/agents/registry";
import {
  ArenaIntro, ArenaWidget, HackathonIntro, HackathonWidget, LabWidget, LibraryIntro, LibraryWidget, OfficeScene,
} from "@/components/scenes/scenes";
import styles from "./rooms.module.css";

const SUGGESTIONS: Record<BaseRoomId, string[]> = {
  home: ["Explain this workspace", "Find TODOs in this folder", "Write a README for this project"],
  library: ["Teach me gradient descent from zero", "Quiz me on TCP vs UDP", "Plan my study week for a stats exam"],
  arena: ["Ideas for a study app for Filipino engineering students", "How could a small café get more regulars?"],
  hackathon: ["Build a one-page pomodoro timer", "Ship a landing page for a road-defect app"],
  laboratory: [],
};

type SceneFn = (p: AgentKey[], a: AgentKey[]) => ReactNode;

const SCENES: Record<BaseRoomId, { hero: ReactNode; scene?: SceneFn }> = {
  home: { hero: <OfficeScene /> },
  library: { hero: <LibraryIntro />, scene: (p, a) => <LibraryWidget pulled={p} active={a} /> },
  arena: { hero: <ArenaIntro />, scene: (p, a) => <ArenaWidget pulled={p} active={a} /> },
  hackathon: { hero: <HackathonIntro />, scene: (p, a) => <HackathonWidget pulled={p} active={a} /> },
  laboratory: { hero: null, scene: (p, a) => <LabWidget pulled={p} active={a} /> },
};

export function RoomConsole({ room, conversationId, sessionId, team, hero }: {
  room: RoomId; conversationId?: string; sessionId?: string;
  /** Laboratory team, sent with each message. */
  team?: AgentKey[];
  /** Replaces the room's intro scene (the Laboratory shows its team instead). */
  hero?: ReactNode;
}) {
  const meta = useAgentMeta();
  if (room.startsWith("agent:")) {
    const id = room.slice(6) as AgentKey;
    const info = meta(id);
    return (
      <Console
        key={conversationId ?? sessionId ?? room}
        room={room}
        conversationId={conversationId}
        sessionId={sessionId}
        label={info.name}
        placeholder={`Give ${info.name} a task`}
        hero={
          <div className={styles.soloHero}>
            <AgentStage
              agent={isAgentId(id) ? id : undefined}
              costume={info.costume}
              theme={info.backdrop}
              label={info.name}
              mascotWidth={56}
              className={styles.soloStage}
            />
            <div className={styles.soloName}>{info.name}</div>
            <div className={styles.soloTag}>{info.tagline}</div>
          </div>
        }
      />
    );
  }
  const base = room as BaseRoomId;
  const { hero: roomHero, scene } = SCENES[base];
  return (
    <Console
      key={conversationId ?? sessionId ?? room}
      room={room}
      conversationId={conversationId}
      sessionId={sessionId}
      team={team}
      label={ROOMS[base].label}
      placeholder={ROOMS[base].placeholder}
      hero={hero ?? roomHero}
      scene={scene}
      suggestions={SUGGESTIONS[base]}
    />
  );
}
