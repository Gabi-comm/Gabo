"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAgentId, type AgentId } from "@/harness/agents";
import { Mascot } from "@/components/mascot/Mascot";
import { AgentStage } from "@/components/mascot/AgentStage";
import styles from "./settings.module.css";

interface AgentRow {
  id: AgentId;
  name: string;
  tagline: string;
  specPrompt: string;
  prompt: string;
  goal: string;
  promptEdited: boolean;
  updatedAt: number | null;
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

const MAX_PROMPT = 20_000;
const MAX_GOAL = 4_000;

export function AgentSettings({ initialAgent }: { initialAgent?: string }) {
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentId>(isAgentId(initialAgent) ? initialAgent : "believer");
  const [prompt, setPrompt] = useState("");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      setRows(await res.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = useMemo(() => rows?.find((r) => r.id === selected) ?? null, [rows, selected]);

  // Load the selected agent's saved text into the editor when the selection (or the first load) changes.
  // Saving updates the row too, but must not reset the editor or the "Saved" status.
  const loaded = rows !== null;
  useEffect(() => {
    const row = rows?.find((r) => r.id === selected);
    if (!row) return;
    setPrompt(row.prompt);
    setGoal(row.goal);
    setStatus({ kind: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loaded]);

  const dirty = !!current && (prompt !== current.prompt || goal !== current.goal);

  // On a phone the agent list is a horizontal strip; keep the selected one in view.
  useEffect(() => {
    document.getElementById(`tab-${selected}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected, loaded]);

  function select(id: AgentId) {
    if (id === selected) return;
    if (dirty && !window.confirm(`Discard unsaved changes to ${current?.name}?`)) return;
    setSelected(id);
    history.replaceState(null, "", `/settings?agent=${id}`);
  }

  function replaceRow(row: AgentRow) {
    setRows((rs) => rs?.map((r) => (r.id === row.id ? row : r)) ?? rs);
    setPrompt(row.prompt);
    setGoal(row.goal);
  }

  const save = useCallback(async () => {
    if (!current || !dirty || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, prompt, goal }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      replaceRow(body);
      setStatus({ kind: "saved", at: Date.now() });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [current, dirty, goal, prompt, status.kind]);

  async function reset() {
    if (!current) return;
    if (!window.confirm(`Reset ${current.name} to the prompt in docs/spec.md and clear the added goal?`)) return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch(`/api/agents?id=${current.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      replaceRow(body);
      setStatus({ kind: "saved", at: Date.now() });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.error} role="alert">
          Couldn&apos;t load the agents: {loadError} <button className={styles.linkButton} onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Settings</h1>
        <p>Each agent&apos;s role prompt and an added goal. Edits save to <code>config/agent-overrides.json</code>; the text in <code>docs/spec.md</code> stays the default. They apply from the next message.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.list} role="tablist" aria-label="Agents" aria-orientation="vertical">
          {(rows ?? []).map((r) => {
            const edited = r.promptEdited || r.goal !== "";
            return (
              <button
                key={r.id}
                role="tab"
                id={`tab-${r.id}`}
                aria-selected={r.id === selected}
                aria-controls="agent-editor"
                className={styles.tab}
                onClick={() => select(r.id)}
              >
                <Mascot kind={r.id} size={34} sticker={false} />
                <span className={styles.tabName}>{r.name.replace("The ", "")}</span>
                {edited && <span className={styles.edited}>edited</span>}
              </button>
            );
          })}
          {!rows && <div className={styles.loading}>Loading agents…</div>}
        </div>

        <section id="agent-editor" role="tabpanel" aria-labelledby={`tab-${selected}`} className={styles.editor}>
          {!current ? (
            <div className={styles.loading}>Loading…</div>
          ) : (
            <>
              <div className={styles.editorHead}>
                <AgentStage agent={current.id} label={current.name} mascotWidth={60} className={styles.headStage} />
                <div>
                  <h2>{current.name}</h2>
                  <p className={styles.muted}>{current.tagline}</p>
                </div>
              </div>

              <label className={styles.label} htmlFor="role-prompt">
                Role prompt
                <span className={styles.muted}>{current.promptEdited ? "edited" : "from docs/spec.md"} · {prompt.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()}</span>
              </label>
              <textarea
                id="role-prompt"
                className={styles.textarea}
                rows={14}
                maxLength={MAX_PROMPT}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                spellCheck={false}
              />
              <p className={styles.hint}>
                Always added after this: the skill-scout rule{current.id === "emperor" ? ", the Idea Rubric and how the Emperor uses it" : ""}.
              </p>

              <label className={styles.label} htmlFor="added-goal">
                Added goal
                <span className={styles.muted}>{goal.length.toLocaleString()} / {MAX_GOAL.toLocaleString()}</span>
              </label>
              <textarea
                id="added-goal"
                className={styles.textarea}
                rows={4}
                maxLength={MAX_GOAL}
                value={goal}
                placeholder="e.g. Keep every answer under 150 words, and cite at least one source."
                onChange={(e) => setGoal(e.target.value)}
              />
              <p className={styles.hint}>Sent to the agent as “Gab&apos;s added goal for you: …”. Leave empty for none.</p>

              <div className={styles.actions}>
                <button className={styles.primary} onClick={save} disabled={!dirty || status.kind === "saving"}>
                  {status.kind === "saving" ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setPrompt(current.prompt); setGoal(current.goal); }} disabled={!dirty}>Undo changes</button>
                <button onClick={reset} disabled={!current.promptEdited && current.goal === ""}>Reset to spec</button>
                <span className={styles.status} role="status">
                  {dirty ? "Unsaved changes" : status.kind === "saved" ? `Saved ${new Date(status.at).toLocaleTimeString()}` : ""}
                </span>
              </div>
              {status.kind === "error" && <div className={styles.error} role="alert">{status.message}</div>}
              <p className={styles.hint}>Ctrl+S saves.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
