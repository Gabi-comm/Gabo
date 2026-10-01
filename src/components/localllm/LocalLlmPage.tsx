"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LOCAL_CHANGED } from "@/components/cli/useClaude";
import { LocalPlugins } from "./LocalPlugins";
import styles from "./localllm.module.css";

interface Config { enabled: boolean; baseUrl: string; model: string }
interface Model { name: string; size: number; parameterSize?: string; family?: string }
interface Ollama { running: boolean; version?: string; models: Model[]; error?: string }
interface Details { contextWindow: number | null; maxContext: number | null; tools: boolean; capabilities: string[] }

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;
/** Gabo's slim local prompt is about 12k tokens; 16k is the floor, 32k leaves room for the chat. */
const MIN_CONTEXT = 16384;

/** Models that call tools reliably, smallest first, with the memory they need at a 32k context. */
const RECOMMENDED = [
  { name: "qwen3:4b", ram: 8, note: "Lightest that still calls tools. For 8 GB machines." },
  { name: "qwen3:8b", ram: 16, note: "Recommended for 16 GB: good tool use, about 5 GB to download." },
  { name: "gpt-oss:20b", ram: 32, note: "Stronger all-rounder. Needs about 32 GB." },
  { name: "qwen3-coder:30b", ram: 32, note: "Best for code. Needs 32 GB or more." },
];

