"use client";

import { useEffect, useMemo, useState } from "react";
import { BACKDROP_THEMES, BODY_COLORS, PARTS, SLOTS, randomCostume, type BackdropTheme, type Costume, type Slot } from "@/harness/costume";
import { LIMITS, type CustomAgent } from "@/harness/customAgents";
import { AgentStage } from "@/components/mascot/AgentStage";
import { CUSTOM_AGENTS_CHANGED, fetchCustomAgents } from "@/components/agents/registry";
import styles from "./custom.module.css";

const SLOT_LABEL: Record<Slot, string> = { head: "Hat", face: "Face", held: "Holding", front: "Clothes", back: "Back" };
const THEME_LABEL: Record<BackdropTheme, string> = {
  sunrise: "Sunrise hill", noir: "Rainy street", market: "City market", courtroom: "Courtroom", studio: "Art studio", terminal: "Code room",
  lab: "Test lab", library: "Library", classroom: "Classroom", cave: "Cave", board: "Planning board", throne: "Throne hall",
  garden: "Garden", space: "Space", ocean: "Ocean", forest: "Forest", stage: "Stage",
};

interface Draft { name: string; tagline: string; prompt: string; goal: string; costume: Costume; backdrop: BackdropTheme; describe: string }

const EMPTY: Draft = { name: "", tagline: "", prompt: "", goal: "", costume: { body: "blue", held: "flag" }, backdrop: "sunrise", describe: "" };

type Msg = { kind: "ok" | "error" | "info"; text: string } | null;

