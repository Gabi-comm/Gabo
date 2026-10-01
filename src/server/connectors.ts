import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONNECTOR_ID, EMPTY_CONNECTORS, connectorServers, type ConnectorsConfig, type CustomConnector } from "@/harness/connectors";
import { maskKey } from "@/harness/providers";
import { DATA_DIR, FAKE } from "./config";

/** The Notion token lives here (git-ignored) and is never sent back to the browser. */
export const CONNECTORS_FILE = path.join(DATA_DIR, "connectors.json");

export const DEFAULT_VAULT = path.join(os.homedir(), "Documents", "Obsidian Vault");

export function loadConnectors(file = CONNECTORS_FILE): ConnectorsConfig {
  let raw: Partial<ConnectorsConfig> = {};
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first run */ }
  return {
    plugins: raw.plugins && typeof raw.plugins === "object" ? raw.plugins : {},
    notion: { enabled: !!raw.notion?.enabled, ...(raw.notion?.token ? { token: raw.notion.token } : {}) },
    obsidian: { enabled: !!raw.obsidian?.enabled, vault: raw.obsidian?.vault || (fs.existsSync(DEFAULT_VAULT) ? DEFAULT_VAULT : "") },
    custom: Array.isArray(raw.custom) ? raw.custom.filter((c) => CONNECTOR_ID.test(c?.id ?? "")) : [],
    pinnedSkills: Array.isArray(raw.pinnedSkills) ? raw.pinnedSkills.filter((s) => typeof s === "string").slice(0, 8) : [],
  };
}

export interface ConnectorsPatch {
  plugins?: Record<string, boolean>;
  notion?: { enabled?: boolean; token?: string };
  obsidian?: { enabled?: boolean; vault?: string };
  custom?: CustomConnector[];
  pinnedSkills?: string[];
}

const SKILL = /^[\w.:-]{1,80}$/;

export function saveConnectors(patch: ConnectorsPatch, file = CONNECTORS_FILE): ConnectorsConfig {
  const cur = loadConnectors(file);
  const next: ConnectorsConfig = structuredClone(cur);
  if (patch.plugins) for (const [k, v] of Object.entries(patch.plugins)) if (typeof v === "boolean" && k.length <= 120) next.plugins[k] = v;
  if (patch.notion) {
    if (typeof patch.notion.token === "string") {
      const t = patch.notion.token.trim();
      if (t && !/^(ntn_|secret_)[\w-]{20,}$/.test(t)) throw new Error("That doesn't look like a Notion integration token (ntn_… or secret_…).");
      if (t) next.notion.token = t; else delete next.notion.token;
    }
    if (typeof patch.notion.enabled === "boolean") next.notion.enabled = patch.notion.enabled;
    if (next.notion.enabled && !next.notion.token) throw new Error("Paste a Notion integration token first.");
  }
  if (patch.obsidian) {
    if (typeof patch.obsidian.vault === "string") {
      const v = patch.obsidian.vault.trim();
      if (v && (!path.isAbsolute(v) || !fs.existsSync(v) || !fs.statSync(v).isDirectory())) throw new Error(`${v} isn't a folder on this computer.`);
      next.obsidian.vault = v ? path.resolve(v) : "";
    }
    if (typeof patch.obsidian.enabled === "boolean") next.obsidian.enabled = patch.obsidian.enabled;
    if (next.obsidian.enabled && !next.obsidian.vault) throw new Error("Pick the vault folder first.");
  }
  if (patch.custom) {
    next.custom = patch.custom.slice(0, 20).map((c) => {
      const name = String(c.name ?? "").trim().slice(0, 40);
      if (!name) throw new Error("Give the plugin a name.");
      const id = CONNECTOR_ID.test(c.id) ? c.id : `c-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "plugin"}`;
      const url = c.url?.trim();
      const command = c.command?.trim();
      if (url) {
        let u: URL;
        try { u = new URL(url); } catch { throw new Error(`${name}: the URL isn't valid.`); }
        if (!["http:", "https:"].includes(u.protocol)) throw new Error(`${name}: use an http(s) URL.`);
        return { id, name, url, enabled: !!c.enabled };
      }
      if (!command) throw new Error(`${name}: give a command (like npx) or a URL.`);
      const args = (c.args ?? []).map(String).slice(0, 30);
      return { id, name, command, args, enabled: !!c.enabled };
    });
    const ids = new Set<string>();
    for (const c of next.custom) {
      if (ids.has(c.id)) throw new Error(`Two plugins are called ${c.name}.`);
      ids.add(c.id);
    }
  }
  if (patch.pinnedSkills) next.pinnedSkills = patch.pinnedSkills.filter((s) => SKILL.test(s)).slice(0, 8);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

/** What the browser sees: the token is masked. */
export function publicConnectors(c: ConnectorsConfig) {
  return { ...c, notion: { enabled: c.notion.enabled, hasToken: !!c.notion.token, tokenHint: maskKey(c.notion.token) } };
}

export interface ConnectorTest { ok: boolean; tools: string[]; error?: string; ms: number }

/** Starts the connector's MCP server, lists its tools and stops it. */
export async function testConnector(id: string, cfg = loadConnectors()): Promise<ConnectorTest> {
  const started = Date.now();
  if (id === "obsidian") {
    const ok = !!cfg.obsidian.vault && fs.existsSync(cfg.obsidian.vault);
    const notes = ok ? fs.readdirSync(cfg.obsidian.vault).filter((f) => f.endsWith(".md")).length : 0;
    return ok ? { ok, tools: ["Read", "Write", "Edit", "Grep", "Glob"], ms: Date.now() - started, error: notes ? undefined : "The folder has no notes at its top level." }
      : { ok, tools: [], error: "Pick the vault folder first.", ms: 0 };
  }
  if (FAKE) return { ok: true, tools: ["search", "fetch"], ms: 3 };
  const server = connectorServers({ ...cfg, notion: { ...cfg.notion, enabled: true }, custom: cfg.custom.map((c) => ({ ...c, enabled: true })) })[id];
  if (!server) return { ok: false, tools: [], error: id === "notion" ? "Paste a Notion token first." : "Unknown plugin.", ms: 0 };
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const client = new Client({ name: "gabo-connector-test", version: "1.0.0" });
  try {
    if (server.type === "http") {
      const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
    } else if (server.type === "stdio" || server.type === undefined) {
      const s = server as { command: string; args?: string[]; env?: Record<string, string> };
      const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const env = Object.fromEntries(Object.entries({ ...process.env, ...s.env }).filter((e): e is [string, string] => typeof e[1] === "string"));
      await client.connect(new StdioClientTransport({ command: s.command, args: s.args, env, stderr: "ignore" }));
    }
    const { tools } = await Promise.race([
      client.listTools(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("No answer within 90 s.")), 90_000)),
    ]);
    return { ok: true, tools: tools.map((t) => t.name), ms: Date.now() - started };
  } catch (err) {
    return { ok: false, tools: [], error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  } finally {
    await client.close().catch(() => {});
  }
}
