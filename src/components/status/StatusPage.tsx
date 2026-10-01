"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./status.module.css";
import { Analytics, type WeeklyAnalytics } from "./Analytics";

interface Check { name: string; ok: boolean; detail: string; ms?: number }
interface Status {
  checkedAt: number;
  claudeCode: { cliVersion: string | null; bundledVersion: string | null; sdkVersion: string | null; defaultModel: string; models: string[]; outputStyle: string; permissionMode: string };
  account: { email?: string; plan?: string; loggedIn: boolean };
  connectivity: Check[];
  tools: { mcp: { name: string; status: string; error?: string }[]; plugins: string[]; commands: number; otherAis: string[] };
  gabo: Check[];
  backend: { kind: "subscription" | "local" | "key" | "none"; detail: string };
  usage: {
    plan: { text: string; meters: { label: string; percent: number; resets: string }[] } | null;
    rateLimits: { type: string; status: string; utilization?: number; resetsAt?: number; at: number }[];
    summary: {
      today: Totals; week: Totals;
      byRoom: (Totals & { key: string })[]; byModel: (Totals & { key: string })[];
    };
    analytics?: WeeklyAnalytics;
  };
}

interface Totals { runs: number; tokens: number; costUsd: number }

/** What the dollar figures mean for the connected account: an estimate on a plan, a real bill on an API key. */
function billingNote(kind: Status["backend"]["kind"]): string {
  if (kind === "subscription") return "Not charged: you're on your Claude Code subscription. Tokens count toward your plan's usage limits; the $ is only what they'd cost on the API.";
  if (kind === "key") return "Billed per token by your AI provider, to the API key you connected.";
  if (kind === "local") return "Free: the local model runs on this computer.";
  return "Not connected.";
}

const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const LIMIT_LABEL: Record<string, string> = {
  five_hour: "5-hour window", seven_day: "7-day window", seven_day_opus: "7-day (Opus)", seven_day_sonnet: "7-day (Sonnet)", overage: "Extra usage",
};

