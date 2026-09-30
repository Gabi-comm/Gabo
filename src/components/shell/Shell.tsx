"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Icon } from "./Icon";
import styles from "./shell.module.css";

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer after navigating, and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={styles.shell} data-drawer={open ? "open" : "closed"}>
      <button className={styles.menuButton} onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
        <Icon name="menu" />
      </button>
      <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
      <Sidebar onClose={() => setOpen(false)} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
