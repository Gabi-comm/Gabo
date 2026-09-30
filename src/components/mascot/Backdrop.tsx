"use client";

// Pixel-art stages behind each agent. viewBox 0 0 160 80; the floor line is at y=66.
import { useId, type ReactNode } from "react";
import { AGENT_IDS, type AgentId } from "@/harness/agents";
import { BACKDROP_THEMES, type BackdropTheme } from "@/harness/costume";
import styles from "./backdrop.module.css";

export const FLOOR_Y = 66;

export const AGENT_BACKDROPS: Record<AgentId, BackdropTheme> = {
  believer: "sunrise", skeptic: "noir", investor: "market", judge: "courtroom", designer: "studio", coder: "terminal",
  tester: "lab", researcher: "library", tutor: "classroom", caveman: "cave", planner: "board", emperor: "throne",
};

const r = (x: number, y: number, w: number, h: number, fill: string, key?: string | number, className?: string) => (
  <rect key={key ?? `${x}-${y}-${w}-${h}-${fill}`} x={x} y={y} width={w} height={h} fill={fill} className={className} />
);

function sky(id: string, top: string, bottom: string) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="160" height="80" fill={`url(#${id})`} />
    </>
  );
}

function floor(color: string, edge?: string) {
  return <>{r(0, FLOOR_Y, 160, 14, color, "floor")}{edge && r(0, FLOOR_Y, 160, 1, edge, "edge")}</>;
}

function books(x: number, y: number, w: number, rows: number, seed = 1): ReactNode[] {
  const colors = ["#5b6b8c", "#8c5b52", "#6b8c5e", "#a08850", "#6d5b86", "#4f7c7c"];
  const out: ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    let bx = x;
    let k = seed * 7 + row * 3;
    const base = y + row * 11 + 10;
    while (bx < x + w - 2) {
      const bw = 1.6 + ((k * 37) % 4) * 0.5;
      const bh = 6 + ((k * 53) % 4);
      out.push(r(bx, base - bh, bw, bh, colors[k % colors.length], `b${row}-${k}`));
      bx += bw + 0.3;
      k++;
    }
    out.push(r(x - 1, base, w + 2, 1, "#4a3a2c", `s${row}`));
  }
  return out;
}

