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

export function saveBudget(mode: BudgetMode, file = BUDGET_FILE): BudgetMode {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mode }, null, 2));
  return mode;
}
