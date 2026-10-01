import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { detectPython } from "@/harness/arena";
import { usableProviders } from "@/harness/providers";
import { getClaudeInfo } from "./claudeInfo";
import { FAKE, getWorkspace } from "./config";
import { loadProviders } from "./providers";
import { loadLocal } from "./localLlm";
import { activeBackend } from "./backend";
import { planUsage, readRateLimits, usageAnalytics, usageSummary, type RateLimit } from "./usageLog";
import { isLocalOn } from "@/harness/localLlm";
import type { PlanUsage } from "@/harness/usage";

export interface Check { name: string; ok: boolean; detail: string; ms?: number }

export interface Status {
  checkedAt: number;
  claudeCode: { cliVersion: string | null; bundledVersion: string | null; sdkVersion: string | null; defaultModel: string; models: string[]; outputStyle: string; permissionMode: string };
  account: { email?: string; plan?: string; loggedIn: boolean };
  connectivity: Check[];
  tools: { mcp: { name: string; status: string; error?: string }[]; plugins: string[]; commands: number; otherAis: string[] };
  gabo: Check[];
  /** Which brain the agents use right now. */
  backend: { kind: "subscription" | "local" | "key" | "none"; detail: string };
  usage: {
    plan: { text: string; meters: PlanUsage[] } | null;
    rateLimits: RateLimit[];
    summary: ReturnType<typeof usageSummary>;
    analytics: ReturnType<typeof usageAnalytics>;
  };
}

function readJson(file: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

const SDK_DIR = path.join(process.cwd(), "node_modules", "@anthropic-ai", "claude-agent-sdk");

function cliVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    exec("claude --version", { timeout: 8000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : (stdout.trim().split(/\s+/)[0] || null));
    });
  });
}

async function reach(name: string, url: string, describe: (res: Response) => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    return { name, ok: true, detail: await describe(res), ms: Date.now() - started };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}

const FAKE_STATUS: Status = {
  checkedAt: 0,
  claudeCode: { cliVersion: "2.1.285", bundledVersion: "2.1.285", sdkVersion: "0.3.285", defaultModel: "default", models: ["default", "opus", "haiku"], outputStyle: "default", permissionMode: "default" },
  account: { email: "gab@example.com", plan: "Claude Pro", loggedIn: true },
  connectivity: [
    { name: "Anthropic API", ok: true, detail: "reachable (HTTP 404 on /)", ms: 80 },
    { name: "Anthropic status", ok: true, detail: "All Systems Operational", ms: 120 },
  ],
  tools: { mcp: [{ name: "plugin:github:github", status: "connected" }, { name: "claude.ai Gmail", status: "needs-auth" }], plugins: ["superpowers", "github"], commands: 3, otherAis: [] },
  gabo: [{ name: "Workspace", ok: true, detail: "C:/fake/workspace" }, { name: "Python (Arena)", ok: true, detail: "python" }],
  backend: { kind: "subscription", detail: "Claude Pro" },
  usage: { plan: null, rateLimits: [], summary: { today: { runs: 0, tokens: 0, costUsd: 0 }, week: { runs: 0, tokens: 0, costUsd: 0 }, byRoom: [], byModel: [] }, analytics: usageAnalytics() },
};

/** Everything the CLI's /status shows, plus Gabo's own checks. Every part is independent: one failure never hides the rest. */
export async function getStatus(refresh = false): Promise<Status> {
  const local = loadLocal();
  const active = activeBackend();
  const backend: Status["backend"] = isLocalOn(local)
    ? { kind: "local", detail: `Ollama · ${local.model} (${local.baseUrl})` }
    : active.kind === "claude-login" ? { kind: "subscription", detail: "Claude Code login on this computer" }
    : active.kind === "none" ? { kind: "none", detail: "Not connected" }
    : { kind: "key", detail: active.label };
  if (FAKE) {
    return { ...FAKE_STATUS, checkedAt: Date.now(), backend, usage: { plan: await planUsage(refresh), rateLimits: readRateLimits(), summary: usageSummary(), analytics: usageAnalytics() } };
  }
  const settings = readJson(path.join(os.homedir(), ".claude", "settings.json")) ?? {};
  const [cli, info, python, api, statusPage, plan] = await Promise.all([
    cliVersion(),
    getClaudeInfo(refresh).catch(() => null),
    detectPython(),
    reach("Anthropic API", "https://api.anthropic.com/", async (res) => `reachable (HTTP ${res.status} on /)`),
    reach("Anthropic status", "https://status.anthropic.com/api/v2/status.json", async (res) => {
      const j = (await res.json().catch(() => null)) as { status?: { description?: string } } | null;
      return j?.status?.description ?? `HTTP ${res.status}`;
    }),
    planUsage(refresh),
  ]);
  const workspace = getWorkspace();
  const ais = usableProviders(loadProviders());

  return {
    checkedAt: Date.now(),
    claudeCode: {
      cliVersion: cli,
      bundledVersion: (readJson(path.join(SDK_DIR, "manifest.json"))?.version as string | undefined) ?? null,
      sdkVersion: (readJson(path.join(SDK_DIR, "package.json"))?.version as string | undefined) ?? null,
      defaultModel: typeof settings.model === "string" ? settings.model : "default",
      models: info?.models.map((m) => m.value) ?? [],
      outputStyle: info?.outputStyle ?? "unknown",
      permissionMode: info?.defaultMode ?? "default",
    },
    account: { email: info?.account.email, plan: info?.account.subscriptionType, loggedIn: !!info?.account.subscriptionType || !!info?.account.email },
    connectivity: [
      { name: "Claude Code login", ok: !!info, detail: info ? "Claude Code started and answered" : "Claude Code didn't start. Run `claude`, then /login." },
      api,
      statusPage,
    ],
    tools: {
      mcp: info?.mcp ?? [],
      plugins: info?.plugins?.map((p) => p.name) ?? [],
      commands: info?.commands.length ?? 0,
      otherAis: ais.map((p) => `${p.label} (${p.model})`),
    },
    gabo: [
      { name: "Workspace", ok: fs.existsSync(workspace), detail: workspace },
      { name: "Python (Arena)", ok: !!python, detail: python ?? "not found; the Arena needs Python 3.8+" },
    ],
    backend,
    usage: { plan, rateLimits: readRateLimits(), summary: usageSummary(), analytics: usageAnalytics() },
  };
}
