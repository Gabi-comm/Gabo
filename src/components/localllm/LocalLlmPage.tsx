"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCAL_CHANGED } from "@/components/cli/useClaude";
import styles from "./localllm.module.css";

interface Config { enabled: boolean; baseUrl: string; model: string }
interface Model { name: string; size: number; parameterSize?: string; family?: string }
interface Ollama { running: boolean; version?: string; models: Model[]; error?: string }

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;

export function LocalLlmPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [ollama, setOllama] = useState<Ollama | null>(null);
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pullName, setPullName] = useState("qwen3-coder:30b");
  const [pull, setPull] = useState<{ status: string; pct: number } | null>(null);

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
    setMsg({ kind: "info", text: `Asking ${model}… (the first call loads the model and can take a minute)` });
    const res = await fetch("/api/local-llm/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(null);
    setMsg(body?.ok ? { kind: "ok", text: `${body.reply} · ${(body.ms / 1000).toFixed(1)} s` } : { kind: "error", text: body?.error ?? "No answer." });
  }

  async function toggle() {
    if (!config) return;
    const on = !config.enabled;
    const ok = await save({ enabled: on, model, baseUrl });
    if (ok) setMsg({ kind: "ok", text: on ? `Agents now run on ${model} in Ollama.` : "Agents are back on your Claude plan." });
  }

  async function startPull() {
    setPull({ status: "starting", pct: 0 });
    const res = await fetch("/api/local-llm/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: pullName }) }).catch(() => null);
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
    setModel(pullName);
    await load();
    setMsg({ kind: "ok", text: `Downloaded ${pullName}.` });
  }

  const on = !!config?.enabled;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Switch to Local LLM</h1>
        <p>Run every agent on a model in <strong>Ollama</strong> on this computer instead of your Claude plan: free, private and works offline, but slower and less capable than Claude. Switch back any time; your history stays the same.</p>
      </header>

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
            <strong>{on ? `On — agents use ${config?.model}` : "Off — agents use your Claude plan"}</strong>
            <div className={styles.muted}>Applies from the next message in every room.</div>
          </div>
        </div>
        <div className={styles.fields}>
          <label htmlFor="ll-model">Model</label>
          <select id="ll-model" value={model} onChange={(e) => setModel(e.target.value)} disabled={!ollama?.models.length}>
            {!ollama?.models.length && <option value="">No models yet: pull one below</option>}
            {ollama?.models.map((m) => (
              <option key={m.name} value={m.name}>{m.name}{m.parameterSize ? ` · ${m.parameterSize}` : ""} · {gb(m.size)}</option>
            ))}
          </select>
          <div className={styles.row}>
            <button onClick={test} disabled={!model || busy !== null || !ollama?.running}>{busy === "test" ? "Testing…" : "Test model"}</button>
            {on && model !== config?.model && <button onClick={() => save({ model })} disabled={busy !== null}>Use {model} instead</button>}
          </div>
          {msg && <p className={styles[msg.kind]} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>}
        </div>
      </section>

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
          <label htmlFor="ll-pull">Download a model</label>
          <div className={styles.row}>
            <input id="ll-pull" value={pullName} onChange={(e) => setPullName(e.target.value)} spellCheck={false} />
            <button onClick={startPull} disabled={!!pull || !ollama?.running}>{pull ? "Downloading…" : "Pull"}</button>
          </div>
          {pull && (
            <div className={styles.progress} role="progressbar" aria-valuenow={pull.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Downloading ${pullName}`}>
              <span style={{ width: `${pull.pct}%` }} />
              <em>{pull.status} {pull.pct ? `${pull.pct}%` : ""}</em>
            </div>
          )}
        </div>
      </section>

      <section className={styles.card} aria-label="Setup guide">
        <h2>Setup guide</h2>
        <ol className={styles.steps}>
          <li><strong>Install Ollama</strong> from ollama.com/download (Windows, macOS, Linux). Version 0.14 or newer is needed; it speaks the Anthropic API that Claude Code uses.</li>
          <li><strong>Start it</strong>: open the Ollama app, or run <code>ollama serve</code>. It listens on <code>http://127.0.0.1:11434</code>.</li>
          <li>
            <strong>Pull a model that can use tools</strong> (Claude Code relies on tool calls):
            <ul>
              <li><code>ollama pull qwen3-coder:30b</code> — strong at code and tools, needs about 20 GB of RAM or VRAM.</li>
              <li><code>ollama pull gpt-oss:20b</code> — good all-rounder, about 16 GB.</li>
              <li><code>ollama pull qwen3:8b</code> — fits smaller machines (about 6 GB), weaker at long tasks.</li>
            </ul>
            Or use the <em>Download a model</em> box above.
          </li>
          <li><strong>Give it room to think</strong>: Claude Code sends long prompts. Set the context length to at least 32k (Ollama app → Settings → Context length, or <code>OLLAMA_CONTEXT_LENGTH=32768</code> before <code>ollama serve</code>).</li>
          <li><strong>Pick the model above, press Test model</strong>, then flip the switch. Every room, agent and subagent now runs on that model.</li>
          <li><strong>Switch back</strong> with the same switch. Chats continue on your Claude plan.</li>
        </ol>
        <h3>What changes while it&apos;s on</h3>
        <ul className={styles.notes}>
          <li>The model and effort pickers are locked; the status line shows <code>local · model</code>.</li>
          <li>Claude Code talks to <code>{config?.baseUrl ?? "http://127.0.0.1:11434"}</code> with a dummy key; nothing is billed to your Claude plan.</li>
          <li>Small helper jobs (picking skills, generating mascots) still try Claude first and fall back to offline matching.</li>
          <li>Plugins, skills, MCP servers, permissions and history all work the same; how well the agents follow their roles depends on the model.</li>
        </ul>
      </section>
    </div>
  );
}
