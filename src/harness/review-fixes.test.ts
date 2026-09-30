// Regression tests for the final-review findings (2026-09-30).
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { guardToolInput, sessionRuleKey } from "./permissions";
import { arenaSizeGuard } from "./arena";
import { preToolUseReason, runRoom } from "./runner";
import type { UiEvent } from "./events";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gabo-fix-"));

describe("Esc before the model starts", () => {
  it("never calls query() when the run was already aborted during setup", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const queryImpl = vi.fn();
    const events: UiEvent[] = [];
    await runRoom({
      runId: "r", conversationId: "c", room: "home", prompt: "hi", workspace: tmp(),
      emit: (e) => events.push(e), signal: ctrl.signal, queryImpl: queryImpl as never,
    });
    expect(queryImpl).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});

describe("junctions and symlinks", () => {
  it("blocks writes through a junction inside the workspace that points outside", () => {
    const ws = tmp();
    const outside = tmp();
    fs.symlinkSync(outside, path.join(ws, "out"), "junction");
    expect(guardToolInput("Write", { file_path: path.join(ws, "out", "x.txt") }, ws)).toMatch(/outside/);
    expect(guardToolInput("Write", { file_path: path.join(ws, "new-dir", "x.txt") }, ws)).toBeNull();
  });
});

describe("Glob with an absolute pattern", () => {
  it("is checked like a path", () => {
    const ws = path.resolve("/work/proj");
    expect(guardToolInput("Glob", { pattern: "C:/Users/Gab/**/*.env" }, ws)).toMatch(/outside/);
    expect(guardToolInput("Glob", { pattern: "/etc/*" }, ws)).toMatch(/outside/);
    expect(guardToolInput("Glob", { pattern: "src/**/*.ts" }, ws)).toBeNull();
  });
});

describe("PowerShell", () => {
  it("'yes for this chat' is keyed by the exact command, like Bash", () => {
    expect(sessionRuleKey("PowerShell", { command: "Remove-Item x" })).toBe("PowerShell:Remove-Item x");
  });
  it("the arena size guard applies to PowerShell too", () => {
    expect(preToolUseReason("PowerShell", { command: "python bracket.py init --agents 100 --task-file t.md" }, tmp(), false)).toMatch(/confirm/);
  });
});

describe("arena size guard bypasses", () => {
  it("blocks the forms that slipped through", () => {
    expect(arenaSizeGuard("python bracket.py --dir X init --agents 100 --task-file t.md", false)).toMatch(/confirm/);
    expect(arenaSizeGuard("python bracket.py init --agents 16 --agents 100 --task-file t.md", false)).toMatch(/confirm/);
    expect(arenaSizeGuard("python bracket.py init --agents 100 --task-file t.md # --quick", false)).toMatch(/confirm/);
    expect(arenaSizeGuard("echo --quick && python bracket.py init --task-file t.md", false)).toMatch(/confirm/);
  });
  it("still allows --quick, plan, and a confirmed full run up to 100", () => {
    expect(arenaSizeGuard("python bracket.py init --quick --task-file t.md", false)).toBeNull();
    expect(arenaSizeGuard("python bracket.py plan --agents 100", false)).toBeNull();
    expect(arenaSizeGuard("python bracket.py init --agents 100 --task-file t.md", true)).toBeNull();
    expect(arenaSizeGuard("python bracket.py init --agents 500 --task-file t.md", true)).toMatch(/100/);
  });
});

describe("hot reload during an arena run", () => {
  it("a fresh module instance still sees the run in progress", async () => {
    const ws = tmp();
    const a = await import("./arena");
    const dir = a.ensureIdeaArena(ws, "IDEA");
    const original = fs.readFileSync(path.join(dir, "rubric.md"), "utf8");
    let release!: () => void;
    const running = a.withIdeaRubric(dir, () => new Promise<void>((r) => { release = r; }));
    vi.resetModules();
    const b = await import("./arena");
    b.ensureIdeaArena(ws, "IDEA");
    expect(fs.readFileSync(path.join(dir, "rubric.md"), "utf8")).toBe("IDEA\n");
    release();
    await running;
    expect(fs.readFileSync(path.join(dir, "rubric.md"), "utf8")).toBe(original);
  });
});
