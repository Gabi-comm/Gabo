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
import { fetchClaudeInfo, toRunPrefs, useClaudeInfo, usePrefs, type ClaudeInfo, type Prefs } from "./useClaude";
import { EFFORTS, MODES, MODE_LABELS, isMode, nextMode, type Mode } from "@/harness/controls";
import styles from "./console.module.css";

export interface ConsoleProps {
  room: RoomId;
  conversationId?: string;
  /** A Claude Code session id to open (from history). */
  sessionId?: string;
  label: string;
  placeholder: string;
  /** Shown above the input before the first message (the room's intro scene). */
  hero: ReactNode;
  /** Top-left scene of the pulled agents once the chat has started. */
  scene?: (pulled: AgentId[], active: AgentId[]) => ReactNode;
  suggestions?: string[];
}

/** Handled by the app itself. Everything else typed with / goes to Claude Code (skills, plugins, /compact, /context, …). */
const APP_COMMANDS: Cmd[] = [
  { cmd: "/clear", help: "start a new chat in this room" },
  { cmd: "/model", help: "show or set the model: /model opus" },
  { cmd: "/mode", help: "permission mode: default, acceptEdits, plan, auto" },
  { cmd: "/effort", help: "thinking effort: low, medium, high, xhigh, max, auto" },
  { cmd: "/mcp", help: "MCP servers and their status" },
  { cmd: "/agents", help: "list the agents this room can pull" },
  { cmd: "/cost", help: "tokens used in this chat" },
  { cmd: "/cwd", help: "show or set the workspace folder: /cwd C:\\path" },
  { cmd: "/skills", help: "show the skills each agent kept" },
  { cmd: "/help", help: "list commands and keys" },
];