const THEMES: Record<BackdropTheme, (uid: string) => ReactNode> = {
  sunrise: (u) => (
    <>
      {sky(u, "#2a2440", "#c9774a")}
      <circle cx="120" cy="58" r="16" fill="#f1b35a" opacity="0.9" />
      {r(0, 50, 160, 30, "#2f3b2e")}
      <path d="M0 56 Q40 42 80 54 T160 50 V80 H0 Z" fill="#3f5a3a" />
      {r(28, 36, 1, 14, "#d9d8d2")}
      <path d="M29 36 h9 l-3 3 l3 3 h-9 z" fill="#c4513f" />
    </>
  ),
  noir: (u) => (
    <>
      {sky(u, "#10131a", "#262b36")}
      {Array.from({ length: 7 }, (_, row) => Array.from({ length: 16 }, (_, col) => r(col * 10 + (row % 2) * 5, row * 6 + 18, 9, 5, "#2d2a2c", `w${row}-${col}`)))}
      {r(132, 14, 2, 52, "#3a3d44")}
      {r(126, 12, 14, 3, "#3a3d44")}
      <circle cx="129" cy="17" r="3" fill="#e6d38a" className={styles.flicker} />
      <path d="M118 66 L129 18 L140 66 Z" fill="#e6d38a" opacity="0.07" />
      <g className={styles.rain}>{Array.from({ length: 22 }, (_, i) => r((i * 17) % 160, (i * 29) % 60, 0.5, 5, "#8aa0c0", `rn${i}`))}</g>
      {floor("#1b1d23", "#3a3d44")}
    </>
  ),
  market: (u) => (
    <>
      {sky(u, "#0d1424", "#1c2a45")}
      {[[6, 30, 18], [26, 22, 14], [42, 36, 20], [64, 18, 12], [78, 28, 22], [102, 40, 16], [120, 24, 18], [140, 34, 18]].map(([x, top, w], i) => (
        <g key={i}>
          {r(x, top, w, FLOOR_Y - top, "#1a2336", `bd${i}`)}
          {Array.from({ length: Math.floor((FLOOR_Y - top - 4) / 5) }, (_, j) =>
            Array.from({ length: Math.floor((w - 2) / 4) }, (_, k2) => ((i + j + k2) % 3 === 0 ? r(x + 2 + k2 * 4, top + 3 + j * 5, 1.6, 2, "#e6c26a", `lw${i}-${j}-${k2}`) : null)))}
        </g>
      ))}
      <polyline points="8,52 30,46 48,49 70,36 92,40 116,24 150,14" fill="none" stroke="#86c07f" strokeWidth="1.4" />
      <path d="M150 14 l-5 1 l3 3 z" fill="#86c07f" />
      {floor("#121826", "#2b3650")}
    </>
  ),
  courtroom: (u) => (
    <>
      {sky(u, "#3a2618", "#2a1c12")}
      {Array.from({ length: 8 }, (_, i) => r(i * 20 + 4, 10, 12, 50, "#4a3222", `pn${i}`))}
      {[24, 60, 96, 132].map((x, i) => <g key={i}>{r(x, 8, 6, 58, "#c9b89a")}{r(x - 1, 6, 8, 3, "#d9ccb0")}{r(x - 1, 63, 8, 3, "#d9ccb0")}</g>)}
      <g>
        {r(79, 14, 2, 14, "#e3b341")}
        {r(70, 16, 20, 1, "#e3b341")}
        <path d="M70 17 l-4 7 h8 z M90 17 l-4 7 h8 z" fill="#e3b341" opacity="0.85" />
      </g>
      {r(40, 48, 80, 18, "#5c3b24")}
      {r(40, 48, 80, 2, "#7a5033")}
      {floor("#2a1c12", "#5c3b24")}
    </>
  ),
  studio: (u) => (
    <>
      {sky(u, "#2a2a30", "#3a3538")}
      {r(10, 10, 34, 26, "#4a5a70")}
      {r(12, 12, 14, 22, "#a9c1dd")}
      {r(28, 12, 14, 22, "#a9c1dd")}
      <path d="M12 34 L44 66 H0 V40 Z" fill="#a9c1dd" opacity="0.06" />
      {r(118, 30, 2, 36, "#8a6a4a")}
      {r(108, 20, 26, 20, "#efe6d4")}
      <circle cx="116" cy="28" r="4" fill="#c4513f" />
      {r(122, 30, 8, 6, "#4a7bd8")}
      <path d="M110 38 Q121 24 132 34" stroke="#e3b341" strokeWidth="1.2" fill="none" />
      {[[60, 70, "#c4513f"], [74, 74, "#e3b341"], [88, 71, "#4a7bd8"], [140, 73, "#86c07f"]].map(([x, y, c], i) => <circle key={i} cx={x as number} cy={y as number} r="2.2" fill={c as string} />)}
      {floor("#3a3538", "#555057")}
    </>
  ),
  terminal: (u) => (
    <>
      {sky(u, "#0b0e14", "#12161f")}
      {[[12, 16, 40, 26], [60, 10, 44, 30], [112, 18, 38, 24]].map(([x, y, w, h], i) => (
        <g key={i}>
          {r(x - 1.5, y - 1.5, w + 3, h + 3, "#20242c")}
          {r(x, y, w, h, "#0f1c33")}
          {Array.from({ length: Math.floor(h / 4) }, (_, j) => r(x + 2 + ((i + j) % 3) * 3, y + 2 + j * 4, 6 + ((i * 7 + j * 5) % (w - 12)), 1.4, j % 4 === 1 ? "#7aa2ea" : "#3d5a3d", `cl${i}-${j}`))}
          {r(x + w / 2 - 1, y + h + 1.5, 2, 6, "#20242c")}
        </g>
      ))}
      {r(80, 30, 3, 1.6, "#86c07f", "cur", styles.blink)}
      {r(0, 56, 160, 3, "#1c2029")}
      {floor("#0e1117", "#1c2029")}
    </>
  ),
  lab: (u) => (
    <>
      {sky(u, "#1c2a2c", "#223335")}
      {Array.from({ length: 6 }, (_, row) => Array.from({ length: 16 }, (_, col) => r(col * 10, row * 10, 9.5, 9.5, "#243638", `t${row}-${col}`)))}
      {r(8, 44, 60, 3, "#6d7b7d")}
      {[[14, "#86c07f"], [30, "#7aa2ea"], [46, "#e3b341"]].map(([x, c], i) => (
        <g key={i}>
          <path d={`M${x} 30 h6 v4 l5 10 h-16 l5 -10 z`} fill="#cfe0ff" opacity="0.35" />
          <path d={`M${(x as number) - 3} 40 h12 l2 4 h-16 z`} fill={c as string} opacity="0.85" />
        </g>
      ))}
      {r(116, 30, 20, 24, "#cfe0ff", "jar")}
      {r(116, 30, 20, 24, "#1c2a2c", "jarin")}
      <rect x="116" y="30" width="20" height="24" fill="#cfe0ff" opacity="0.18" />
      {r(114, 28, 24, 3, "#6d7b7d")}
      <g className={styles.buzz}>{r(124, 40, 4, 3, "#86c07f")}{r(123, 39, 1, 1, "#86c07f")}{r(128, 39, 1, 1, "#86c07f")}</g>
      {floor("#1a2526", "#2f4446")}
    </>
  ),
  library: (u) => (
    <>
      {sky(u, "#1e1a16", "#2a241d")}
      {r(4, 6, 70, 58, "#3a2c20")}
      {books(6, 6, 66, 5, 1)}
      {r(86, 6, 70, 58, "#3a2c20")}
      {books(88, 6, 66, 5, 2)}
      <path d="M80 0 L80 12" stroke="#6f6e69" strokeWidth="0.6" />
      <circle cx="80" cy="15" r="3" fill="#f1c56a" opacity="0.9" />
      <path d="M72 18 L80 14 L88 18 L100 66 H60 Z" fill="#f1c56a" opacity="0.06" />
      {floor("#2a2018", "#4a3a2c")}
    </>
  ),
  classroom: (u) => (
    <>
      {sky(u, "#27302a", "#2c352e")}
      {r(20, 10, 120, 40, "#5a4630")}
      {r(23, 13, 114, 34, "#223a2c")}
      <path d="M30 22 h20 M30 28 h30 M30 34 h14 M70 20 l6 8 l6 -8 M90 30 q8 -10 16 0 t16 0" stroke="#dfe7dc" strokeWidth="0.8" fill="none" opacity="0.8" />
      <text x="96" y="24" fontSize="7" fill="#dfe7dc" opacity="0.8" fontFamily="monospace">a²+b²</text>
      {r(24, 47, 112, 2, "#5a4630")}
      {r(40, 48, 6, 1.5, "#faf9f5")}
      {floor("#3a3226", "#5a4a36")}
    </>
  ),
  cave: (u) => (
    <>
      {sky(u, "#1a1410", "#2a1f16")}
      <path d="M0 0 H160 V14 Q140 22 128 12 Q110 26 92 14 Q74 24 56 12 Q38 24 22 12 Q10 20 0 14 Z" fill="#110d0a" />
      <g opacity="0.55" stroke="#c86b3c" strokeWidth="1" fill="none">
        <path d="M24 34 l6 -4 l6 4 l-6 4 z M30 30 v-4 M44 36 q4 -6 8 0" />
        <path d="M112 30 h10 l2 3 h-14 z M114 33 v4 M120 33 v4 M104 40 l4 -6 l4 6" />
      </g>
      <g className={styles.fire}>
        <path d="M122 64 q-6 -8 0 -16 q2 6 5 4 q2 8 -5 12 z" fill="#e3b341" />
        <path d="M122 64 q-3 -5 0 -9 q3 5 0 9 z" fill="#f7e2a0" />
      </g>
      {r(114, 63, 16, 3, "#6e4a2a")}
      <circle cx="122" cy="56" r="26" fill="#e3b341" opacity="0.07" />
      {floor("#241a12", "#3a2a1c")}
    </>
  ),
  board: (u) => (
    <>
      {sky(u, "#22252c", "#2a2e36")}
      {r(14, 8, 132, 50, "#e9e6de")}
      {[44, 80, 116].map((x, i) => r(x, 12, 0.6, 42, "#b9b4a8", `ln${i}`))}
      <text x="22" y="15" fontSize="4" fill="#6f6e69" fontFamily="monospace">TO DO</text>
      <text x="52" y="15" fontSize="4" fill="#6f6e69" fontFamily="monospace">DOING</text>
      <text x="88" y="15" fontSize="4" fill="#6f6e69" fontFamily="monospace">TEST</text>
      <text x="122" y="15" fontSize="4" fill="#6f6e69" fontFamily="monospace">DONE</text>
      {[[20, 18, "#f1d77a"], [28, 30, "#f1a97a"], [20, 42, "#a8d59a"], [52, 20, "#9ec1f0"], [60, 34, "#f1d77a"], [88, 22, "#f1a97a"], [124, 18, "#a8d59a"], [128, 32, "#a8d59a"], [122, 44, "#9ec1f0"]].map(([x, y, c], i) => (
        <g key={i}>{r(x as number, y as number, 14, 9, c as string)}{r((x as number) + 2, (y as number) + 3, 9, 0.8, "#6f6e69")}</g>
      ))}
      {floor("#262a31", "#3a3f48")}
    </>
  ),
  throne: (u) => (
    <>
      {sky(u, "#2a1016", "#3a1820")}
      {Array.from({ length: 10 }, (_, i) => r(i * 16, 0, 8, 60, "#5e1d26", `cr${i}`))}
      {[30, 130].map((x, i) => <g key={i}>{r(x - 6, 6, 12, 26, "#e3b341")}<path d={`M${x - 6} 32 l6 5 l6 -5 z`} fill="#e3b341" />{r(x - 2, 14, 4, 4, "#c4513f")}</g>)}
      {r(68, 20, 24, 40, "#b8862b")}
      {r(70, 22, 20, 36, "#8a1f2c")}
      {[68, 76, 84].map((x, i) => r(x + 2, 14, 4, 6, "#e3b341", `tp${i}`))}
      {r(60, 58, 40, 8, "#8a1f2c")}
      {floor("#3a1820", "#b8862b")}
    </>
  ),
  garden: (u) => (
    <>
      {sky(u, "#1e3a4a", "#5b8a6a")}
      <circle cx="30" cy="18" r="8" fill="#f1d77a" opacity="0.85" />
      {[[20, 52], [44, 48], [120, 50], [140, 54]].map(([x, y], i) => (
        <g key={i}>{r(x, y, 2, FLOOR_Y - y, "#4a6a3a")}<circle cx={x + 1} cy={y} r="3" fill={["#e88aa0", "#f1d77a", "#c9a0f0", "#f1a97a"][i]} /></g>
      ))}
      <path d="M0 60 Q40 54 80 60 T160 58 V66 H0 Z" fill="#3f6a3a" />
      {floor("#35552f", "#4f7a45")}
    </>
  ),
  space: (u) => (
    <>
      {sky(u, "#05060d", "#141a33")}
      {Array.from({ length: 40 }, (_, i) => r((i * 41) % 160, (i * 23) % 60, 0.8, 0.8, "#faf9f5", `st${i}`, i % 5 === 0 ? styles.twinkle : undefined))}
      <circle cx="128" cy="22" r="12" fill="#6d5b86" />
      <ellipse cx="128" cy="22" rx="20" ry="3" fill="none" stroke="#c9a0f0" strokeWidth="1" opacity="0.7" />
      {floor("#2a2a33", "#4a4a58")}
      {[20, 60, 100, 140].map((x, i) => <circle key={i} cx={x} cy={72} r="3" fill="#20202a" />)}
    </>
  ),
  ocean: (u) => (
    <>
      {sky(u, "#123a5a", "#2a6a8a")}
      <circle cx="40" cy="20" r="7" fill="#f1e2b0" opacity="0.8" />
      <g className={styles.waves}>
        <path d="M0 50 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V66 H0 Z" fill="#1f5a7a" />
        <path d="M0 56 q10 -3 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V66 H0 Z" fill="#17496a" />
      </g>
      {floor("#d9c49a", "#e9d8b0")}
    </>
  ),
  forest: (u) => (
    <>
      {sky(u, "#16261c", "#2a3f2c")}
      {[[10, 20], [36, 12], [66, 24], [98, 14], [128, 22], [150, 16]].map(([x, top], i) => (
        <g key={i}>{r(x + 5, top + 26, 3, FLOOR_Y - top - 26, "#3a2a1c")}<path d={`M${x} ${top + 28} L${x + 6.5} ${top} L${x + 13} ${top + 28} Z`} fill={i % 2 ? "#2f5a38" : "#3a6a40"} /></g>
      ))}
      <g className={styles.twinkle}>{[[50, 44], [90, 38], [116, 48]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.8" fill="#f1e27a" />)}</g>
      {floor("#1f3322", "#2f4a30")}
    </>
  ),
  stage: (u) => (
    <>
      {sky(u, "#12090c", "#1f1014")}
      {r(0, 0, 22, 66, "#7a1a26")}
      {r(138, 0, 22, 66, "#7a1a26")}
      {r(0, 0, 160, 8, "#8a1f2c")}
      <path d="M60 0 L40 66 H120 L100 0 Z" fill="#f1e2b0" opacity="0.08" />
      {r(78, 36, 4, 22, "#3a3a3a")}
      <circle cx="80" cy="34" r="3" fill="#9aa0a6" />
      {floor("#3a2418", "#5a3a26")}
    </>
  ),
};

/** A themed stage (optionally with a mascot on it). `children` are drawn on top, in the same 160×80 space. */
export function Backdrop({ theme, children, className, label }: { theme: BackdropTheme; children?: ReactNode; className?: string; label?: string }) {
  const uid = `bd-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const draw = THEMES[theme] ?? THEMES.sunrise;
  return (
    <svg className={`${styles.backdrop} ${className ?? ""}`} viewBox="0 0 160 80" preserveAspectRatio="xMidYMid slice" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {draw(uid)}
      {children}
    </svg>
  );
}

export function backdropFor(id: string): BackdropTheme {
  return (AGENT_IDS as readonly string[]).includes(id) ? AGENT_BACKDROPS[id as AgentId] : "sunrise";
}

export { BACKDROP_THEMES };
