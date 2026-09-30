import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";

export const PINS_FILE = path.join(DATA_DIR, "pins.json");
/** "s:<Claude Code session id>" or "c:<app chat id>". */
const KEY = /^[sc]:[\w-]{1,64}$/;

export function loadPins(file = PINS_FILE): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data) ? data.filter((k) => typeof k === "string" && KEY.test(k)) : [];
  } catch {
    return [];
  }
}

export function setPinned(file: string, key: string, pinned: boolean): string[] {
  if (!KEY.test(key)) throw new Error("Bad pin key.");
  const current = loadPins(file);
  if (pinned && current.includes(key)) return current; // already pinned: keep its place
  const rest = current.filter((k) => k !== key);
  const next = pinned ? [key, ...rest] : rest;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