function Meter({ label, percent, note }: { label: string; percent: number; note?: string }) {
  const level = percent >= 90 ? "high" : percent >= 70 ? "mid" : "low";
  return (
    <div className={styles.meter}>
      <div className={styles.meterTop}><span>{label}</span><span>{Math.round(percent)}%</span></div>
      <div className={styles.bar} role="progressbar" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <span data-level={level} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      {note && <div className={styles.muted}>{note}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CheckRow({ c }: { c: Check }) {
  return (
    <li className={styles.check}>
      <span className={styles.dot} data-ok={c.ok} aria-hidden="true">●</span>
      <span className={styles.checkName}>{c.name}</span>
      <span className={styles.muted}>{c.ok ? "ok" : "problem"} · {c.detail}{c.ms !== undefined ? ` · ${c.ms} ms` : ""}</span>
    </li>
  );
}

export function StatusPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/status${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      setStatus(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mcpCounts = status?.tools.mcp.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {}) ?? {};

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Status</h1>
          <p className={styles.muted}>{status ? `Checked ${new Date(status.checkedAt).toLocaleTimeString()}` : "Checking…"}</p>
        </div>
        <button className={styles.button} onClick={() => load(true)} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button>
      </header>
      {error && <div className={styles.error} role="alert">Couldn&apos;t check: {error}</div>}
      {!status && loading && <p className={styles.muted}>Starting Claude Code to read its status (a few seconds)…</p>}
      {status && (
        <div className={styles.grid}>
          <section className={styles.card} aria-label="Claude Code">
            <h2>Claude Code</h2>
            <dl>
              <Row label="Running on">{status.backend.kind === "local" ? <a href="/local-llm">{status.backend.detail}</a> : <a href="/connect">{status.backend.detail}</a>}</Row>
              <Row label="Version">{status.claudeCode.bundledVersion ?? "unknown"} <span className={styles.muted}>(used by Gabo)</span></Row>
              <Row label="CLI on PATH">{status.claudeCode.cliVersion ?? "not found"}</Row>
              <Row label="Agent SDK">{status.claudeCode.sdkVersion ?? "unknown"}</Row>
              <Row label="Default model">{status.claudeCode.defaultModel}</Row>
              <Row label="Models">{status.claudeCode.models.join(", ") || "—"}</Row>
              <Row label="Permission mode">{status.claudeCode.permissionMode}</Row>
              <Row label="Output style">{status.claudeCode.outputStyle}</Row>
            </dl>
          </section>

          <section className={styles.card} aria-label="Account">
            <h2>Account</h2>
            <dl>
              <Row label="Signed in">{status.account.loggedIn ? "yes" : "no — run `claude`, then /login"}</Row>
              <Row label="Plan">{status.account.plan ?? "—"}</Row>
              <Row label="Email">{status.account.email ?? "—"}</Row>
              <Row label="Billing">subscription (API key ignored)</Row>
            </dl>
          </section>

          <section className={styles.card} aria-label="Connectivity">
            <h2>Connectivity</h2>
            <ul className={styles.checks}>{status.connectivity.map((c) => <CheckRow key={c.name} c={c} />)}</ul>
          </section>

          <section className={styles.card} aria-label="Gabo">
            <h2>Gabo</h2>
            <ul className={styles.checks}>{status.gabo.map((c) => <CheckRow key={c.name} c={c} />)}</ul>
            <dl>
              <Row label="Other AIs">{status.tools.otherAis.join(", ") || "none connected (Plugins)"}</Row>
            </dl>
          </section>

          {status.usage.analytics && <Analytics a={status.usage.analytics} billing={billingNote(status.backend.kind)} />}

          <section className={`${styles.card} ${styles.wide}`} aria-label="Usage">
            <h2>Usage</h2>
            <div className={styles.usageGrid}>
              <div>
                <h3>Your plan</h3>
                {status.usage.plan?.meters.length
                  ? status.usage.plan.meters.map((m) => <Meter key={m.label} label={m.label} percent={m.percent} note={m.resets ? `resets ${m.resets}` : undefined} />)
                  : <p className={styles.muted}>{status.usage.plan ? status.usage.plan.text.slice(0, 300) : "Claude Code didn't report plan usage."}</p>}
                {status.usage.rateLimits.filter((r) => typeof r.utilization === "number").map((r) => (
                  <Meter
                    key={r.type}
                    label={`${LIMIT_LABEL[r.type] ?? r.type} (last run)`}
                    percent={(r.utilization ?? 0) * 100}
                    note={`${r.status.replace("_", " ")}${r.resetsAt ? ` · resets ${new Date(r.resetsAt * 1000).toLocaleString()}` : ""}`}
                  />
                ))}
              </div>
              <div>
                <h3>In Gabo</h3>
                <dl>
                  <Row label="Today">{status.usage.summary.today.runs} runs · {fmtTokens(status.usage.summary.today.tokens)} tokens · ≈${status.usage.summary.today.costUsd.toFixed(2)} at API prices</Row>
                  <Row label="Last 7 days">{status.usage.summary.week.runs} runs · {fmtTokens(status.usage.summary.week.tokens)} tokens · ≈${status.usage.summary.week.costUsd.toFixed(2)} at API prices</Row>
                  <Row label="Billing">{billingNote(status.backend.kind)}</Row>
                </dl>
                {status.usage.summary.byRoom.length > 0 && (
                  <table className={styles.table}>
                    <caption className="sr-only">Last 7 days by room</caption>
                    <thead><tr><th>Room</th><th>Runs</th><th>Tokens</th></tr></thead>
                    <tbody>{status.usage.summary.byRoom.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r.runs}</td><td>{fmtTokens(r.tokens)}</td></tr>)}</tbody>
                  </table>
                )}
                {status.usage.summary.byModel.length > 0 && (
                  <table className={styles.table}>
                    <caption className="sr-only">Last 7 days by model</caption>
                    <thead><tr><th>Model</th><th>Runs</th><th>Tokens</th></tr></thead>
                    <tbody>{status.usage.summary.byModel.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r.runs}</td><td>{fmtTokens(r.tokens)}</td></tr>)}</tbody>
                  </table>
                )}
                <p className={styles.muted}>The dollar figure is what the same tokens would cost on the API; your plan isn&apos;t billed per token.</p>
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.wide}`} aria-label="Tools">
            <h2>Tools</h2>
            <p className={styles.muted}>
              {status.tools.commands} commands · {status.tools.plugins.length} plugins · {status.tools.mcp.length} MCP servers
              {Object.entries(mcpCounts).map(([k, v]) => ` · ${v} ${k}`).join("")}
            </p>
            <ul className={styles.mcp}>
              {status.tools.mcp.map((m) => (
                <li key={m.name}>
                  <span className={styles.status} data-status={m.status}>{m.status}</span>
                  <span className={styles.mcpName}>{m.name}</span>
                  {m.error && <span className={styles.muted}> — {m.error}</span>}
                </li>
              ))}
            </ul>
            <h3>Plugins</h3>
            <p className={styles.plugins}>{status.tools.plugins.join(" · ") || "none"}</p>
          </section>
        </div>
      )}
    </div>
  );
}
