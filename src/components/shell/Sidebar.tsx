"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AGENT_IDS, AGENTS } from "@/harness/agents";
import { ROOMS, type RoomId } from "@/harness/rooms";
import { Mascot } from "@/components/mascot/Mascot";
import { Icon, type IconName } from "./Icon";
import styles from "./shell.module.css";

interface Recent { id: string; room: RoomId; title: string; updatedAt: number }

export const SESSIONS_CHANGED = "gabo:sessions-changed";

export function roomHref(room: RoomId, conversationId?: string): string {
  const base = room === "home" ? "/" : room.startsWith("agent:") ? `/agents/${room.slice(6)}` : `/${room}`;
  return conversationId ? `${base}?c=${encodeURIComponent(conversationId)}` : base;
}

const NAV: { room: "home" | "library" | "arena" | "hackathon"; icon: IconName }[] = [
  { room: "home", icon: "home" },
  { room: "library", icon: "library" },
  { room: "arena", icon: "arena" },
  { room: "hackathon", icon: "hackathon" },
];

export function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [agentsOpen, setAgentsOpen] = useState(pathname.startsWith("/agents"));
  const [recents, setRecents] = useState<Recent[] | null>(null);
  const [recentsError, setRecentsError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setRecents(await res.json());
      setRecentsError(false);
    } catch {
      setRecentsError(true);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(SESSIONS_CHANGED, load);
    return () => window.removeEventListener(SESSIONS_CHANGED, load);
  }, [load]);

  useEffect(() => { if (pathname.startsWith("/agents")) setAgentsOpen(true); }, [pathname]);

  const currentRoom: RoomId =
    pathname === "/" ? "home" : pathname.startsWith("/agents/") ? (`agent:${pathname.split("/")[2]}` as RoomId) : (pathname.slice(1) as RoomId);

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <div className={styles.brand}>
        <Link href="/" className={styles.brandLink}>
          <Mascot size={30} sticker={false} title="Gabo" />
          <span>gabo</span>
        </Link>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close menu"><Icon name="close" /></button>
      </div>

      <Link href={roomHref(currentRoom)} className={styles.newButton} onClick={() => window.dispatchEvent(new Event("gabo:new"))}>
        <Icon name="plus" /> New
      </Link>

      <ul className={styles.nav}>
        <li>
          <Link href="/" className={styles.navItem} aria-current={pathname === "/" ? "page" : undefined}>
            <Icon name="home" /> Home
          </Link>
        </li>
        <li>
          <div className={styles.navRow}>
            <Link href="/agents" className={styles.navItem} aria-current={pathname === "/agents" ? "page" : undefined}>
              <Icon name="agents" /> Agents
            </Link>
            <button
              className={styles.disclosure}
              onClick={() => setAgentsOpen((v) => !v)}
              aria-expanded={agentsOpen}
              aria-controls="agent-subtabs"
              aria-label={agentsOpen ? "Hide agents" : "Show agents"}
              data-open={agentsOpen}
            >
              <Icon name="chevron" size={14} />
            </button>
          </div>
          {agentsOpen && (
            <ul id="agent-subtabs" className={styles.subnav}>
              {AGENT_IDS.map((id) => (
                <li key={id}>
                  <Link href={`/agents/${id}`} className={styles.subItem} aria-current={pathname === `/agents/${id}` ? "page" : undefined}>
                    <Mascot kind={id} size={22} sticker={false} />
                    {AGENTS[id].name.replace("The ", "")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
        {NAV.slice(1).map(({ room, icon }) => (
          <li key={room}>
            <Link href={`/${room}`} className={styles.navItem} aria-current={pathname === `/${room}` ? "page" : undefined}>
              <Icon name={icon} /> {ROOMS[room].label}
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.recentsHead}>Recents</div>
      <ul className={styles.recents}>
        {recentsError && <li className={styles.recentsEmpty}>Couldn&apos;t load chats. <button className={styles.linkButton} onClick={load}>Retry</button></li>}
        {!recentsError && recents === null && <li className={styles.recentsEmpty}>Loading…</li>}
        {!recentsError && recents?.length === 0 && <li className={styles.recentsEmpty}>No chats yet.</li>}
        {recents?.map((r) => (
          <li key={r.id}>
            <Link href={roomHref(r.room, r.id)} className={styles.recent} title={r.title}>
              <span className={styles.recentRoom}>{r.room.startsWith("agent:") ? r.room.slice(6) : r.room}</span>
              <span className={styles.recentTitle}>{r.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
