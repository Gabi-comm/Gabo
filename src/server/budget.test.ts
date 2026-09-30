import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBudget, saveBudget } from "./budget";

describe("budget store", () => {
  it("defaults to balanced, saves a mode, and ignores a bad file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gabo-budget-"));
    const file = path.join(dir, "budget.json");
    expect(loadBudget(file)).toBe("balanced");
    saveBudget("economy", file);
    expect(loadBudget(file)).toBe("economy");
    fs.writeFileSync(file, JSON.stringify({ mode: "turbo" }));
    expect(loadBudget(file)).toBe("balanced");
    fs.writeFileSync(file, "not json");
    expect(loadBudget(file)).toBe("balanced");
  });
});
