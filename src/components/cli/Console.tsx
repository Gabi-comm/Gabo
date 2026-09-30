"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentKey } from "@/harness/agents";
import type { Decision, Diff, Todo } from "@/harness/events";
import { rosterFor, type RoomId } from "@/harness/rooms";
import { Mascot } from "@/components/mascot/Mascot";
import { activeAgents, pulledAgents, type Item, type Transcript } from "./transcript";
import { useConversation } from "./useConversation";
import { SkillCard } from "./SkillCard";
import { AgentMascot, useAgentMeta } from "@/components/agents/registry";
import type { AgentInfo } from "@/harness/agentMeta";

type Meta = (id: AgentKey) => AgentInfo;
import { fetchClaudeInfo, toRunPrefs, useClaudeInfo, useLocalLlm, usePrefs, type ClaudeInfo, type Prefs } from "./useClaude";
import { EFFORTS, MODES, MODE_LABELS, isMode, nextMode, type Mode } from "@/harness/controls";
import { MAX_IMAGES, MAX_IMAGE_B64, type ImageAttachment } from "@/harness/images";
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
  scene?: (pulled: AgentKey[], active: AgentKey[]) => ReactNode;
  /** Laboratory: the team picked for this chat (sent with each message). */
  team?: AgentKey[];
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

export function Console({ room, conversationId, sessionId, team, label, placeholder, hero, scene, suggestions = [] }: ConsoleProps) {
  const { t, dispatch, send, stop, answer, reset, conversationId: liveId } = useConversation(room, conversationId, sessionId);
  const info = useClaudeInfo();
  const local = useLocalLlm();
  const meta = useAgentMeta();
  const [prefs, setPrefs] = usePrefs(info?.defaultMode);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  useEffect(() => {
    try { setInputHistory(JSON.parse(localStorage.getItem(INPUT_HISTORY_KEY) ?? "[]")); } catch { /* storage blocked */ }
  }, []);
  function remember(text: string) {
    setInputHistory((h) => {
      const next = [...h.filter((x) => x !== text), text].slice(-INPUT_HISTORY_MAX);
      try { localStorage.setItem(INPUT_HISTORY_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }
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
    void submit(next.text, next.images, true);
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
        dispatch({ type: "notice", text: rosterFor(room, team).map((a) => `${meta(a).name.padEnd(15)} ${meta(a).tagline}`).join("\n") });
        return true;
      case "/cost":
        dispatch({ type: "notice", text: `${t.tokens.toLocaleString()} tokens this chat · $${t.costUsd.toFixed(4)} API-equivalent (billed to your Claude plan, not per token)` });
        return true;
      case "/skills": {
        const last = [...t.items].reverse().find((i) => i.kind === "skills");
        dispatch({ type: "notice", text: last && last.kind === "skills" ? last.lines.map((l) => `${meta(l.agent).name}: ${l.skills.join(", ") || "none"}${l.why ? ` — ${l.why}` : ""}`).join("\n") || "No skills picked yet." : "Skills are picked on the first message of a chat." });
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
        {
          // The command list may still be loading: wait for it rather than guess.
          const known = info ?? (await fetchClaudeInfo());
          if (!known || known.commands.some((c) => `/${c.name}` === cmd)) return false; // Claude Code runs it
        }
        if (cmd.startsWith("/") && rest.length === 0 && !cmd.includes("\\") && cmd.length < 40) {
          dispatch({ type: "notice", text: `Unknown command ${cmd}. Try /help.` });
          return true;
        }
        return false;
    }
  }

  async function submit(text: string, images: ImageAttachment[] = [], fromQueue = false) {
    const value = text.trim();
    if (!value && images.length === 0) return;
    if (value && !fromQueue) remember(value);
    if (t.running) { setQueue((q) => [...q, { text: value, images }]); return; }
    if (images.length) { stick.current = true; await send(value, { prefs: toRunPrefs(prefs), images, team }); return; }
    stick.current = true;
    if (value.startsWith("/") && (await runSlash(value))) return;
    if (room === "arena" && /(^|\s)--full\b/.test(value)) {
      const ok = window.confirm("Run the full arena with 100 agents? It uses far more of your Claude plan than --quick (16). Cancel runs --quick instead.");
      dispatch({ type: "notice", text: ok ? "Full 100-agent arena confirmed." : "Running --quick (16 agents) instead." });
      await send(value, { full: ok, prefs: toRunPrefs(prefs), team });
      return;
    }
    await send(value, { prefs: toRunPrefs(prefs), team });
  }

  const prompt = (
    <PromptBox
      placeholder={placeholder}
      running={t.running}
      locked={t.pendingPermission !== null}
      commands={commands}
      queue={queue}
      history={inputHistory}
      onSubmit={submit}
      onStop={() => { setQueue([]); stop(); }}
      onCycleMode={cycleMode}
      onUnqueue={(i) => setQueue((q) => q.filter((_, j) => j !== i))}
      findFiles={async (q) => {
        const res = await fetch(`/api/files?c=${encodeURIComponent(liveId ?? "")}&q=${encodeURIComponent(q)}`).catch(() => null);
        return res?.ok ? ((await res.json()) as string[]) : [];
      }}
      onError={(message) => dispatch({ type: "error", message })}
      status={<StatusLine label={label} t={t} prefs={prefs} local={local?.enabled ? local.model : null} models={info?.models ?? []} onMode={cycleMode} onModel={setModel} onEffort={(effort) => setPrefs({ effort })} />}
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
          <span className={styles.roster}>{pulled.length ? pulled.map((a) => meta(a).short).join(" · ") : "no agents pulled yet"}</span>
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
              <ItemView item={item} meta={meta} onAnswer={answer} onSkills={(names) => dispatch(names.length ? { type: "skills_installed", names } : { type: "skills_dismissed" })} />
            </li>
          ))}
        </ol>
        {t.running && <Spinner active={active} meta={meta} />}
      </div>
      <div className={styles.dock}>
        <TodoPanel todos={t.todos ?? []} />
        {prompt}
      </div>
    </div>
  );
}

