import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordOverride, roomBias } from "./routerFeedback";
import { loadHooks, saveHooks } from "./budget";

describe("router feedback", () => {
  it("counts corrections per room, and the opposite habit fades", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-router-")), "fb.json");
    expect(roomBias("library", file)).toBe(0);
    recordOverride("library", "deep", file);
    recordOverride("library", "deep", file);
    expect(roomBias("library", file)).toBe(1.5);
    recordOverride("library", "lite", file);
    expect(roomBias("library", file)).toBe(0); // deep 1, lite 1
    expect(roomBias("arena", file)).toBe(0);
  });
});

describe("plugin hooks setting", () => {
  it("is on unless turned off", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-hooks-")), "budget.json");
    expect(loadHooks(file)).toBe(true);
    saveHooks(false, file);
    expect(loadHooks(file)).toBe(false);
    saveHooks(true, file);
    expect(loadHooks(file)).toBe(true);
  });
});
