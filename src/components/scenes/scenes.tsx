"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isAgentId, type AgentKey } from "@/harness/agents";
import type { AgentInfo } from "@/harness/agentMeta";
import type { Costume } from "@/harness/costume";
import { useAgentMeta } from "@/components/agents/registry";
import { MascotArt } from "@/components/mascot/Mascot";
import type { Pose } from "@/components/mascot/grid";
import type { MascotKind } from "@/components/mascot/props";
import styles from "./scenes.module.css";

/* ---------- shared bits ---------- */

const C = {
  line: "#2c2c29",
  lineStrong: "#3a3a36",
  furniture: "#2a2a27",
  furnitureTop: "#3a3a36",
  screen: "#2B4F91",
  screenDim: "#1f2a3d",
  gold: "#E3B341",
  code: "#4a4a45",
  codeBlue: "#4A7BD8",
};

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Steps through frames on a timer; holds the first frame when disabled. */
export function useCycle<T>(frames: T[], ms: number, enabled = true): T {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!enabled) { setI(0); return; }
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), ms);
    return () => clearInterval(id);
  }, [enabled, frames.length, ms]);
  return frames[i % frames.length];
}

function Figure({ kind, costume, pose, x, y, s, flip, className }: { kind?: MascotKind; costume?: Costume; pose: Pose; x: number; y: number; s: number; flip?: boolean; className?: string }) {
  return (
    <g className={className} style={{ transform: `translate(${x}px, ${y}px) scale(${s})` }}>
      <MascotArt kind={kind} costume={costume} pose={pose} flip={flip} />
    </g>
  );
}

