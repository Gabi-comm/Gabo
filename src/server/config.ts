import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "./sessions";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const DEFAULT_WORKSPACE = path.join(os.homedir(), "Documents", "Gabo Workspace");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

export type WorkspaceCheck = { ok: true; path: string } | { ok: false; error: string };

export function validateWorkspace(p: unknown): WorkspaceCheck {
  if (typeof p !== "string" || p.trim() === "") return { ok: false, error: "Enter a folder path." };
  if (!path.isAbsolute(p)) return { ok: false, error: "Use an absolute path, like C:\\Users\\Gab\\Projects\\app." };
  const abs = path.resolve(p);
  try {
    if (!fs.statSync(abs).isDirectory()) return { ok: false, error: `${abs} is a file, not a folder.` };
  } catch {
    return { ok: false, error: `${abs} doesn't exist.` };
  }
  return { ok: true, path: abs };
}

export function getWorkspace(): string {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")).workspace;
    const check = validateWorkspace(saved);
    if (check.ok) return check.path;
  } catch { /* first run */ }
  fs.mkdirSync(DEFAULT_WORKSPACE, { recursive: true });
  return DEFAULT_WORKSPACE;
}

export function setWorkspace(p: string): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ workspace: p }, null, 2));
}

const g = globalThis as unknown as { __gaboSessions?: SessionStore };
export const sessions = (g.__gaboSessions ??= new SessionStore(DATA_DIR));

export const FAKE = process.env.HARNESS_FAKE === "1";
