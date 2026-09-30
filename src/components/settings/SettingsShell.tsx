"use client";

import { useState } from "react";
import { AgentSettings } from "./AgentSettings";
import { CustomAgentEditor } from "./CustomAgentEditor";
import styles from "./settings.module.css";

type Tab = "agents" | "new";

export function SettingsShell({ initialTab, initialAgent }: { initialTab?: string; initialAgent?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab === "new" ? "new" : "agents");
  function choose(t: Tab) {
    setTab(t);
    history.replaceState(null, "", t === "new" ? "/settings?tab=new" : "/settings");
  }
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1>Settings</h1>
        <div role="tablist" aria-label="Settings sections" className={styles.sections}>
          <button role="tab" aria-selected={tab === "agents"} aria-controls="settings-panel" onClick={() => choose("agents")}>Agents</button>
          <button role="tab" aria-selected={tab === "new"} aria-controls="settings-panel" onClick={() => choose("new")}>Add agent</button>
        </div>
      </header>
      <div id="settings-panel" role="tabpanel" className={styles.sectionBody}>
        {tab === "agents" ? <AgentSettings initialAgent={initialAgent} /> : <CustomAgentEditor />}
      </div>
    </div>
  );
}
