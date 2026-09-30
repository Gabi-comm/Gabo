"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Icon } from "./Icon";
import styles from "./shell.module.css";

const COLLAPSED_KEY = "gabo:sidebar-collapsed";
const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

export function Shell({ children }: { children: React.ReactNode }) {
  // Mobile: the sidebar is a drawer, closed by default. Desktop: a column that can be collapsed and stays that way.
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1"); } catch { /* storage blocked */ }
  }, []);

  const setCollapsedSaved = useCallback((value: boolean) => {
    setCollapsed(value);
    try { localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0"); } catch { /* storage blocked */ }
  }, []);

  const show = useCallback(() => (isMobile() ? setOpen(true) : setCollapsedSaved(false)), [setCollapsedSaved]);
  const hide = useCallback(() => (isMobile() ? setOpen(false) : setCollapsedSaved(true)), [setCollapsedSaved]);

  // Close the mobile drawer after navigating.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const visible = isMobile() ? open : !collapsed;
        if (visible) hide(); else show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, collapsed, show, hide]);

  return (
    <div className={styles.shell} data-drawer={open ? "open" : "closed"} data-collapsed={collapsed}>
      <button className={styles.menuButton} onClick={show} aria-label="Show sidebar" title="Show sidebar (Ctrl+B)" aria-expanded={open}>
        <Icon name="sidebar" />
      </button>
      <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
      <Sidebar onClose={hide} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