export function LocalLlmPage() {
  const params = useSearchParams();
  const setupFirst = params.get("setup") === "1";
  const guideRef = useRef<HTMLElement>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [ollama, setOllama] = useState<Ollama | null>(null);
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pullName, setPullName] = useState("qwen3:8b");
  const [pull, setPull] = useState<{ status: string; pct: number } | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [ramGb, setRamGb] = useState<number | null>(null);
  const [numCtx, setNumCtx] = useState(32768);
  const [tested, setTested] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/local-llm", { cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body?.config) { setMsg({ kind: "error", text: "Couldn't load the local LLM settings." }); return; }
    setConfig(body.config);
    setOllama(body.ollama);
    setModel((m) => m || body.config.model || body.ollama.models[0]?.name || "");
    setBaseUrl(body.config.baseUrl);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (setupFirst) guideRef.current?.scrollIntoView({ block: "start" }); }, [setupFirst]);

  // Context window and tool support of the picked model (instant: read from Ollama, no generation).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/local-llm/details?model=${encodeURIComponent(model)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => { if (!cancelled) { setDetails(b.details); setRamGb(b.ramGb); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [model, ollama]);

  async function save(patch: Partial<Config>) {
    setBusy("save");
    setMsg(null);
    const res = await fetch("/api/local-llm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(null);
    if (!res?.ok) { setMsg({ kind: "error", text: body?.error ?? "Couldn't save." }); return false; }
    setConfig(body.config);
    setOllama(body.ollama);
    window.dispatchEvent(new Event(LOCAL_CHANGED));
    return true;
  }

  async function test() {
    setBusy("test");
    setMsg({ kind: "info", text: `Asking ${model} to make a tool call… (the first call loads the model and can take a minute)` });
    const res = await fetch("/api/local-llm/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(null);
    if (!body?.ok) { setMsg({ kind: "error", text: body?.error ?? "No answer." }); return; }
    setTested((t) => ({ ...t, [model]: !!body.toolCall }));
    setMsg(body.toolCall
      ? { kind: "ok", text: `Tools work: ${body.reply} · ${(body.ms / 1000).toFixed(1)} s` }
      : { kind: "error", text: `This model ${body.reply}. Agents need tool calls for skills, files and plugins: pick one of the recommended models.` });
  }

  async function prepare() {
    setBusy("prepare");
    setMsg({ kind: "info", text: `Making a copy of ${model} with a ${numCtx / 1024}k context window…` });
    const res = await fetch("/api/local-llm/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, numCtx }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(null);
    if (!res?.ok) { setMsg({ kind: "error", text: body?.error ?? "Ollama couldn't make the copy." }); return; }
    await load();
    setModel(body.model);
    window.dispatchEvent(new Event(LOCAL_CHANGED));
    setMsg({ kind: "ok", text: `Ready: ${body.model} reads up to ${numCtx.toLocaleString()} tokens. It is now the selected model.` });
  }

  async function toggle() {
    if (!config) return;
    const on = !config.enabled;
    const ok = await save({ enabled: on, model, baseUrl });
    if (ok) setMsg({ kind: "ok", text: on ? `Agents now run on ${model} in Ollama.` : "Agents are back on your connected AI account." });
  }

  async function startPull(name = pullName) {
    setPullName(name);
    setPull({ status: "starting", pct: 0 });
    const res = await fetch("/api/local-llm/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name }) }).catch(() => null);
    if (!res?.ok || !res.body) { setPull(null); setMsg({ kind: "error", text: "Couldn't start the download. Is Ollama running?" }); return; }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const j = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (j.error) { setMsg({ kind: "error", text: j.error }); continue; }
          setPull({ status: j.status ?? "", pct: j.total ? Math.round(((j.completed ?? 0) / j.total) * 100) : 0 });
        } catch { /* partial line */ }
      }
    }
    setPull(null);
    setModel(name);
    await load();
    setMsg({ kind: "ok", text: `Downloaded ${name}. Next: Prepare model.` });
  }

  const on = !!config?.enabled;
  const installed = new Set(ollama?.models.map((m) => m.name.replace(/:latest$/, "")) ?? []);
  const contextOk = (details?.contextWindow ?? 0) >= MIN_CONTEXT;
  const fits = (ram: number) => ramGb === null || ramGb >= ram - 1;
  const checks = [
    { label: "Ollama is running", ok: !!ollama?.running },
    { label: "A model is picked", ok: !!model },
    { label: `Context window of ${MIN_CONTEXT / 1024}k or more`, ok: contextOk, detail: details ? (details.contextWindow ? `${details.contextWindow.toLocaleString()} tokens` : "Ollama's default (about 4k): press Prepare model") : undefined },
    { label: "The model supports tools", ok: !!details?.tools },
    { label: "Test model made a tool call", ok: tested[model] === true, detail: tested[model] === undefined ? "press Test model" : undefined },
    { label: "Switched on", ok: on },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Switch to Local LLM</h1>
        <p>Run every agent on a model in <strong>Ollama</strong> on this computer instead of an AI account: free, private and works offline, but slower and less capable. Skills and the plugins you connect below work too. Switch back any time; your history stays the same.</p>
      </header>

      <section ref={guideRef} className={styles.card} aria-label="Setup guide" data-highlight={setupFirst}>
        <h2>Setup guide</h2>
        <ol className={styles.steps}>
          <li>
            <strong>Install Ollama</strong> from <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">ollama.com/download</a> (Windows, macOS, Linux) and open it. It runs in the background at <code>http://127.0.0.1:11434</code>.{" "}
            <span className={ollama?.running ? styles.okText : styles.errText}>{ollama ? (ollama.running ? "✓ found" : "✗ not running yet") : ""}</span>
          </li>
          <li>
            <strong>Download a model that can use tools.</strong>{ramGb ? ` This computer has about ${ramGb} GB of memory.` : ""} Same as <code>ollama pull &lt;name&gt;</code>:
            <ul className={styles.models}>
              {RECOMMENDED.map((r) => (
                <li key={r.name}>
                  <code>{r.name}</code> {r.note}{" "}
                  {installed.has(r.name) ? <span className={styles.okText}>✓ downloaded</span>
                    : <button type="button" className={styles.inline} onClick={() => startPull(r.name)} disabled={!!pull || !ollama?.running} title={fits(r.ram) ? undefined : "Probably too big for this computer"}>
                        Download{fits(r.ram) ? "" : " (too big?)"}
                      </button>}
                </li>
              ))}
            </ul>
          </li>
          <li><strong>Pick it below and press Prepare model.</strong> Gabo&apos;s prompt is about 12k tokens and Ollama&apos;s default window (about 4k) cuts it off, so Gabo makes a copy with a bigger window.</li>
          <li><strong>Press Test model.</strong> It must make a tool call: agents use tools for skills, files and plugins.</li>
          <li><strong>Flip the switch.</strong> Every room and agent now runs on the local model, with no AI account or key needed.</li>
          <li><strong>Optional: connect plugins</strong> (GitHub, Notion, Obsidian and more) in <a href="#plugins">Plugins for Local LLM</a>.</li>
        </ol>
        <p className={styles.muted}>Tip: set <code>OLLAMA_FLASH_ATTENTION=1</code> and <code>OLLAMA_KV_CACHE_TYPE=q8_0</code> before starting Ollama to halve the memory a long context uses.</p>
      </section>

      <section className={styles.card} aria-label="Switch">
        <div className={styles.switchRow}>
          <button
            role="switch"
            aria-checked={on}
            aria-label="Use the local model for all agents"
            className={styles.switch}
            onClick={toggle}
            disabled={busy !== null || !model || !ollama?.running}
          >
            <span className={styles.knob} />
          </button>
          <div>
            <strong>{on ? `On: agents use ${config?.model}` : "Off: agents use your connected AI account"}</strong>
            <div className={styles.muted}>Applies from the next message in every room.</div>
          </div>
        </div>
        <div className={styles.fields}>
          <label htmlFor="ll-model">Model</label>
          <select id="ll-model" value={model} onChange={(e) => setModel(e.target.value)} disabled={!ollama?.models.length}>
            {!ollama?.models.length && <option value="">No models yet: download one in the guide above</option>}
            {ollama?.models.map((m) => (
              <option key={m.name} value={m.name}>{m.name}{m.parameterSize ? ` · ${m.parameterSize}` : ""} · {gb(m.size)}</option>
            ))}
          </select>
          {details && (
            <p className={styles.muted} aria-label="Model details">
              Context window: {details.contextWindow ? details.contextWindow.toLocaleString() : "Ollama default (about 4k)"}
              {details.maxContext ? ` of ${details.maxContext.toLocaleString()} max` : ""} · Tools: {details.tools ? "yes" : "no"}
            </p>
          )}
          <div className={styles.row}>
            <select aria-label="Context window" value={numCtx} onChange={(e) => setNumCtx(Number(e.target.value))}>
              <option value={16384}>16k context</option>
              <option value={32768}>32k context</option>
              <option value={65536}>64k context</option>
            </select>
            <button onClick={prepare} disabled={!model || busy !== null || !ollama?.running}>{busy === "prepare" ? "Preparing…" : "Prepare model"}</button>
            <button onClick={test} disabled={!model || busy !== null || !ollama?.running}>{busy === "test" ? "Testing…" : "Test model"}</button>
            {on && model !== config?.model && <button onClick={() => save({ model })} disabled={busy !== null}>Use {model} instead</button>}
          </div>
          {msg && <p className={styles[msg.kind]} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>}
        </div>
      </section>

      <section className={styles.card} aria-label="Readiness">
        <h2>Readiness</h2>
        <ul className={styles.checks}>
          {checks.map((c) => (
            <li key={c.label} data-ok={c.ok}>
              <span aria-hidden="true">{c.ok ? "✓" : "○"}</span> {c.label}{c.detail ? <span className={styles.muted}> · {c.detail}</span> : null}
            </li>
          ))}
        </ul>
        <p className={styles.muted}>While it&apos;s on, nothing goes to an AI account: skills are picked by keyword match, and small helper jobs (like mascot generation) use the local model too.</p>
      </section>

      <LocalPlugins />

      <section className={styles.card} aria-label="Ollama">
        <h2>Ollama</h2>
        {!ollama && <p className={styles.muted}>Checking…</p>}
        {ollama && (
          <p>
            <span className={styles.dot} data-ok={ollama.running} aria-hidden="true">●</span>{" "}
            {ollama.running ? `running · version ${ollama.version} · ${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"}` : "not running"}
            {!ollama.running && ollama.error && <span className={styles.muted}> — {ollama.error}</span>}
          </p>
        )}
        <div className={styles.fields}>
          <label htmlFor="ll-url">Address</label>
          <div className={styles.row}>
            <input id="ll-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
            <button onClick={() => save({ baseUrl }).then(() => load())} disabled={busy !== null || baseUrl === config?.baseUrl}>Save</button>
            <button onClick={load}>Re-check</button>
          </div>
          <label htmlFor="ll-pull">Download another model</label>
          <div className={styles.row}>
            <input id="ll-pull" value={pullName} onChange={(e) => setPullName(e.target.value)} spellCheck={false} />
            <button onClick={() => startPull()} disabled={!!pull || !ollama?.running}>{pull ? "Downloading…" : "Pull"}</button>
          </div>
          {pull && (
            <div className={styles.progress} role="progressbar" aria-valuenow={pull.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Downloading ${pullName}`}>
              <span style={{ width: `${pull.pct}%` }} />
              <em>{pull.status} {pull.pct ? `${pull.pct}%` : ""}</em>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