function AgentTag({ agent, meta }: { agent: AgentKey; meta: Meta }) {
  return (
    <span className={styles.agentTag}>
      <AgentMascot id={agent} info={meta(agent)} size={20} sticker={false} />
      {meta(agent).name}
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

type Answer = (id: string, d: Decision, answers?: Record<string, string>) => void;

function ItemView({ item, meta, onAnswer, onSkills }: { item: Item; meta: Meta; onAnswer: Answer; onSkills: (names: string[]) => void }) {
  switch (item.kind) {
    case "user":
      return (
        <div className={styles.user}>
          <span className={styles.caret} aria-hidden="true">&gt;</span>
          <span className={styles.userText}>
            {item.images ? <span className={styles.imageTag}>[{item.images} image{item.images > 1 ? "s" : ""}]</span> : null}{item.images && item.text ? " " : ""}{item.text}
          </span>
        </div>
      );
    case "text":
      return (
        <div className={styles.line} data-agent={item.agent ?? "lead"}>
          <span className={styles.dot} aria-hidden="true">●</span>
          <div className={styles.body}>
            {item.agent && <AgentTag agent={item.agent} meta={meta} />}
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
            {item.agent && <span className={styles.via}> · {meta(item.agent).name}</span>}
            {item.status === "running" && <span className={styles.via}> running…</span>}
            {item.status === "stopped" && <span className={styles.via}> stopped</span>}
            {item.diff && <DiffView diff={item.diff} />}
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
          <AgentMascot id={item.agent} info={meta(item.agent)} size={28} sticker={false} />
          <div>
            <div><strong>{meta(item.agent).name}</strong> <span className={styles.via}>{item.description}</span></div>
            <div className={styles.via}>
              {item.status === "running" ? (item.progress ?? `${meta(item.agent).verb}…`) : item.status === "ok" ? "done" : item.status === "stopped" ? "stopped" : "failed"}
            </div>
          </div>
        </div>
      );
    case "permission":
      if (item.ask === "question") return <QuestionPrompt item={item} onAnswer={onAnswer} />;
      if (item.ask === "plan") return <PlanPrompt item={item} onAnswer={onAnswer} />;
      return <PermissionPrompt item={item} onAnswer={onAnswer} />;
    case "skills":
      return <SkillCard item={item} meta={meta} onDone={onSkills} />;
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

const DIFF_LINES = 14;

function DiffView({ diff }: { diff: Diff }) {
  const lines = (text: string | undefined, sign: "-" | "+") =>
    (text ?? "").split("\n").slice(0, DIFF_LINES).map((l, i) => (
      <div key={`${sign}${i}`} className={sign === "-" ? styles.diffDel : styles.diffAdd}><span aria-hidden="true">{sign} </span>{l || " "}</div>
    ));
  const more = Math.max(0, (diff.removed ?? "").split("\n").length - DIFF_LINES) + Math.max(0, (diff.added ?? "").split("\n").length - DIFF_LINES);
  return (
    <details className={styles.result} open>
      <summary><span aria-hidden="true">⎿ </span>{diff.removed !== undefined ? "Changes" : "New content"} in {diff.path}</summary>
      <div className={styles.diff} aria-label={`Diff of ${diff.path}`}>
        {diff.removed !== undefined && lines(diff.removed, "-")}
        {lines(diff.added, "+")}
        {more > 0 && <div className={styles.via}>… {more} more lines</div>}
      </div>
    </details>
  );
}

function QuestionPrompt({ item, onAnswer }: { item: Extract<Item, { kind: "permission" }>; onAnswer: Answer }) {
  const questions = item.questions ?? [];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const first = useRef<HTMLInputElement>(null);
  const pending = !item.decision;
  useEffect(() => { if (pending) first.current?.focus(); }, [pending]);

  if (!pending) {
    const text = item.decision === "deny" ? "skipped" : Object.entries(item.answers ?? {}).map(([q, a]) => `${q} → ${a}`).join(" · ");
    return <div className={styles.permDone}><span aria-hidden="true">⎿ </span>Question — {text}</div>;
  }
  const answerFor = (q: string) => [...(picked[q] ?? []), ...(other[q]?.trim() ? [other[q].trim()] : [])].join(", ");
  const ready = questions.every((q) => answerFor(q.question) !== "");
  const toggle = (q: string, label: string, multi: boolean) =>
    setPicked((p) => {
      const cur = p[q] ?? [];
      return { ...p, [q]: multi ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label] };
    });
  const submit = () => {
    if (!ready) return;
    onAnswer(item.requestId, "allow", Object.fromEntries(questions.map((q) => [q.question, answerFor(q.question)])));
  };

  return (
    <form className={styles.perm} role="group" aria-label="Claude has a question" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {questions.map((q, qi) => (
        <fieldset key={q.question} className={styles.question}>
          <legend>{q.header && <span className={styles.qHeader}>{q.header}</span>} {q.question}</legend>
          {q.options.map((o, oi) => (
            <label key={o.label} className={styles.option}>
              <input
                ref={qi === 0 && oi === 0 ? first : undefined}
                type={q.multiSelect ? "checkbox" : "radio"}
                name={`q${qi}`}
                checked={(picked[q.question] ?? []).includes(o.label)}
                onChange={() => toggle(q.question, o.label, !!q.multiSelect)}
              />
              <span>{o.label}{o.description && <span className={styles.via}> — {o.description}</span>}</span>
            </label>
          ))}
          <input
            className={styles.otherInput}
            placeholder="Other…"
            aria-label={`Other answer to: ${q.question}`}
            value={other[q.question] ?? ""}
            onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
          />
        </fieldset>
      ))}
      <div className={styles.permOptions}>
        <button type="submit" disabled={!ready}>Answer</button>
        <button type="button" onClick={() => onAnswer(item.requestId, "deny")}>Skip</button>
      </div>
    </form>
  );
}

function PlanPrompt({ item, onAnswer }: { item: Extract<Item, { kind: "permission" }>; onAnswer: Answer }) {
  const first = useRef<HTMLButtonElement>(null);
  const pending = !item.decision;
  useEffect(() => { if (pending) first.current?.focus(); }, [pending]);
  if (!pending) {
    const text = item.decision === "deny" ? "kept planning" : item.decision === "allow_session" ? "approved, auto-accepting edits" : "approved, edits need approval";
    return <div className={styles.permDone}><span aria-hidden="true">⎿ </span>Plan — {text}</div>;
  }
  const choose = (d: Decision) => onAnswer(item.requestId, d);
  return (
    <div
      className={styles.perm}
      role="group"
      aria-label="Claude has a plan"
      onKeyDown={(e) => {
        if (e.key === "1") choose("allow_session");
        else if (e.key === "2") choose("allow");
        else if (e.key === "3") choose("deny");
      }}
    >
      <div className={styles.permTitle}>Ready to code? Here is Claude&apos;s plan:</div>
      <div className={styles.planBody}><Markdown text={item.plan || "(The plan is in the transcript above.)"} /></div>
      <div className={styles.permOptions}>
        <button ref={first} onClick={() => choose("allow_session")}><kbd>1</kbd> Yes, and auto-accept edits</button>
        <button onClick={() => choose("allow")}><kbd>2</kbd> Yes, and manually approve edits</button>
        <button onClick={() => choose("deny")}><kbd>3</kbd> No, keep planning</button>
      </div>
    </div>
  );
}

function TodoPanel({ todos }: { todos: Todo[] }) {
  if (!todos.length || todos.every((t) => t.status === "completed")) return null;
  const glyph = { completed: "☒", in_progress: "◐", pending: "☐" } as const;
  return (
    <ul className={styles.todos} aria-label="Todo list">
      {todos.map((t, i) => (
        <li key={i} data-status={t.status}>
          <span aria-hidden="true">{glyph[t.status]}</span> {t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}
          <span className="sr-only"> ({t.status.replace("_", " ")})</span>
        </li>
      ))}
    </ul>
  );
}

function PermissionPrompt({ item, onAnswer }: { item: Extract<Item, { kind: "permission" }>; onAnswer: Answer }) {
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

function Spinner({ active, meta }: { active: AgentKey[]; meta: Meta }) {
  const [tick, setTick] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor((Date.now() - start.current) / 1000);
  const verb = active.length ? active.map((a) => meta(a).verb).join(" + ") : "Thinking";
  return (
    <div className={styles.spinner} role="status">
      <span className={styles.glyph} aria-hidden="true">{GLYPHS[tick % GLYPHS.length]}</span>
      {verb}… <span className={styles.via}>({secs}s · esc to interrupt)</span>
    </div>
  );
}

interface Cmd { cmd: string; help: string }

const INPUT_HISTORY_KEY = "gabo:input-history";
const INPUT_HISTORY_MAX = 100;
interface Queued { text: string; images: ImageAttachment[] }
interface Attachment extends ImageAttachment { url: string }

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function readImage(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ mediaType: file.type, data: url.slice(url.indexOf(",") + 1), url });
    };
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name || "the image"}.`));
    reader.readAsDataURL(file);
  });
}

function StatusLine({ label, t, prefs, local, models, onMode, onModel, onEffort }: {
  label: string; t: Transcript; prefs: Prefs; local: string | null; models: ClaudeInfo["models"];
  onMode: () => void; onModel: (m: string) => void; onEffort: (e: Prefs["effort"]) => void;
}) {
  const cwd = t.cwd ? t.cwd.replace(/^.*[\\/](?=[^\\/]+[\\/]?$)/, "…/") : "";
  return (
    <div className={styles.status}>
      <button type="button" className={styles.modeButton} data-mode={prefs.mode} onClick={onMode} title="Permission mode (Shift+Tab)">
        {MODE_LABELS[prefs.mode]}
      </button>
      {local && <a href="/local-llm" className={styles.localBadge} title="Agents run on Ollama. Change it on the Local LLM page.">local · {local}</a>}
      <select className={styles.picker} value={prefs.model} onChange={(e) => onModel(e.target.value)} aria-label="Model" disabled={!!local} hidden={!!local}>
        <option value="">{t.model ? t.model.replace(/^claude-/, "") : "model: default"}</option>
        {models.map((m) => <option key={m.value} value={m.value}>{m.displayName || m.value}</option>)}
      </select>
      <select className={styles.picker} hidden={!!local} value={prefs.effort} onChange={(e) => onEffort(e.target.value as Prefs["effort"])} aria-label="Effort">
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

function PromptBox({ placeholder, running, locked, commands, queue, history, onSubmit, onStop, onCycleMode, onUnqueue, findFiles, onError, status }: {
  placeholder: string; running: boolean; locked: boolean; commands: Cmd[]; queue: Queued[]; history: string[];
  onSubmit: (v: string, images: ImageAttachment[]) => void; onStop: () => void; onCycleMode: () => void; onUnqueue: (i: number) => void;
  findFiles: (q: string) => Promise<string[]>; onError: (message: string) => void; status: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<Attachment[]>([]);
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);

  // @ mentions: the word being typed at the caret, looked up in the workspace.
  function trackMention(text: string, caret: number) {
    const m = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
    setMention(m ? { start: caret - m[2].length - 1, end: caret, query: m[2] } : null);
  }
  useEffect(() => {
    if (!mention) { setFiles([]); return; }
    let alive = true;
    const t = setTimeout(() => { findFiles(mention.query).then((f) => { if (alive) setFiles(f.slice(0, 12)); }); }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mention?.query, mention?.start]);
  function pickFile(file: string) {
    if (!mention) return;
    const next = `${value.slice(0, mention.start)}@${file} ${value.slice(mention.end)}`;
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + file.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  async function addFiles(list: FileList | File[]) {
    const picked = Array.from(list).filter((f) => IMAGE_TYPES.includes(f.type));
    if (!picked.length) return false;
    if (images.length + picked.length > MAX_IMAGES) { onError(`Attach at most ${MAX_IMAGES} images per message.`); return true; }
    try {
      const read = await Promise.all(picked.map(readImage));
      const tooBig = read.find((r) => r.data.length > MAX_IMAGE_B64);
      if (tooBig) { onError("An image is too large (keep each under about 3.5 MB)."); return true; }
      setImages((cur) => [...cur, ...read]);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    return true;
  }
  const [sel, setSel] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [histIdx, setHistIdx] = useState(-1);
  const draft = useRef("");
  const listRef = useRef<HTMLUListElement>(null);

  const typed = value.startsWith("/") && !value.includes(" ") ? value.slice(1).toLowerCase() : null;
  const matches = typed === null || dismissed ? [] : commands
    .filter((c) => c.cmd.slice(1).toLowerCase().startsWith(typed) || (typed.length > 1 && c.cmd.toLowerCase().includes(typed)))
    .sort((a, b) => Number(!a.cmd.slice(1).toLowerCase().startsWith(typed)) - Number(!b.cmd.slice(1).toLowerCase().startsWith(typed)));
  const fileMenu = mention && !dismissed && files.length > 0 ? files : [];
  const menuSize = matches.length || fileMenu.length;

  // A new query starts at the top, or on the command typed in full.
  useEffect(() => {
    const exact = matches.findIndex((m) => m.cmd.toLowerCase() === `/${typed}`);
    setSel(exact >= 0 ? exact : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, mention?.query, files.length]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel, menuSize]);

  function recall(step: 1 | -1) {
    const next = histIdx + step;
    if (next < -1 || next >= history.length) return;
    if (histIdx === -1) draft.current = value;
    setHistIdx(next);
    setValue(next === -1 ? draft.current : history[history.length - 1 - next]);
    setMention(null);
    requestAnimationFrame(() => { const el = ref.current; if (el) el.setSelectionRange(el.value.length, el.value.length); });
  }

  useEffect(() => { if (!running && !locked) ref.current?.focus(); }, [running, locked]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  function fire(text = value) {
    if (locked || (!text.trim() && images.length === 0)) return;
    const v = text;
    setHistIdx(-1);
    draft.current = "";
    const imgs = images.map(({ mediaType, data }) => ({ mediaType, data }));
    setValue("");
    setImages([]);
    setMention(null);
    onSubmit(v, imgs);
  }

  return (
    <form className={styles.promptWrap} onSubmit={(e) => { e.preventDefault(); fire(); }}>
      {matches.length > 0 && (
        <ul className={styles.slash} role="listbox" aria-label="Commands" id="prompt-menu" ref={listRef}>
          {matches.map((m, i) => (
            <li key={m.cmd} id={`prompt-opt-${i}`} role="option" aria-selected={i === sel}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setSel(i)} onClick={() => { setValue(`${m.cmd} `); ref.current?.focus(); }}>
                <span>{m.cmd}</span> <span className={styles.via}>{m.help}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileMenu.length > 0 && (
        <ul className={styles.slash} role="listbox" aria-label="Files" id="prompt-menu" ref={listRef}>
          {fileMenu.map((f, i) => (
            <li key={f} id={`prompt-opt-${i}`} role="option" aria-selected={i === sel}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setSel(i)} onClick={() => pickFile(f)}>@{f}</button>
            </li>
          ))}
        </ul>
      )}
      {queue.length > 0 && (
        <ul className={styles.queue} aria-label="Queued messages">
          {queue.map((q, i) => (
            <li key={i}>
              <span className={styles.via}>queued</span> <span className={styles.queueText}>{q.images.length ? `[${q.images.length} image${q.images.length > 1 ? "s" : ""}] ` : ""}{q.text}</span>
              <button type="button" onClick={() => onUnqueue(i)} aria-label={`Remove queued message: ${q.text}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      {images.length > 0 && (
        <ul className={styles.attachments} aria-label="Attached images">
          {images.map((img, i) => (
            <li key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={`Attached image ${i + 1}`} />
              <button type="button" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove image ${i + 1}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div
        className={styles.prompt}
        data-running={running}
        onDragOver={(e) => { if (Array.from(e.dataTransfer.items).some((i) => i.kind === "file")) e.preventDefault(); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(e.dataTransfer.files); } }}
      >
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
          role="combobox"
          aria-expanded={menuSize > 0}
          aria-controls={menuSize > 0 ? "prompt-menu" : undefined}
          aria-activedescendant={menuSize > 0 ? `prompt-opt-${sel}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => {
            setValue(e.target.value);
            setDismissed(false);
            setHistIdx(-1);
            trackMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files);
            if (pasted.some((f) => IMAGE_TYPES.includes(f.type))) { e.preventDefault(); void addFiles(pasted); }
          }}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            // Menus (/ commands, @ files): arrows move, Enter/Tab pick, Esc closes.
            if (menuSize > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setSel((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + menuSize) % menuSize);
            } else if (menuSize > 0 && e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDismissed(true);
            } else if (fileMenu.length > 0 && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && !e.shiftKey) {
              e.preventDefault();
              pickFile(fileMenu[sel] ?? fileMenu[0]);
            } else if (matches.length > 0 && e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              setValue(`${(matches[sel] ?? matches[0]).cmd} `);
            } else if (matches.length > 0 && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              fire((matches[sel] ?? matches[0]).cmd);
            } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              fire();
            } else if (e.key === "Tab" && e.shiftKey) {
              e.preventDefault();
              onCycleMode();
            } else if (e.key === "ArrowUp" && history.length > 0 && !el.value.slice(0, el.selectionStart).includes("\n")) {
              // Previous prompts, like a terminal: only from the first line so multi-line editing still works.
              e.preventDefault();
              recall(1);
            } else if (e.key === "ArrowDown" && histIdx >= 0 && !el.value.slice(el.selectionEnd).includes("\n")) {
              e.preventDefault();
              recall(-1);
            }
          }}
        />
        {running && !value.trim() && images.length === 0 ? (
          <button type="button" className={styles.sendButton} onClick={onStop} aria-label="Stop (Esc)">■</button>
        ) : (
          <button type="submit" className={styles.sendButton} disabled={(!value.trim() && images.length === 0) || locked} aria-label={running ? "Queue" : "Send"}>↵</button>
        )}
      </div>
      {status}
    </form>
  );
}
