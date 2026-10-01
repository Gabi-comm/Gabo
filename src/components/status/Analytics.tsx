"use client";

import { useState } from "react";
import styles from "./analytics.module.css";

export interface DayUsage { date: string; label: string; input: number; cacheWrite: number; cacheRead: number; output: number; total: number; runs: number; costUsd: number }
export interface WeeklyAnalytics {
  days: DayUsage[];
  total: number;
  split: { input: number; cacheWrite: number; cacheRead: number; output: number };
  runs: number;
  costUsd: number;
  previousTotal: number;
  changePct: number | null;
  busiest: DayUsage | null;
  perDay: number;
  perRun: number;
  topRoom: { key: string; tokens: number; runs: number } | null;
  topModel: { key: string; tokens: number; runs: number } | null;
  speed?: { firstWordsS: number; doneS: number; runs: number } | null;
}

type Part = "input" | "cacheWrite" | "cacheRead" | "output";
/** Stack order bottom → top; colors validated for the dark surface (dataviz validator, all checks pass). */
const PARTS: { key: Part; label: string; note: string }[] = [
  { key: "input", label: "Fresh input", note: "new prompt text the model read" },
  { key: "cacheWrite", label: "Cache write", note: "prompt saved to the cache for reuse" },
  { key: "cacheRead", label: "Cache read", note: "prompt re-read from the cache (cheaper, still counts)" },
  { key: "output", label: "Output", note: "what the model wrote, thinking included" },
];

export const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const full = (n: number) => n.toLocaleString("en-US");

/** A round axis maximum above the tallest bar, with three gridlines. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

export function Analytics({ a }: { a: WeeklyAnalytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...a.days.map((d) => d.total)));
  const ticks = [max, max / 2, 0];
  const today = a.days[a.days.length - 1]?.date;
  const change = a.changePct === null ? "no data for the week before" : a.changePct === 0 ? "same as the week before" : `${a.changePct > 0 ? "▲" : "▼"} ${Math.abs(a.changePct)}% vs the week before`;
  const shown = hover !== null ? a.days[hover] : null;

  return (
    <section className={styles.card} aria-label="Analytics">
      <h2>Analytics · last 7 days</h2>

      <div className={styles.tiles}>
        <div className={styles.hero}>
          <span className={styles.tileLabel}>Tokens used</span>
          <strong>{fmt(a.total)}</strong>
          <span className={styles.tileNote}>{change}</span>
        </div>
        <div><span className={styles.tileLabel}>Per day</span><strong>{fmt(a.perDay)}</strong><span className={styles.tileNote}>average</span></div>
        <div><span className={styles.tileLabel}>Per run</span><strong>{fmt(a.perRun)}</strong><span className={styles.tileNote}>{a.runs} run{a.runs === 1 ? "" : "s"}</span></div>
        <div><span className={styles.tileLabel}>Busiest day</span><strong>{a.busiest ? a.busiest.label : "—"}</strong><span className={styles.tileNote}>{a.busiest ? `${fmt(a.busiest.total)} tokens` : "nothing yet"}</span></div>
        <div>
          <span className={styles.tileLabel}>Reply speed</span>
          <strong>{a.speed ? `${a.speed.doneS}s` : "—"}</strong>
          <span className={styles.tileNote}>{a.speed ? `first words after ${a.speed.firstWordsS}s (avg of ${a.speed.runs})` : "logged from now on"}</span>
        </div>
        <div><span className={styles.tileLabel}>API-equivalent</span><strong>${a.costUsd.toFixed(2)}</strong><span className={styles.tileNote}>on a plan, not billed per token</span></div>
      </div>

      {a.total === 0 ? (
        <p className={styles.empty}>No runs in the last 7 days yet. Send a message in any room and it shows up here.</p>
      ) : (
        <>
          <ul className={styles.legend} aria-label="Legend">
            {PARTS.map((p, i) => (
              <li key={p.key} title={p.note}>
                <span className={styles.swatch} data-part={i + 1} aria-hidden="true" />
                {p.label} <span className={styles.share}>{Math.round((a.split[p.key] / a.total) * 100)}%</span>
              </li>
            ))}
          </ul>

          <div className={styles.chart} onMouseLeave={() => setHover(null)}>
            <div className={styles.yAxis} aria-hidden="true">
              {ticks.map((t) => <span key={t}>{fmt(t)}</span>)}
            </div>
            <div className={styles.plot}>
              {ticks.map((t) => <div key={t} className={styles.grid} style={{ bottom: `${(t / max) * 100}%` }} aria-hidden="true" />)}
              <div className={styles.bars} role="list" aria-label="Tokens per day">
                {a.days.map((d, i) => {
                  const parts = PARTS.map((p, j) => ({ ...p, n: d[p.key], idx: j + 1 })).filter((p) => p.n > 0);
                  return (
                    <div
                      key={d.date}
                      role="listitem"
                      tabIndex={0}
                      className={styles.col}
                      data-active={hover === i}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      aria-label={`${d.label} ${d.date}: ${full(d.total)} tokens in ${d.runs} runs`}
                    >
                      <div className={styles.stack} style={{ height: `${(d.total / max) * 100}%` }}>
                        {a.busiest?.date === d.date && <em className={styles.valueLabel}>{fmt(d.total)}</em>}
                        {[...parts].reverse().map((p) => (
                          <span key={p.key} className={styles.seg} data-part={p.idx} style={{ flexGrow: p.n }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {shown && hover !== null && (
                <div className={styles.tooltip} style={{ left: `${((hover + 0.5) / a.days.length) * 100}%` }} role="status">
                  <strong>{shown.label} · {shown.date}{shown.date === today ? " (today)" : ""}</strong>
                  {PARTS.map((p, i) => (
                    <div key={p.key} className={styles.tipRow}>
                      <span className={styles.swatch} data-part={i + 1} aria-hidden="true" />
                      <span>{p.label}</span><span>{full(shown[p.key])}</span>
                    </div>
                  ))}
                  <div className={styles.tipTotal}><span>Total</span><span>{full(shown.total)}</span></div>
                  <div className={styles.tipMuted}>{shown.runs} run{shown.runs === 1 ? "" : "s"} · ${shown.costUsd.toFixed(2)} API-equiv.</div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.xAxis} aria-hidden="true">
            {a.days.map((d) => <span key={d.date} data-today={d.date === today}>{d.date === today ? "Today" : d.label}</span>)}
          </div>

          <dl className={styles.tops}>
            {a.topRoom && <div><dt>Top room</dt><dd>{a.topRoom.key} · {fmt(a.topRoom.tokens)} tokens</dd></div>}
            {a.topModel && <div><dt>Top model</dt><dd>{a.topModel.key} · {fmt(a.topModel.tokens)} tokens</dd></div>}
          </dl>

          <details className={styles.tableView}>
            <summary>Show as a table</summary>
            <table>
              <caption className="sr-only">Tokens per day, last 7 days</caption>
              <thead><tr><th>Day</th>{PARTS.map((p) => <th key={p.key}>{p.label}</th>)}<th>Total</th><th>Runs</th></tr></thead>
              <tbody>
                {a.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.label} {d.date.slice(5)}</td>
                    {PARTS.map((p) => <td key={p.key}>{full(d[p.key])}</td>)}
                    <td>{full(d.total)}</td><td>{d.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className={styles.note}>Counts every model call in Gabo, subagents included. Cache reads cost about a tenth of fresh input but still count toward plan limits. Runs from before 2026-10-01 have no cache numbers.</p>
        </>
      )}
    </section>
  );
}