export function CustomAgentEditor() {
  const [agents, setAgents] = useState<CustomAgent[] | null>(null);
  const [editing, setEditing] = useState<CustomAgent | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<"costume" | "backdrop" | "save" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const reload = () => fetchCustomAgents(true).then(setAgents);
  useEffect(() => { reload(); }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setPart = (slot: Slot | "body", v: string) => setDraft((d) => ({ ...d, costume: { ...d.costume, [slot]: v || undefined } }));

  function edit(a: CustomAgent) {
    setEditing(a);
    setDraft({ name: a.name, tagline: a.tagline, prompt: a.prompt, goal: a.goal, costume: a.costume, backdrop: a.backdrop, describe: "" });
    setMsg(null);
  }
  function startNew() {
    setEditing(null);
    setDraft(EMPTY);
    setMsg(null);
  }

  async function generate(what: "costume" | "backdrop") {
    setBusy(what);
    setMsg(null);
    try {
      const res = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(what === "costume" ? { what, description: draft.describe } : { what, name: draft.name, prompt: draft.prompt, goal: draft.goal }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      if (what === "costume") setDraft((d) => ({ ...d, costume: body.value }));
      else set("backdrop", body.value);
      if (body.source === "offline") setMsg({ kind: "info", text: "Claude wasn't reachable, so this was matched from your words instead." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const { describe: _unused, ...payload } = draft;
      const res = await fetch("/api/agents/custom", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
      setMsg({ kind: "ok", text: editing ? `Saved ${body.name}.` : `Created ${body.name}.` });
      setEditing(body);
      await reload();
      window.dispatchEvent(new Event(CUSTOM_AGENTS_CHANGED));
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!editing || !window.confirm(`Delete ${editing.name}? Chats that used it keep their history.`)) return;
    await fetch(`/api/agents/custom?id=${encodeURIComponent(editing.id)}`, { method: "DELETE" });
    startNew();
    await reload();
    window.dispatchEvent(new Event(CUSTOM_AGENTS_CHANGED));
  }

  const preview = useMemo(() => draft.name.trim() || "New agent", [draft.name]);

  return (
    <div className={styles.wrap}>
      <aside className={styles.side}>
        <button className={styles.newButton} onClick={startNew} aria-pressed={!editing}>+ New agent</button>
        <h3>Your agents</h3>
        {agents === null && <p className={styles.muted}>Loading…</p>}
        {agents?.length === 0 && <p className={styles.muted}>None yet.</p>}
        <ul>
          {agents?.map((a) => (
            <li key={a.id}>
              <button onClick={() => edit(a)} aria-current={editing?.id === a.id || undefined}>{a.name}</button>
            </li>
          ))}
        </ul>
      </aside>

      <form
        className={styles.form}
        aria-label={editing ? `Edit ${editing.name}` : "New agent"}
        onSubmit={(e) => { e.preventDefault(); save(); }}
      >
        <div className={styles.preview}>
          <AgentStage costume={draft.costume} theme={draft.backdrop} label={preview} mascotWidth={58} className={styles.stage} />
          <div className={styles.previewName}>{preview}</div>
          <div className={styles.muted}>{draft.tagline || "One-liner goes here"}</div>
        </div>

        <div className={styles.fields}>
          <label htmlFor="ca-name">Name</label>
          <input id="ca-name" value={draft.name} maxLength={LIMITS.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Data Wizard" />
          <label htmlFor="ca-tag">One-liner</label>
          <input id="ca-tag" value={draft.tagline} maxLength={LIMITS.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="What it does, in one line" />

          <fieldset className={styles.section}>
            <legend>Mascot</legend>
            <label htmlFor="ca-desc">Describe the mascot</label>
            <textarea id="ca-desc" rows={2} value={draft.describe} maxLength={1000} onChange={(e) => set("describe", e.target.value)} placeholder="e.g. a pirate chef holding a coffee mug, green" />
            <div className={styles.row}>
              <button type="button" onClick={() => generate("costume")} disabled={!draft.describe.trim() || busy !== null}>
                {busy === "costume" ? "Generating…" : "Generate mascot"}
              </button>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, costume: randomCostume() }))} disabled={busy !== null}>Randomize costume</button>
            </div>
            <div className={styles.parts}>
              <label>
                <span>Body colour</span>
                <select aria-label="Body colour" value={draft.costume.body ?? "blue"} onChange={(e) => setPart("body", e.target.value)}>
                  {Object.entries(BODY_COLORS).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
                </select>
              </label>
              {SLOTS.map((slot) => (
                <label key={slot}>
                  <span>{SLOT_LABEL[slot]}</span>
                  <select aria-label={SLOT_LABEL[slot]} value={draft.costume[slot] ?? ""} onChange={(e) => setPart(slot, e.target.value)}>
                    <option value="">None</option>
                    {Object.entries(PARTS[slot]).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="ca-prompt">System prompt</label>
          <textarea id="ca-prompt" rows={8} value={draft.prompt} maxLength={LIMITS.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder="Who this agent is, how it works, what its output looks like." />
          <label htmlFor="ca-goal">Goal</label>
          <textarea id="ca-goal" rows={3} value={draft.goal} maxLength={LIMITS.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. End every answer with one next step." />

          <fieldset className={styles.section}>
            <legend>Background</legend>
            <div className={styles.row}>
              <select aria-label="Background" value={draft.backdrop} onChange={(e) => set("backdrop", e.target.value as BackdropTheme)}>
                {BACKDROP_THEMES.map((t) => <option key={t} value={t}>{THEME_LABEL[t]}</option>)}
              </select>
              <button type="button" onClick={() => generate("backdrop")} disabled={(!draft.prompt.trim() && !draft.goal.trim()) || busy !== null} title="Picks a scene from the system prompt and goal">
                {busy === "backdrop" ? "Generating…" : "Generate background"}
              </button>
            </div>
          </fieldset>

          <div className={styles.row}>
            <button type="submit" className={styles.primary} disabled={busy !== null || !draft.name.trim() || !draft.prompt.trim()}>
              {busy === "save" ? "Saving…" : editing ? "Save changes" : "Create agent"}
            </button>
            {editing && <button type="button" onClick={remove}>Delete</button>}
            {msg && <span className={styles[msg.kind]} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</span>}
          </div>
          <p className={styles.muted}>Your agents work in the Laboratory and on their own page. They follow the same skill rule as the built-in agents.</p>
        </div>
      </form>
    </div>
  );
}
