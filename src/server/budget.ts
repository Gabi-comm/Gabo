import fs from "node:fs";
import path from "node:path";
import { isBudgetMode, type BudgetMode } from "@/harness/budget";
import { DATA_DIR } from "./config";

// Settings → Agents → Budget. Balanced is the recommended default (docs/token-budget.md).
export const BUDGET_FILE = path.join(DATA_DIR, "budget.json");

export function loadBudget(file = BUDGET_FILE): BudgetMode {
  try {
    const mode = JSON.parse(fs.readFileSync(file, "utf8")).mode;
    return isBudgetMode(mode) ? mode : "balanced";
  } catch {
    return "balanced";
  }
}

function readFile(file: string): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

export function saveBudget(mode: BudgetMode, file = BUDGET_FILE): BudgetMode {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...readFile(file), mode }, null, 2));
  return mode;
}

/**
 * Whether Gabo's Claude Code sessions run the user's own hooks (plugins like superpowers or remember).
 * Off by default: measured 2026-10-01, they added about 4.6 s to every session start and inject extra text
 * (tokens) into every session. Gabo's own safety hook runs either way.
 */
export function loadHooks(file = BUDGET_FILE): boolean {
  return readFile(file).hooks === true;
}

export function saveHooks(on: boolean, file = BUDGET_FILE): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...readFile(file), hooks: on }, null, 2));
  return on;
}
