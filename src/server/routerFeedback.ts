import fs from "node:fs";
import path from "node:path";
import { biasFrom, type RouterBias } from "@/harness/router";
import { DATA_DIR } from "./config";

/** Gab's tier corrections per room (--deep, --lite, "Redo with real agents"): the router leans with them. */
export const ROUTER_FEEDBACK_FILE = path.join(DATA_DIR, "router-feedback.json");

type Counts = Record<string, { deep?: number; lite?: number }>;

function read(file: string): Counts {
  try { const d = JSON.parse(fs.readFileSync(file, "utf8")); return d && typeof d === "object" ? d : {}; } catch { return {}; }
}

export function roomBias(room: string, file = ROUTER_FEEDBACK_FILE): RouterBias {
  return biasFrom(read(file)[room]);
}

export function recordOverride(room: string, kind: "deep" | "lite", file = ROUTER_FEEDBACK_FILE): void {
  const all = read(file);
  const c = { ...all[room] };
  c[kind] = Math.min((c[kind] ?? 0) + 1, 20);
  // Old corrections fade: the opposite count steps down, so the lean follows recent habits.
  const other = kind === "deep" ? "lite" : "deep";
  if (c[other]) c[other] = Math.max(0, c[other]! - 1);
  all[room] = c;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
  } catch { /* best-effort */ }
}