export function Console({ room, conversationId, sessionId, label, placeholder, hero, scene, suggestions = [] }: ConsoleProps) {
  const { t, dispatch, send, stop, answer, reset, conversationId: liveId } = useConversation(room, conversationId, sessionId);
  const info = useClaudeInfo();
  const [prefs, setPrefs] = usePrefs(info?.defaultMode);
  const [queue, setQueue] = useState<string[]>([]);
  const commands = useMemo<Cmd[]>(() => {
    const own = new Set(APP_COMMANDS.map((c) => c.cmd));
    const cli = (info?.commands ?? []).map((c) => ({ cmd: `/${c.name}`, help: c.description })).filter((c) => !own.has(c.cmd));
    return [...APP_COMMANDS, ...cli];
  }, [info]);
  const cliCommands = useMemo(() => new Set((info?.commands ?? []).map((c) => `/${c.name}`)), [info]);

  // Mid-run changes go to the live query, like Shift+Tab or /model in the CLI.
  function control(patch: { mode?: Mode; model?: string }) {
    if (!t.running || !liveId) return;
    fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: liveId, ...patch }) }).catch(() => {});
  }
  function setMode(mode: Mode) { setPrefs({ mode }); control({ mode }); }
  function setModel(model: string) { setPrefs({ model }); control({ model: model || "default" }); }
  const cycleMode = () => setMode(nextMode(prefs.mode));

  // The CLI changes mode itself sometimes (e.g. plan approved -> accept edits); follow it.
  useEffect(() => { if (isMode(t.mode)) setPrefs({ mode: t.mode }); }, [t.mode, setPrefs]);

  // Send queued messages one at a time once Claude is free.
  useEffect(() => {
    if (t.running || t.pendingPermission || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    void submit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.running, t.pendingPermission, queue]);
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
      if (e.key === "Escape" && t.running) { e.preventDefault(); setQueue([]); stop(); }
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
        dispatch({ type: "notice", text: [
          ...APP_COMMANDS.map((c) => `${c.cmd.padEnd(9)} ${c.help}`),
          `…and ${cliCommands.size} Claude Code commands (skills, plugins, /compact, /context, /init, /review…): type / to browse.`,
          "Enter send (queues while Claude works) · Shift+Enter newline · Shift+Tab permission mode · Esc interrupt · 1/2/3 answer a permission prompt",
        ].join("\n") });
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
      case "/model": {
        if (!arg) {
          dispatch({ type: "notice", text: `Model: ${prefs.model || "default"}${t.model ? ` (last run: ${t.model})` : ""}\nAvailable: ${(info?.models ?? []).map((m) => m.value).join(", ") || "loading…"}` });
          return true;
        }
        setModel(arg === "default" ? "" : arg);
        dispatch({ type: "notice", text: `Model set to ${arg}.` });
        return true;
      }
      case "/mode": {
        if (!arg) { dispatch({ type: "notice", text: `Permission mode: ${prefs.mode}. Options: ${MODES.join(", ")} (Shift+Tab cycles).` }); return true; }
        if (!isMode(arg)) { dispatch({ type: "error", message: `Unknown mode ${arg}. Use ${MODES.join(", ")}.` }); return true; }
        setMode(arg);
        dispatch({ type: "notice", text: `Permission mode: ${MODE_LABELS[arg]}.` });
        return true;
      }
      case "/effort": {
        const v = arg === "auto" ? "" : arg;
        if (arg && v !== "" && !(EFFORTS as readonly string[]).includes(v)) { dispatch({ type: "error", message: `Effort is one of ${EFFORTS.join(", ")}, or auto.` }); return true; }
        if (arg) setPrefs({ effort: v as Prefs["effort"] });
        dispatch({ type: "notice", text: `Effort: ${(arg ? v : prefs.effort) || "auto"}.` });
        return true;
      }
      case "/mcp": {
        const fresh = await fetchClaudeInfo(true);
        dispatch({ type: "notice", text: fresh ? fresh.mcp.map((m) => `${m.status.padEnd(11)} ${m.name}${m.error ? ` — ${m.error}` : ""}`).join("\n") || "No MCP servers." : "Couldn't reach Claude Code to list MCP servers." });
        return true;
      }
      default:
        if (cliCommands.has(cmd) || !info) return false; // Claude Code runs it
        if (cmd.startsWith("/") && rest.length === 0 && !cmd.includes("\\") && cmd.length < 40) {
          dispatch({ type: "notice", text: `Unknown command ${cmd}. Try /help.` });
          return true;
        }
        return false;
    }
  }

  async function submit(text: string) {
    const value = text.trim();
    if (!value) return;
    if (t.running) { setQueue((q) => [...q, value]); return; }
    stick.current = true;
    if (value.startsWith("/") && (await runSlash(value))) return;
    if (room === "arena" && /(^|\s)--full\b/.test(value)) {
      const ok = window.confirm("Run the full arena with 100 agents? It uses far more of your Claude plan than --quick (16). Cancel runs --quick instead.");
      dispatch({ type: "notice", text: ok ? "Full 100-agent arena confirmed." : "Running --quick (16 agents) instead." });
      await send(value, { full: ok, prefs: toRunPrefs(prefs) });
      return;
    }
    await send(value, { prefs: toRunPrefs(prefs) });
  }

  const prompt = (
    <PromptBox
      placeholder={placeholder}
      running={t.running}
      locked={t.pendingPermission !== null}
      commands={commands}
      queue={queue}
      onSubmit={submit}
      onStop={() => { setQueue([]); stop(); }}
      onCycleMode={cycleMode}
      onUnqueue={(i) => setQueue((q) => q.filter((_, j) => j !== i))}
      status={<StatusLine label={label} t={t} prefs={prefs} models={info?.models ?? []} onMode={cycleMode} onModel={setModel} onEffort={(effort) => setPrefs({ effort })} />}
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

interface Cmd { cmd: string; help: string }

function StatusLine({ label, t, prefs, models, onMode, onModel, onEffort }: {
  label: string; t: Transcript; prefs: Prefs; models: ClaudeInfo["models"];
  onMode: () => void; onModel: (m: string) => void; onEffort: (e: Prefs["effort"]) => void;
}) {
  const cwd = t.cwd ? t.cwd.replace(/^.*[\\/](?=[^\\/]+[\\/]?$)/, "…/") : "";
  return (
    <div className={styles.status}>
      <button type="button" className={styles.modeButton} data-mode={prefs.mode} onClick={onMode} title="Permission mode (Shift+Tab)">
        {MODE_LABELS[prefs.mode]}
      </button>
      <select className={styles.picker} value={prefs.model} onChange={(e) => onModel(e.target.value)} aria-label="Model">
        <option value="">{t.model ? t.model.replace(/^claude-/, "") : "model: default"}</option>
        {models.map((m) => <option key={m.value} value={m.value}>{m.displayName || m.value}</option>)}
      </select>
      <select className={styles.picker} value={prefs.effort} onChange={(e) => onEffort(e.target.value as Prefs["effort"])} aria-label="Effort">
        <option value="">effort: auto</option>
        {EFFORTS.map((e) => <option key={e} value={e}>effort: {e}</option>)}
      </select>
      <span>{label}</span>
      {cwd && <span title={t.cwd}>{cwd}</span>}
      {t.tokens > 0 && <span>{t.tokens >= 1000 ? `${(t.tokens / 1000).toFixed(1)}k` : t.tokens} tok</span>}
      <span className={styles.statusHint}>/ commands · Shift+Tab mode</span>
    </div>
  );
}

function PromptBox({ placeholder, running, locked, commands, queue, onSubmit, onStop, onCycleMode, onUnqueue, status }: {
  placeholder: string; running: boolean; locked: boolean; commands: Cmd[]; queue: string[];
  onSubmit: (v: string) => void; onStop: () => void; onCycleMode: () => void; onUnqueue: (i: number) => void; status: ReactNode;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const typed = value.startsWith("/") && !value.includes(" ") ? value.slice(1).toLowerCase() : null;
  const matches = typed === null ? [] : commands
    .filter((c) => c.cmd.slice(1).toLowerCase().startsWith(typed) || (typed.length > 1 && c.cmd.toLowerCase().includes(typed)))
    .sort((a, b) => Number(!a.cmd.slice(1).toLowerCase().startsWith(typed)) - Number(!b.cmd.slice(1).toLowerCase().startsWith(typed)))
    .slice(0, 12);

  useEffect(() => { if (!running && !locked) ref.current?.focus(); }, [running, locked]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  function fire() {
    if (locked || !value.trim()) return;
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
      {queue.length > 0 && (
        <ul className={styles.queue} aria-label="Queued messages">
          {queue.map((q, i) => (
            <li key={i}>
              <span className={styles.via}>queued</span> <span className={styles.queueText}>{q}</span>
              <button type="button" onClick={() => onUnqueue(i)} aria-label={`Remove queued message: ${q}`}>×</button>
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
          placeholder={locked ? "Answer the permission prompt above (1, 2 or 3)" : running ? "Type to queue a message for when Claude finishes" : placeholder}
          disabled={locked}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); fire(); }
            else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); onCycleMode(); }
            else if (e.key === "Tab" && matches.length > 0) { e.preventDefault(); setValue(`${matches[0].cmd} `); }
          }}
        />
        {running && !value.trim() ? (
          <button type="button" className={styles.sendButton} onClick={onStop} aria-label="Stop (Esc)">■</button>
        ) : (
          <button type="submit" className={styles.sendButton} disabled={!value.trim() || locked} aria-label={running ? "Queue" : "Send"}>↵</button>
        )}
      </div>
      {status}
    </form>
  );
}