function Scene({ viewBox, label, children, className }: { viewBox: string; label: string; children: ReactNode; className?: string }) {
  return (
    <svg className={`${styles.scene} ${className ?? ""}`} viewBox={viewBox} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/* ---------- Home: the office. The mascot walks in and sits at the desk. ---------- */

const WALK_MS = 3200;
const OFFICE_S = 0.8;
const START_X = -16;
const DESK_X = 30.3;
const STAND_Y = 27 - 14 * OFFICE_S;
/** Seat top at y=21 meets the bottom of the thighs (row 12 of the grid). */
const SIT_Y = 21 - 12 * OFFICE_S;

export function OfficeScene() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"enter" | "walk" | "sit">("enter");

  useEffect(() => {
    if (reduced) { setPhase("sit"); return; }
    const raf = requestAnimationFrame(() => setPhase("walk"));
    const t = setTimeout(() => setPhase("sit"), WALK_MS + 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [reduced]);

  const walkPose = useCycle<Pose>(["walk1", "stand", "walk2", "stand"], 160, phase !== "sit");
  const workPose = useCycle<Pose>(["sit", "sit", "sitType1", "sitType2", "sitType1", "sitType2", "sit"], 380, phase === "sit" && !reduced);
  const sitting = phase === "sit";
  const x = phase === "enter" ? START_X : DESK_X;

  return (
    <Scene viewBox="0 0 90 30" label="The Gabo mascot walks into the office and sits down at its desk." className={styles.office}>
      {/* window */}
      <rect x="8" y="3" width="15" height="10" fill="none" stroke={C.lineStrong} strokeWidth="0.4" />
      <line x1="15.5" y1="3" x2="15.5" y2="13" stroke={C.lineStrong} strokeWidth="0.3" />
      <circle cx="19.5" cy="6" r="1.2" fill="#6f6e69" />
      {/* floor */}
      <line x1="0" y1="27.2" x2="90" y2="27.2" stroke={C.lineStrong} strokeWidth="0.3" />
      {/* chair */}
      <rect x="30.6" y="12.6" width="1.1" height="8.4" fill={C.furnitureTop} />
      <rect x="30.6" y="21" width="12" height="1" fill={C.furnitureTop} />
      <rect x="36" y="22" width="1" height="4.2" fill={C.furniture} />
      <rect x="33.5" y="26.2" width="6" height="0.8" fill={C.furniture} />
      {/* monitor */}
      <rect x="55" y="8.5" width="12" height="8" rx="0.4" fill={C.furniture} />
      <rect x="55.8" y="9.3" width="10.4" height="6.4" fill={sitting ? C.screen : C.screenDim} className={styles.screen} />
      <rect x="60.5" y="16.5" width="1" height="2" fill={C.furniture} />
      {/* mug */}
      <rect x="68" y="16.4" width="1.6" height="2.1" fill="#6f6e69" />
      {/* mascot, behind the desk top so its hands rest on it */}
      <g
        className={styles.walker}
        style={{
          transform: `translate(${x}px, ${sitting ? SIT_Y : STAND_Y}px) scale(${OFFICE_S})`,
          transition: phase === "walk" ? `transform ${WALK_MS}ms linear` : "transform 240ms ease-out",
        }}
      >
        <MascotArt pose={sitting ? workPose : walkPose} />
      </g>
      {/* desk */}
      <rect x="44" y="18.5" width="27" height="1.2" fill={C.furnitureTop} />
      <rect x="45" y="19.7" width="1" height="7.5" fill={C.furniture} />
      <rect x="69" y="19.7" width="1" height="7.5" fill={C.furniture} />
      <rect x="43.6" y="17.9" width="5.6" height="0.6" fill="#55554f" />
    </Scene>
  );
}

/* ---------- Room intros ---------- */

function Bookshelf({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const shelves = 4;
  const spines = ["#3d4a63", "#5a3f36", "#4a5a45", "#6b5a3a", "#44443f", "#5b4a5e"];
  const rows: ReactNode[] = [];
  const rowH = h / shelves;
  for (let r = 0; r < shelves; r++) {
    let bx = x + 0.6;
    let k = r * 7;
    const base = y + rowH * (r + 1) - 0.4;
    while (bx < x + w - 1.6) {
      const bw = 0.9 + ((k * 37) % 5) * 0.18;
      const bh = rowH * (0.55 + ((k * 53) % 7) * 0.05);
      rows.push(<rect key={`${r}-${k}`} x={bx} y={base - bh} width={bw} height={bh} fill={spines[k % spines.length]} />);
      bx += bw + 0.15;
      k++;
    }
    rows.push(<rect key={`s${r}`} x={x} y={base} width={w} height={0.4} fill={C.lineStrong} />);
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.lineStrong} strokeWidth="0.4" />
      {rows}
    </g>
  );
}

export function LibraryIntro() {
  const reduced = useReducedMotion();
  const pose = useCycle<Pose>(["sitRead", "sitRead", "sitRead", "sit"], 700, !reduced);
  return (
    <Scene viewBox="0 0 90 30" label="The mascot studies a book at a library table.">
      <Bookshelf x={4} y={2} w={30} h={25} />
      <line x1="0" y1="27.2" x2="90" y2="27.2" stroke={C.lineStrong} strokeWidth="0.3" />
      {/* stool */}
      <rect x="40" y="21" width="10" height="1" fill={C.furnitureTop} />
      <rect x="44.5" y="22" width="1" height="5" fill={C.furniture} />
      <Figure kind="studying" pose={pose} x={37} y={21 - 12 * 0.8} s={0.8} />
      {/* table + lamp */}
      <rect x="50" y="18.5" width="30" height="1.2" fill={C.furnitureTop} />
      <rect x="51" y="19.7" width="1" height="7.5" fill={C.furniture} />
      <rect x="78" y="19.7" width="1" height="7.5" fill={C.furniture} />
      <rect x="72" y="12" width="0.6" height="6.5" fill="#55554f" />
      <path d="M69.5 12 h5.6 l-1.2 -2.4 h-3.2 z" fill={C.gold} opacity="0.9" />
      <path d="M69 12.2 L 64 18.4 H 80.6 L 75.6 12.2 Z" fill={C.gold} opacity="0.07" />
      <rect x="62" y="17.4" width="3.2" height="1.1" fill="#5a3f36" />
    </Scene>
  );
}

function Arches({ y, from, to, step, h }: { y: number; from: number; to: number; step: number; h: number }) {
  const arches: ReactNode[] = [];
  for (let x = from; x + step <= to; x += step) {
    const w = step * 0.62;
    arches.push(
      <path key={x} d={`M${x} ${y} V${y - h + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V${y}`} fill="none" stroke={C.lineStrong} strokeWidth="0.4" />,
    );
  }
  return <g>{arches}<line x1={from} y1={y - h - 1} x2={to} y2={y - h - 1} stroke={C.lineStrong} strokeWidth="0.4" /></g>;
}

export function ArenaIntro() {
  const reduced = useReducedMotion();
  const [raised, setRaised] = useState(false);
  useEffect(() => {
    if (reduced) { setRaised(true); return; }
    const t = setTimeout(() => setRaised(true), 700);
    return () => clearTimeout(t);
  }, [reduced]);
  const sparks = [[53, 8], [56.5, 11], [49.5, 7.2], [57, 6.5], [51.5, 5]];
  return (
    <Scene viewBox="0 0 90 30" label="The Emperor raises a golden chalice in the arena.">
      <Arches y={22} from={2} to={88} step={9} h={12} />
      <line x1="0" y1="27.2" x2="90" y2="27.2" stroke={C.lineStrong} strokeWidth="0.3" />
      <rect x="35" y="23" width="20" height="4.2" fill={C.furniture} />
      <rect x="34" y="22.4" width="22" height="0.8" fill={C.furnitureTop} />
      <Figure kind="emperor" pose={raised ? "raise" : "stand"} x={38.2} y={22.4 - 14 * 0.8} s={0.8} />
      {raised && sparks.map(([sx, sy], i) => (
        <rect key={i} x={sx} y={sy} width="0.7" height="0.7" fill={C.gold} className={styles.spark} style={{ animationDelay: `${i * 180}ms` }} />
      ))}
    </Scene>
  );
}

function CodeScreen({ x, y, w, h, id, active = true }: { x: number; y: number; w: number; h: number; id: string; active?: boolean }) {
  const lines: ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const indent = (i * 3) % 4;
    const len = 2 + ((i * 7) % 6);
    lines.push(<rect key={i} x={x + 1 + indent} y={y + 1 + i * 1.3} width={len} height="0.5" fill={i % 5 === 2 ? C.codeBlue : C.code} />);
  }
  return (
    <g>
      <rect x={x - 0.6} y={y - 0.6} width={w + 1.2} height={h + 1.2} rx="0.4" fill={C.furniture} />
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} /></clipPath>
      <rect x={x} y={y} width={w} height={h} fill="#111a2b" />
      <g clipPath={`url(#${id})`}>
        <g className={active ? styles.scroll : undefined}>{lines}{lines.map((l, i) => <g key={`d${i}`} transform="translate(0 20.8)">{l}</g>)}</g>
      </g>
    </g>
  );
}

export function HackathonIntro() {
  const reduced = useReducedMotion();
  const [raised, setRaised] = useState(false);
  useEffect(() => {
    if (reduced) { setRaised(true); return; }
    const t = setTimeout(() => setRaised(true), 600);
    return () => clearTimeout(t);
  }, [reduced]);
  return (
    <Scene viewBox="0 0 90 30" label="The Coder raises a laptop in front of screens full of code.">
      <CodeScreen x={6} y={3} w={20} h={12} id="hk-a" active={!reduced} />
      <CodeScreen x={64} y={3} w={20} h={12} id="hk-b" active={!reduced} />
      <line x1="0" y1="27.2" x2="90" y2="27.2" stroke={C.lineStrong} strokeWidth="0.3" />
      <Figure kind="coder" pose={raised ? "raise" : "stand"} x={37} y={27.2 - 14 * 0.8} s={0.8} />
    </Scene>
  );
}

/* ---------- Top-left room widgets: the pulled agents working together ---------- */

const W_S = 0.55;
const SLOT = 19;

function slotX(i: number, n: number, width = 120) {
  const total = n * SLOT;
  return (width - total) / 2 + i * SLOT;
}

function widgetLabel(room: string, pulled: AgentKey[], active: AgentKey[], meta: (id: AgentKey) => AgentInfo) {
  if (!pulled.length) return `${room}: no agents pulled yet.`;
  const names = pulled.map((a) => meta(a).name).join(", ");
  const now = active.length ? ` Working now: ${active.map((a) => meta(a).name).join(", ")}.` : "";
  return `${room}: ${names}.${now}`;
}

function Waiting({ y }: { y: number }) {
  return <text x="60" y={y} textAnchor="middle" className={styles.waiting}>waiting for agents</text>;
}

function WorkingAgent({ agent, i, n, active, frames, y, flip, lunge }: {
  agent: AgentKey; i: number; n: number; active: boolean; frames: Pose[]; y: number; flip?: boolean; lunge?: boolean;
}) {
  const meta = useAgentMeta();
  const reduced = useReducedMotion();
  const pose = useCycle(frames, active ? 220 : 1000, active && !reduced);
  const idle = frames[0].startsWith("sit") ? "sit" : "stand";
  return (
    <g className={active ? (lunge ? (flip ? styles.lungeLeft : styles.lungeRight) : styles.bob) : styles.idle}>
      <Figure
        kind={isAgentId(agent) ? agent : undefined}
        costume={isAgentId(agent) ? undefined : (meta(agent).costume ?? {})}
        pose={active ? pose : (idle as Pose)} x={slotX(i, n) + 2} y={y} s={W_S} flip={flip}
      />
    </g>
  );
}

export function LibraryWidget({ pulled, active }: { pulled: AgentKey[]; active: AgentKey[] }) {
  const meta = useAgentMeta();
  return (
    <Scene viewBox="0 0 120 34" label={widgetLabel("Library", pulled, active, meta)} className={styles.widget}>
      <Bookshelf x={2} y={1} w={116} h={12} />
      {pulled.map((a, i) => (
        <WorkingAgent key={a} agent={a} i={i} n={pulled.length} active={active.includes(a)} frames={["sitRead", "sit", "sitRead", "sitRead"]} y={29 - 12 * W_S} />
      ))}
      <rect x="2" y="26.5" width="116" height="1.2" fill={C.furnitureTop} />
      <rect x="4" y="27.7" width="1" height="6" fill={C.furniture} />
      <rect x="115" y="27.7" width="1" height="6" fill={C.furniture} />
      {!pulled.length && <Waiting y={22} />}
    </Scene>
  );
}

export function ArenaWidget({ pulled, active }: { pulled: AgentKey[]; active: AgentKey[] }) {
  const meta = useAgentMeta();
  return (
    <Scene viewBox="0 0 120 34" label={widgetLabel("Arena", pulled, active, meta)} className={styles.widget}>
      <Arches y={20} from={2} to={118} step={8} h={10} />
      <rect x="0" y="31" width="120" height="3" fill="#2a261e" />
      {pulled.map((a, i) => (
        <WorkingAgent key={a} agent={a} i={i} n={pulled.length} active={active.includes(a)} frames={["raise", "stand", "raise", "type1"]} y={31 - 14 * W_S} flip={i % 2 === 1} lunge />
      ))}
      {!pulled.length && <Waiting y={26} />}
    </Scene>
  );
}

export function HackathonWidget({ pulled, active }: { pulled: AgentKey[]; active: AgentKey[] }) {
  const meta = useAgentMeta();
  const n = pulled.length;
  return (
    <Scene viewBox="0 0 120 34" label={widgetLabel("Hackathon", pulled, active, meta)} className={styles.widget}>
      <line x1="0" y1="33.4" x2="120" y2="33.4" stroke={C.lineStrong} strokeWidth="0.3" />
      {pulled.map((a, i) => {
        const x = slotX(i, n);
        const on = active.includes(a);
        return (
          <g key={a}>
            <rect x={x + 10.5} y={17} width="6.5" height="5" rx="0.3" fill={C.furniture} />
            <rect x={x + 11} y={17.5} width="5.5" height="4" fill={on ? C.screen : C.screenDim} />
            <WorkingAgent agent={a} i={i} n={n} active={on} frames={["sitType1", "sitType2"]} y={27 - 12 * W_S} />
            <rect x={x + 8.5} y={24.2} width="10" height="0.8" fill={C.furnitureTop} />
            <rect x={x + 17} y={25} width="0.7" height="8.4" fill={C.furniture} />
          </g>
        );
      })}
      {!n && <Waiting y={22} />}
    </Scene>
  );
}

/** Laboratory: the team at a long lab bench with bubbling flasks. */
export function LabWidget({ pulled, active }: { pulled: AgentKey[]; active: AgentKey[] }) {
  const meta = useAgentMeta();
  return (
    <Scene viewBox="0 0 120 34" label={widgetLabel("Laboratory", pulled, active, meta)} className={styles.widget}>
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={i * 10} y="0" width="9.5" height="16" fill="#1f2c2d" />)}
      {[[12, "#86c07f"], [40, "#7aa2ea"], [70, "#e3b341"], [98, "#c4513f"]].map(([x, c], i) => (
        <g key={i}>
          <path d={`M${x} 6 h3 v3 l3 6 h-9 l3 -6 z`} fill="#cfe0ff" opacity="0.3" />
          <path d={`M${(x as number) - 2} 12 h7 l1.5 3 h-10 z`} fill={c as string} opacity="0.8" className={styles.bob} />
        </g>
      ))}
      {pulled.map((a, i) => (
        <WorkingAgent key={a} agent={a} i={i} n={pulled.length} active={active.includes(a)} frames={["sitType1", "sit", "sitRead", "sitType2"]} y={29 - 12 * W_S} />
      ))}
      <rect x="2" y="26.5" width="116" height="1.2" fill="#6d7b7d" />
      <rect x="4" y="27.7" width="1" height="6" fill={C.furniture} />
      <rect x="115" y="27.7" width="1" height="6" fill={C.furniture} />
      {!pulled.length && <Waiting y={22} />}
    </Scene>
  );
}
