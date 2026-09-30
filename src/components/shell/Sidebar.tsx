"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROOMS, type RoomId } from "@/harness/rooms";
import { Mascot } from "@/components/mascot/Mascot";
import { Icon, type IconName } from "./Icon";
import { roomHref } from "@/lib/routes";
import styles from "./shell.module.css";

/** One entry of the unified history: a Claude Code session (CLI or app) or a fresh app chat. */
interface Recent { sessionId: string | null; title: string; project: string | null; room: RoomId | null; updatedAt: number; href: string }

export const SESSIONS_CHANGED = "gabo:sessions-changed";

export { roomHref };

const WORKSPACE: { room: "library" | "arena" | "hackathon"; icon: IconName }[] = [
  { room: "library", icon: "library" },
  { room: "arena", icon: "arena" },
  { room: "hackathon", icon: "hackathon" },
];
const WORKSPACE_PATHS = WORKSPACE.map((w) => `/${w.room}`);
const HISTORY_OPEN_KEY = "gabo:history-open";
const WORKSPACE_OPEN_KEY = "gabo:workspace-open";

export function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [recents, setRecents] = useState<Recent[] | null>(null);
  const [recentsError, setRecentsError] = useState(false);
  const inWorkspace = WORKSPACE_PATHS.includes(pathname);
  const [workspaceOpen, setWorkspaceOpen] = useState(inWorkspace);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => { if (inWorkspace) setWorkspaceOpen(true); }, [inWorkspace]);
  useEffect(() => {
    try {
      setHistoryOpen(localStorage.getItem(HISTORY_OPEN_KEY) === "1");
      if (localStorage.getItem(WORKSPACE_OPEN_KEY) === "1") setWorkspaceOpen(true);
    } catch { /* storage blocked */ }
  }, []);
  function toggleWorkspace() {
    setWorkspaceOpen((open) => {
      try { localStorage.setItem(WORKSPACE_OPEN_KEY, open ? "0" : "1"); } catch { /* storage blocked */ }
      return !open;
    });
  }
  function toggleHistory() {
    setHistoryOpen((open) => {
      try { localStorage.setItem(HISTORY_OPEN_KEY, open ? "0" : "1"); } catch { /* storage blocked */ }
      return !open;
    });
  }

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

      <div className={styles.scrollArea}>
      <ul className={styles.nav}>
        <li>
          <Link href="/" className={styles.navItem} aria-current={pathname === "/" ? "page" : undefined}>
            <Icon name="home" /> Home
          </Link>
        </li>
        <li>
          <Link href="/agents" className={styles.navItem} aria-current={pathname.startsWith("/agents") ? "page" : undefined}>
            <Icon name="agents" /> Agents
          </Link>
        </li>
        <li>
          <button
            className={`${styles.navItem} ${styles.groupButton}`}
            onClick={toggleWorkspace}
            aria-expanded={workspaceOpen}
            aria-controls="workspace-subtabs"
          >
            <Icon name="workspace" /> Workspace
            <span className={styles.groupChevron} data-open={workspaceOpen}><Icon name="chevron" size={14} /></span>
          </button>
          {workspaceOpen && (
            <ul id="workspace-subtabs" className={styles.subnav}>
              {WORKSPACE.map(({ room, icon }) => (
                <li key={room}>
                  <Link href={`/${room}`} className={styles.subItem} aria-current={pathname === `/${room}` ? "page" : undefined}>
                    <Icon name={icon} /> {ROOMS[room].label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
        <li>
          <Link href="/plugins" className={styles.navItem} aria-current={pathname === "/plugins" ? "page" : undefined}>
            <Icon name="plugins" /> Plugins
          </Link>
        </li>
        <li>
          <Link href="/status" className={styles.navItem} aria-current={pathname === "/status" ? "page" : undefined}>
            <Icon name="status" /> Status
          </Link>
        </li>
      </ul>

      <button
        className={styles.historyToggle}
        onClick={toggleHistory}
        aria-expanded={historyOpen}
        aria-controls="history-list"
        title="Claude Code history: CLI and app sessions, all projects"
      >
        <span className={styles.groupChevron} data-open={historyOpen}><Icon name="chevron" size={12} /></span>
        History
        {recents && <span className={styles.recentsSub}>{recents.length}</span>}
      </button>
      <ul className={styles.recents} id="history-list" hidden={!historyOpen}>
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
      </div>
      <div className={styles.footer}>
        <Link href="/settings" className={styles.navItem} aria-current={pathname === "/settings" ? "page" : undefined}>
          <Icon name="settings" /> Settings
        </Link>
      </div>
    </nav>
  );
}
