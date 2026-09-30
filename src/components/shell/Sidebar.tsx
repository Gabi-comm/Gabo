"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AGENT_IDS, AGENTS } from "@/harness/agents";
import { ROOMS, type RoomId } from "@/harness/rooms";
import { Mascot } from "@/components/mascot/Mascot";
import { Icon, type IconName } from "./Icon";
import { roomHref } from "@/lib/routes";
import styles from "./shell.module.css";

/** One entry of the unified history: a Claude Code session (CLI or app) or a fresh app chat. */
interface Recent { sessionId: string | null; title: string; project: string | null; room: RoomId | null; updatedAt: number; href: string }

export const SESSIONS_CHANGED = "gabo:sessions-changed";

export { roomHref };

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
      const res = await fetch("/api/history", { cache: "no-store" });
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
        <button className={styles.closeButton} onClick={onClose} aria-label="Hide sidebar" title="Hide sidebar (Ctrl+B)"><Icon name="sidebar" /></button>
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

      <div className={styles.recentsHead}>Recents <span className={styles.recentsSub}>· Claude Code history</span></div>
      <ul className={styles.recents}>
        {recentsError && <li className={styles.recentsEmpty}>Couldn&apos;t load chats. <button className={styles.linkButton} onClick={load}>Retry</button></li>}
        {!recentsError && recents === null && <li className={styles.recentsEmpty}>Loading…</li>}
        {!recentsError && recents?.length === 0 && <li className={styles.recentsEmpty}>No chats yet.</li>}
        {recents?.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className={styles.recent} title={`${r.title}${r.project ? ` — ${r.project}` : ""}`}>
              <span className={styles.recentRoom}>{r.room && r.room !== "home" ? (r.room.startsWith("agent:") ? r.room.slice(6) : r.room) : (r.project ?? "home")}</span>
              <span className={styles.recentTitle}>{r.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <Link href="/settings" className={styles.navItem} aria-current={pathname === "/settings" ? "page" : undefined}>
          <Icon name="settings" /> Settings
        </Link>
      </div>
    </nav>
  );
}
