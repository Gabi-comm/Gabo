"use client";

import { useCallback, useEffect, useState } from "react";
import type { CustomConnector } from "@/harness/connectors";
import styles from "./localllm.module.css";

interface Server { name: string; status: string; allowed: boolean; claudeAi: boolean }
interface View {
  plugins: Record<string, boolean>;
  notion: { enabled: boolean; hasToken: boolean; tokenHint: string };
  obsidian: { enabled: boolean; vault: string };
  custom: CustomConnector[];
  pinnedSkills: string[];
  servers: Server[];
}
type Result = { ok: boolean; tools: string[]; error?: string };

const pretty = (name: string) => name.replace(/^plugin:([^:]+):.*$/, "$1").replace(/^claude\.ai\s*/, "");

/** Local LLM → Plugins: which plugins the local model may use, plus Notion, Obsidian and custom MCP servers. */
export function LocalPlugins() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result | "testing">>({});
  const [notionToken, setNotionToken] = useState("");
  const [vault, setVault] = useState("");
  const [draft, setDraft] = useState({ name: "", command: "", url: "" });
  const [skills, setSkills] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/connectors", { cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body) { setError("Couldn't load the plugins."); return; }
    setView(body);
    setVault(body.obsidian.vault);
    setSkills(body.pinnedSkills.join(", "));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function put(patch: object): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/connectors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { setError(body?.error ?? "Couldn't save."); return false; }
    setView(body);
    return true;
  }

  async function test(id: string) {
    setResults((r) => ({ ...r, [id]: "testing" }));
    const res = await fetch("/api/connectors/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as Result | null;
    setResults((r) => ({ ...r, [id]: body ?? { ok: false, tools: [], error: "No answer." } }));
  }

  function addCustom() {
    const args = draft.command.trim().split(/\s+/);
    const c: CustomConnector = draft.url.trim()
      ? { id: "", name: draft.name, url: draft.url.trim(), enabled: true }
      : { id: "", name: draft.name, command: args[0] ?? "", args: args.slice(1), enabled: true };
    void put({ custom: [...(view?.custom ?? []), c] }).then((ok) => ok && setDraft({ name: "", command: "", url: "" }));
  }

  const status = (id: string) => {
    const r = results[id];
    if (!r) return null;
    if (r === "testing") return <span className={styles.muted}>Starting it…</span>;
    return r.ok
      ? <span className={styles.okText}>✓ {r.tools.length} tool{r.tools.length === 1 ? "" : "s"}{r.tools.length ? `: ${r.tools.slice(0, 4).join(", ")}${r.tools.length > 4 ? "…" : ""}` : ""}{r.error ? ` (${r.error})` : ""}</span>
      : <span className={styles.errText}>✗ {r.error}</span>;
  };

  return (
    <section id="plugins" className={styles.card} aria-label="Plugins for Local LLM">
      <h2>Plugins for Local LLM</h2>
      <p className={styles.muted}>Choose what the local model can use. Each plugin adds its tools to every message (GitHub alone is about 10k tokens), so tick only what you need: fewer plugins means faster answers. Notion, Obsidian and your own plugins also work with a connected AI account.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!view && !error && <p className={styles.muted}>Loading…</p>}
      {view && (
        <>
          <h3>Installed Claude Code plugins</h3>
          {view.servers.length === 0 && <p className={styles.muted}>None found. Plugins you add to Claude Code (like GitHub) show up here.</p>}
          <ul className={styles.plugins}>
            {view.servers.map((s) => (
              <li key={s.name}>
                <label>
                  <input
                    type="checkbox"
                    checked={s.allowed && !s.claudeAi}
                    disabled={s.claudeAi}
                    onChange={(e) => put({ plugins: { [s.name]: e.target.checked } })}
                  />
                  <span>{pretty(s.name)}</span>
                </label>
                <span className={styles.muted}>{s.claudeAi ? "needs a Claude login, not available locally" : s.status}</span>
              </li>
            ))}
          </ul>

          <h3>Notion</h3>
          <ol className={styles.steps}>
            <li>Create an internal integration at <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noopener noreferrer">notion.so/profile/integrations</a> and copy its token.</li>
            <li>In Notion, open each page the agents may use → ••• → Connections → add your integration.</li>
          </ol>
          <div className={styles.row}>
            <input
              aria-label="Notion token"
              type="password"
              autoComplete="off"
              placeholder={view.notion.hasToken ? `Saved: ${view.notion.tokenHint}` : "ntn_…"}
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
            />
            <button onClick={() => put({ notion: { token: notionToken } }).then((ok) => ok && setNotionToken(""))} disabled={!notionToken.trim()}>Save token</button>
            <label className={styles.toggle}>
              <input type="checkbox" checked={view.notion.enabled} onChange={(e) => put({ notion: { enabled: e.target.checked } })} /> Use Notion
            </label>
            <button onClick={() => test("notion")} disabled={!view.notion.hasToken}>Test</button>
            {status("notion")}
          </div>

          <h3>Obsidian</h3>
          <p className={styles.muted}>Agents read and write notes in your vault folder with their file tools: no Obsidian plugin needed.</p>
          <div className={styles.row}>
            <input aria-label="Obsidian vault folder" value={vault} onChange={(e) => setVault(e.target.value)} placeholder="C:\Users\you\Documents\Obsidian Vault" spellCheck={false} />
            <button onClick={() => put({ obsidian: { vault } })} disabled={vault === view.obsidian.vault}>Save folder</button>
            <label className={styles.toggle}>
              <input type="checkbox" checked={view.obsidian.enabled} onChange={(e) => put({ obsidian: { enabled: e.target.checked, vault } })} /> Use Obsidian
            </label>
            <button onClick={() => test("obsidian")} disabled={!view.obsidian.vault}>Test</button>
            {status("obsidian")}
          </div>

          <h3>Other plugins (MCP servers)</h3>
          <ul className={styles.plugins}>
            {view.custom.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={c.enabled} onChange={(e) => put({ custom: view.custom.map((x) => (x.id === c.id ? { ...x, enabled: e.target.checked } : x)) })} />
                  <span>{c.name}</span>
                </label>
                <code className={styles.cmd}>{c.url ?? [c.command, ...(c.args ?? [])].join(" ")}</code>
                <button className={styles.inline} onClick={() => test(c.id)}>Test</button>
                <button className={styles.inline} onClick={() => put({ custom: view.custom.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.name}`}>Remove</button>
                {status(c.id)}
              </li>
            ))}
          </ul>
          <div className={styles.addPlugin}>
            <input aria-label="Plugin name" placeholder="Name, e.g. Filesystem" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input aria-label="Plugin command" placeholder="Command, e.g. npx -y @modelcontextprotocol/server-memory" value={draft.command} onChange={(e) => setDraft({ ...draft, command: e.target.value })} spellCheck={false} />
            <input aria-label="Plugin URL" placeholder="or URL, e.g. http://127.0.0.1:8000/mcp" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} spellCheck={false} />
            <button onClick={addCustom} disabled={!draft.name.trim() || (!draft.command.trim() && !draft.url.trim())}>Add plugin</button>
          </div>

          <h3>Skills always offered</h3>
          <p className={styles.muted}>Besides the skills picked for each task (up to 8, comma-separated).</p>
          <div className={styles.row}>
            <input aria-label="Pinned skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. frontend-design, unslop" spellCheck={false} />
            <button onClick={() => put({ pinnedSkills: skills.split(",").map((s) => s.trim()).filter(Boolean) })}>Save skills</button>
          </div>
        </>
      )}
    </section>
  );
}
