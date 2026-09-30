"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AGENTS, type AgentId } from "@/harness/agents";
import type { Decision } from "@/harness/events";
import { rosterFor, type RoomId } from "@/harness/rooms";
import { Mascot } from "@/components/mascot/Mascot";
import { activeAgents, pulledAgents, type Item, type Transcript } from "./transcript";
import { useConversation } from "./useConversation";
import { SkillCard } from "./SkillCard";
import styles from "./console.module.css";

export interface ConsoleProps {
  room: RoomId;
  conversationId?: string;
  label: string;
  placeholder: string;
  /** Shown above the input before the first message (the room's intro scene). */
  hero: ReactNode;
  /** Top-left scene of the pulled agents once the chat has started. */
  scene?: (pulled: AgentId[], active: AgentId[]) => ReactNode;
  suggestions?: string[];
}

const SLASH = [
  { cmd: "/clear", help: "start a new chat in this room" },
  { cmd: "/agents", help: "list the agents this room can pull" },
  { cmd: "/cost", help: "tokens used in this chat" },
  { cmd: "/cwd", help: "show or set the workspace folder: /cwd C:\\path" },
  { cmd: "/skills", help: "show the skills each agent kept" },
  { cmd: "/help", help: "list commands and keys" },
];

export function Console({ room, conversationId, label, placeholder, hero, scene, suggestions = [] }: ConsoleProps) {
  const { t, dispatch, send, stop, answer, reset } = useConversation(room, conversationId);
  const pulled = useMemo(() => pulledAgents(t), [t]);
  const active = useMemo(() => activeAgents(t), [t]);
  const started = t.items.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [t.items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && t.running) { e.preventDefault(); stop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t.running, stop]);

  async function runSlash(input: string): Promise<boolean> {
    const [cmd, ...rest] = input.trim().split(/\s+/);
    const arg = input.trim().slice(cmd.length).trim();
    switch (cmd) {
      case "/clear": reset(); return true;
      case "/help":
        dispatch({ type: "notice", text: [...SLASH.map((s) => `${s.cmd.padEnd(8)} ${s.help}`), "Enter send · Shift+Enter newline · Esc interrupt · 1/2/3 answer a permission prompt"].join("\n") });
        return true;
      case "/agents":
        dispatch({ type: "notice", text: rosterFor(room).map((a) => `${AGENTS[a].name.padEnd(15)} ${AGENTS[a].tagline}`).join("\n") });
        return true;
      case "/cost":
        dispatch({ type: "notice", text: `${t.tokens.toLocaleString()} tokens this chat · $${t.costUsd.toFixed(4)} API-equivalent (billed to your Claude plan, not per token)` });
        return true;
      case "/skills": {
        const last = [...t.items].reverse().find((i) => i.kind === "skills");
        dispatch({ type: "notice", text: last && last.kind === "skills" ? last.lines.map((l) => `${AGENTS[l.agent].name}: ${l.skills.join(", ") || "none"}${l.why ? ` — ${l.why}` : ""}`).join("\n") || "No skills picked yet." : "Skills are picked on the first message of a chat." });
        return true;
      }
      case "/cwd": {
        const res = arg
          ? await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: arg }) })
          : await fetch("/api/workspace");
        const body = await res.json().catch(() => ({}));
        dispatch(res.ok
          ? { type: "notice", text: `Workspace: ${body.workspace}${arg ? "" : "\nChange it with /cwd C:\\path\\to\\folder"}` }
          : { type: "error", message: body.error ?? "Couldn't set the workspace." });
        return true;
      }
      default:
        if (cmd.startsWith("/") && rest.length === 0 && !cmd.includes("\\") && cmd.length < 20 && !SLASH.some((s) => s.cmd === cmd)) {
          dispatch({ type: "notice", text: `Unknown command ${cmd}. Try /help.` });
          return true;
        }
        return false;
    }
  }

  async function submit(text: string) {
    const value = text.trim();
    if (!value || t.running) return;
    stick.current = true;
    if (value.startsWith("/") && (await runSlash(value))) return;
    if (room === "arena" && /(^|\s)--full\b/.test(value)) {
      const ok = window.confirm("Run the full arena with 100 agents? It uses far more of your Claude plan than --quick (16). Cancel runs --quick instead.");
      dispatch({ type: "notice", text: ok ? "Full 100-agent arena confirmed." : "Running --quick (16 agents) instead." });
      await send(value, { full: ok });
      return;
    }
    await send(value);
  }

  const prompt = (
    <PromptBox
      placeholder={placeholder}
      running={t.running}
      locked={t.pendingPermission !== null}
      onSubmit={submit}
      onStop={stop}
      status={<StatusLine label={label} t={t} />}
    />
  );

  if (!started) {
    return (
      <div className={styles.landing}>
        <div className={styles.hero}>{hero}</div>
        {prompt}
        {suggestions.length > 0 && (
          <div className={styles.chips}>
            {suggestions.map((s) => (
              <button key={s} className={styles.chip} onClick={() => submit(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.console}>
      <header className={styles.topbar}>
        {scene && <div className={styles.sceneSlot} aria-label="Agents at work">{scene(pulled, active)}</div>}
        <div className={styles.roomLabel}>
          <span>{label}</span>
          <span className={styles.roster}>{pulled.length ? pulled.map((a) => AGENTS[a].name.replace("The ", "")).join(" · ") : "no agents pulled yet"}</span>
        </div>
      </header>
      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        <ol className={styles.transcript} aria-live="polite" aria-busy={t.running}>
          {t.items.map((item, i) => (
            <li key={i}>
              <ItemView item={item} onAnswer={answer} onSkills={(names) => dispatch(names.length ? { type: "skills_installed", names } : { type: "skills_dismissed" })} />
            </li>
          ))}
        </ol>
        {t.running && <Spinner active={active} />}
      </div>
      <div className={styles.dock}>{prompt}</div>
    </div>
  );
}

function AgentTag({ agent }: { agent: AgentId }) {
  return (
    <span className={styles.agentTag}>
      <Mascot kind={agent} size={20} sticker={false} />
      {AGENTS[agent].name}
    </span>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ItemView({ item, onAnswer, onSkills }: { item: Item; onAnswer: (id: string, d: Decision) => void; onSkills: (names: string[]) => void }) {
  switch (item.kind) {
    case "user":
      return <div className={styles.user}><span className={styles.caret} aria-hidden="true">&gt;</span><span className={styles.userText}>{item.text}</span></div>;
    case "text":
      return (
        <div className={styles.line} data-agent={item.agent ?? "lead"}>
          <span className={styles.dot} aria-hidden="true">●</span>
          <div className={styles.body}>
            {item.agent && <AgentTag agent={item.agent} />}
            <Markdown text={item.text} />
          </div>
        </div>
      );
    case "tool":
      return (
        <div className={styles.line}>
          <span className={styles.dot} data-status={item.status} aria-hidden="true">●</span>
          <div className={styles.body}>
            <span className={styles.toolName}>{item.summary}</span>
            {item.agent && <span className={styles.via}> · {AGENTS[item.agent].name}</span>}
            {item.status === "running" && <span className={styles.via}> running…</span>}
            {item.status === "stopped" && <span className={styles.via}> stopped</span>}
            {item.preview !== undefined && (
              <details className={styles.result}>
                <summary><span aria-hidden="true">⎿ </span>{item.status === "error" ? "Error: " : ""}{firstLine(item.preview)}{(item.lines ?? 0) > 1 ? ` (+${(item.lines ?? 1) - 1} lines)` : ""}</summary>
                <pre>{item.preview}</pre>
              </details>
            )}
          </div>
        </div>
      );
    case "agent":
      return (
        <div className={styles.agentBlock} data-status={item.status}>
          <Mascot kind={item.agent} size={28} sticker={false} />
          <div>
            <div><strong>{AGENTS[item.agent].name}</strong> <span className={styles.via}>{item.description}</span></div>
            <div className={styles.via}>
              {item.status === "running" ? (item.progress ?? `${AGENTS[item.agent].verb}…`) : item.status === "ok" ? "done" : item.status === "stopped" ? "stopped" : "failed"}
            </div>
          </div>
        </div>
      );
    case "permission":
      return <PermissionPrompt item={item} onAnswer={onAnswer} />;
    case "skills":
      return <SkillCard item={item} onDone={onSkills} />;
    case "error":
      return (
        <div className={styles.error} role="alert">
          <strong>Error</strong> {item.message}
          {item.hint && <div className={styles.hint}>{item.hint}</div>}
        </div>
      );
    case "notice":
      return <pre className={styles.notice}>{item.text}</pre>;
  }
}

function firstLine(s: string) {
  const line = s.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 99)}…` : line || "(no output)";
}

function PermissionPrompt({ item, onAnswer }: { item: Extract<Item, { kind: "permission" }>; onAnswer: (id: string, d: Decision) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const pending = !item.decision;
  useEffect(() => { if (pending) first.current?.focus(); }, [pending]);

  if (!pending) {
    const text = item.decision === "deny" ? "denied" : item.decision === "allow_session" ? "allowed for this chat" : "allowed once";
    return <div className={styles.permDone}><span aria-hidden="true">⎿ </span>{item.summary} — {text}</div>;
  }
  const choose = (d: Decision) => onAnswer(item.requestId, d);
  return (
    <div
      className={styles.perm}
      role="group"
      aria-label={`Permission needed: ${item.summary}`}
      onKeyDown={(e) => {
        if (e.key === "1") choose("allow");
        else if (e.key === "2") choose("allow_session");
        else if (e.key === "3") choose("deny");
      }}
    >
      <div className={styles.permTitle}>Allow <strong>{item.summary}</strong>?</div>
      <div className={styles.permOptions}>
        <button ref={first} onClick={() => choose("allow")}><kbd>1</kbd> Yes</button>
        <button onClick={() => choose("allow_session")}><kbd>2</kbd> Yes, for this chat</button>
        <button onClick={() => choose("deny")}><kbd>3</kbd> No</button>
      </div>
    </div>
  );
}

const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

function Spinner({ active }: { active: AgentId[] }) {
  const [tick, setTick] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor((Date.now() - start.current) / 1000);
  const verb = active.length ? active.map((a) => AGENTS[a].verb).join(" + ") : "Thinking";
  return (
    <div className={styles.spinner} role="status">
      <span className={styles.glyph} aria-hidden="true">{GLYPHS[tick % GLYPHS.length]}</span>
      {verb}… <span className={styles.via}>({secs}s · esc to interrupt)</span>
    </div>
  );
}

function StatusLine({ label, t }: { label: string; t: Transcript }) {
  const cwd = t.cwd ? t.cwd.replace(/^.*[\\/](?=[^\\/]+[\\/]?$)/, "…/") : "";
  return (
    <div className={styles.status}>
      <span>{label}</span>
      {t.model && <span>{t.model.replace(/^claude-/, "")}</span>}
      {cwd && <span title={t.cwd}>{cwd}</span>}
      {t.tokens > 0 && <span>{t.tokens >= 1000 ? `${(t.tokens / 1000).toFixed(1)}k` : t.tokens} tok</span>}
      <span className={styles.statusHint}>/ for commands</span>
    </div>
  );
}

function PromptBox({ placeholder, running, locked, onSubmit, onStop, status }: {
  placeholder: string; running: boolean; locked: boolean; onSubmit: (v: string) => void; onStop: () => void; status: ReactNode;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const matches = value.startsWith("/") && !value.includes(" ") ? SLASH.filter((s) => s.cmd.startsWith(value)) : [];

  useEffect(() => { if (!running && !locked) ref.current?.focus(); }, [running, locked]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  function fire() {
    if (running || locked || !value.trim()) return;
    const v = value;
    setValue("");
    onSubmit(v);
  }

  return (
    <form className={styles.promptWrap} onSubmit={(e) => { e.preventDefault(); fire(); }}>
      {matches.length > 0 && (
        <ul className={styles.slash} role="listbox" aria-label="Commands">
          {matches.map((m) => (
            <li key={m.cmd} role="option" aria-selected={false}>
              <button type="button" onClick={() => { setValue(`${m.cmd} `); ref.current?.focus(); }}>
                <span>{m.cmd}</span> <span className={styles.via}>{m.help}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.prompt} data-running={running}>
        <span className={styles.caret} aria-hidden="true">&gt;</span>
        <label className="sr-only" htmlFor="prompt-input">Message</label>
        <textarea
          id="prompt-input"
          ref={ref}
          rows={1}
          value={value}
          maxLength={100_000}
          placeholder={locked ? "Answer the permission prompt above (1, 2 or 3)" : placeholder}
          disabled={locked}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); fire(); }
            if (e.key === "Tab" && matches.length === 1) { e.preventDefault(); setValue(`${matches[0].cmd} `); }
          }}
        />
        {running ? (
          <button type="button" className={styles.sendButton} onClick={onStop} aria-label="Stop (Esc)">■</button>
        ) : (
          <button type="submit" className={styles.sendButton} disabled={!value.trim() || locked} aria-label="Send">↵</button>
        )}
      </div>
      {status}
    </form>
  );
}
