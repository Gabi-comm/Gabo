import fs from "node:fs";
import path from "node:path";
import type { AgentId } from "@/harness/agents";
import type { RoomId } from "@/harness/rooms";

export interface SessionRecord {
  id: string;
  room: RoomId;
  title: string;
  sdkSessionId?: string;
  /** Project folder the session runs in (a Claude Code session opened from history keeps its own). */
  cwd?: string;
  /** Skills each agent kept on the first turn (skill scout). */
  skills?: Partial<Record<AgentId, string[]>>;
  updatedAt: number;
}

export class SessionStore {
  private file: string;

  constructor(private dir: string) {
    this.file = path.join(dir, "sessions.json");
  }

  private read(): SessionRecord[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private write(all: SessionRecord[]): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list(): SessionRecord[] {
    return this.read().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): SessionRecord | undefined {
    return this.read().find((s) => s.id === id);
  }

  upsert(patch: Partial<SessionRecord> & { id: string }): SessionRecord {
    const all = this.read();
    const i = all.findIndex((s) => s.id === patch.id);
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    // Strictly increasing so two writes in the same millisecond keep their order.
    const now = Math.max(Date.now(), ...all.map((s) => s.updatedAt + 1));
    const next: SessionRecord = i === -1
      ? { room: "home", title: "Untitled", ...clean, updatedAt: now } as SessionRecord
      : { ...all[i], ...clean, updatedAt: now };
    if (i === -1) all.push(next); else all[i] = next;
    this.write(all);
    return next;
  }

  remove(id: string): void {
    this.write(this.read().filter((s) => s.id !== id));
  }
}
