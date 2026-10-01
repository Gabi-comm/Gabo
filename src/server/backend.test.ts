import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { activeBackend, disconnect, loadKind, publicBackend, saveConnection, translateSecret } from "./backend";
import { blockedServers, neededContext, connectorNote, connectorRoots, connectorServers, mcpToolPrefix, pluginAllowed, EMPTY_CONNECTORS } from "@/harness/connectors";
import { keywordScout, words } from "@/harness/skills/keywords";

const OFF = { enabled: false, baseUrl: "http://127.0.0.1:11434", model: "" };
let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gabo-backend-"));
  file = path.join(dir, "backend.json");
});

describe("connection", () => {
  it("a fresh install is not connected; an install with chats keeps its Claude Code login", () => {
    expect(loadKind(file)).toBe("none");
    fs.writeFileSync(path.join(dir, "sessions.json"), "[]");
    expect(loadKind(file)).toBe("claude-login");
  });

  it("the Local LLM switch wins over any connection", () => {
    saveConnection({ provider: "claude", apiKey: "sk-ant-api03-" + "x".repeat(30) }, file);
    const a = activeBackend(file, { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen3:8b" });
    expect(a.kind).toBe("local");
    expect(a.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:11434");
    expect(a.env.ANTHROPIC_API_KEY).toBe("");
  });

  it("refuses runs until connected, and never offers a subscription login", () => {
    const a = activeBackend(file, OFF);
    expect(a.kind).toBe("none");
    expect(a.problem).toMatch(/Connect an AI first/);
  });

  it("a Claude key runs Claude Code directly on that key", () => {
    saveConnection({ provider: "claude", apiKey: "sk-ant-api03-" + "x".repeat(30) }, file);
    const a = activeBackend(file, OFF);
    expect(a.kind).toBe("claude-key");
    expect(a.env.ANTHROPIC_API_KEY).toMatch(/^sk-ant-/);
    expect(a.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(publicBackend(file).keys.claude).not.toContain("x".repeat(20));
  });

  it("OpenAI and Gemini run through the translator with their three model slots", () => {
    saveConnection({ provider: "gemini", apiKey: "AIza" + "y".repeat(35), tiers: { opus: "gemini-2.5-pro", sonnet: "gemini-2.5-flash", haiku: "gemini-2.5-flash-lite" } }, file);
    const a = activeBackend(file, OFF);
    expect(a.kind).toBe("gemini");
    expect(a.env.ANTHROPIC_BASE_URL).toMatch(/\/api\/translate\/gemini$/);
    expect(a.env.ANTHROPIC_AUTH_TOKEN).toBe(translateSecret());
    expect(a.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("gemini-2.5-flash-lite");
    expect(a.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("gemini-2.5-pro");
  });

  it("rejects a key that doesn't look right, and disconnect brings the pop-up back", () => {
    expect(() => saveConnection({ provider: "openai", apiKey: "hello" }, file)).toThrow(/doesn't look like/);
    saveConnection({ provider: "openai", apiKey: "sk-proj-" + "z".repeat(30) }, file);
    disconnect(false, file);
    expect(loadKind(file)).toBe("none");
    expect(publicBackend(file).keys.openai).toBeTruthy();
  });
});

describe("connectors", () => {
  const cfg = { ...EMPTY_CONNECTORS, plugins: { "plugin:canva:canva": true }, notion: { enabled: true, token: "ntn_" + "a".repeat(30) }, obsidian: { enabled: true, vault: "C:/Vault" },
    custom: [{ id: "c-mem", name: "Memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], enabled: true }, { id: "c-off", name: "Off", url: "http://127.0.0.1:9/mcp", enabled: false }] };

  it("plugins are off for the Local LLM until ticked, and the context window grows with them", () => {
    expect(pluginAllowed(EMPTY_CONNECTORS, "plugin:github:github")).toBe(false);
    expect(pluginAllowed(cfg, "plugin:canva:canva")).toBe(true);
    expect(blockedServers(cfg, ["plugin:github:github", "plugin:canva:canva"])).toEqual(["mcp__plugin_github_github"]);
    expect(neededContext(0)).toBe(16384);
    expect(neededContext(1)).toBe(32768);
    expect(mcpToolPrefix("claude.ai Gmail")).toBe("mcp__claude_ai_Gmail");
  });

  it("starts Notion through npx (cmd on Windows) and enabled custom servers; Obsidian is a folder", () => {
    const servers = connectorServers(cfg, "win32");
    expect(servers.notion).toMatchObject({ type: "stdio", command: "cmd", args: ["/c", "npx", "-y", "@notionhq/notion-mcp-server"], env: { NOTION_TOKEN: cfg.notion.token } });
    expect(servers["c-mem"]).toMatchObject({ command: "npx" });
    expect(servers["c-off"]).toBeUndefined();
    expect(connectorServers(cfg, "linux").notion).toMatchObject({ command: "npx" });
    expect(connectorRoots(cfg)).toEqual(["C:/Vault"]);
    expect(connectorNote(cfg)).toMatch(/Obsidian vault is at C:\/Vault/);
  });
});

describe("offline skill scout", () => {
  const pool = [
    { name: "frontend-design", description: "Build distinctive web UI with React and CSS.", installed: true },
    { name: "unslop", description: "Rewrite prose so it reads human.", installed: true },
    { name: "supabase", description: "Postgres database and auth.", installed: false },
  ];
  it("picks installed skills whose name or description match the task, nothing when none fit", () => {
    expect(words("Please build the React landing page")).toEqual(["build", "react", "landing", "page"]);
    const lines = keywordScout("Build a React landing page with nice CSS", ["coder", "caveman"], pool);
    expect(lines[0]).toMatchObject({ agent: "coder", skills: ["frontend-design"] });
    expect(lines[0].why).toMatch(/matches/);
    expect(keywordScout("what's the capital of France", ["tutor"], pool)[0].skills).toEqual([]);
    expect(keywordScout("set up the supabase database", ["coder"], pool)[0].skills).toEqual([]);
    const principles = [{ name: "principle-minimize-reader-load", description: "Write for the reader.", installed: true }, { name: "principle-foundational-thinking", description: "Think from first principles.", installed: true }];
    expect(keywordScout("Read the file note.txt and tell me the secret word. /no_think", ["caveman"], principles)[0].skills).toEqual([]);
  });
});
