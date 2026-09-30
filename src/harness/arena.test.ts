import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { arenaSizeGuard, ensureIdeaArena, parsePythonVersion, withIdeaRubric } from "./arena";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gabo-arena-"));
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("ensureIdeaArena", () => {
  it("installs the vendored skill as idea-arena with the Idea Rubric next to rubric.md", () => {
    const ws = tmp();
    const dir = ensureIdeaArena(ws, "## The Idea Rubric\nimpact");
    expect(read(path.join(dir, "SKILL.md"))).toMatch(/^---\r?\nname: idea-arena\r?\n/);
    expect(read(path.join(dir, "idea-rubric.md"))).toBe("## The Idea Rubric\nimpact\n");
    expect(fs.existsSync(path.join(dir, "bracket.py"))).toBe(true);
    expect(read(path.join(dir, "rubric.md"))).not.toContain("Idea Rubric");
  });

  it("recovers a stale backup left by a crash before reinstalling", () => {
    const ws = tmp();
    const dir = ensureIdeaArena(ws, "IDEA");
    const original = read(path.join(dir, "rubric.md"));
    fs.copyFileSync(path.join(dir, "rubric.md"), path.join(dir, "rubric.original.md"));
    fs.writeFileSync(path.join(dir, "rubric.md"), "IDEA");
    ensureIdeaArena(ws, "IDEA");
    expect(read(path.join(dir, "rubric.md"))).toBe(original);
    expect(fs.existsSync(path.join(dir, "rubric.original.md"))).toBe(false);
  });
});

describe("withIdeaRubric", () => {
  it("swaps the Idea Rubric in for the run and the original back after", async () => {
    const dir = ensureIdeaArena(tmp(), "IDEA RUBRIC");
    const original = read(path.join(dir, "rubric.md"));
    let during = "";
    await withIdeaRubric(dir, async () => { during = read(path.join(dir, "rubric.md")); });
    expect(during).toBe("IDEA RUBRIC\n");
    expect(read(path.join(dir, "rubric.md"))).toBe(original);
    expect(fs.existsSync(path.join(dir, "rubric.original.md"))).toBe(false);
  });

  it("restores the original even when the run throws", async () => {
    const dir = ensureIdeaArena(tmp(), "IDEA");
    const original = read(path.join(dir, "rubric.md"));
    await expect(withIdeaRubric(dir, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(read(path.join(dir, "rubric.md"))).toBe(original);
  });

  it("keeps the Idea Rubric in place until the last overlapping run ends", async () => {
    const dir = ensureIdeaArena(tmp(), "IDEA");
    const original = read(path.join(dir, "rubric.md"));
    let release!: () => void;
    const first = withIdeaRubric(dir, () => new Promise<void>((r) => { release = r; }));
    await withIdeaRubric(dir, async () => {});
    expect(read(path.join(dir, "rubric.md"))).toBe("IDEA\n");
    release();
    await first;
    expect(read(path.join(dir, "rubric.md"))).toBe(original);
  });
});

describe("arenaSizeGuard", () => {
  it("lets --quick and small runs through", () => {
    expect(arenaSizeGuard('python "C:/x/idea-arena/bracket.py" init --quick --task-file .arena/task.md', false)).toBeNull();
    expect(arenaSizeGuard("python3 bracket.py init --agents 16 --task-file t.md", false)).toBeNull();
    expect(arenaSizeGuard("python3 bracket.py next --json", false)).toBeNull();
    expect(arenaSizeGuard("npm test", false)).toBeNull();
  });
  it("blocks a big or default-size (100) run unless Gab confirmed a full run", () => {
    expect(arenaSizeGuard("python3 bracket.py init --agents 100 --task-file t.md", false)).toMatch(/confirm/);
    expect(arenaSizeGuard("python3 bracket.py init --task-file t.md", false)).toMatch(/confirm/);
    expect(arenaSizeGuard("python3 bracket.py init --agents=64 --task-file t.md", false)).toMatch(/confirm/);
    expect(arenaSizeGuard("python3 bracket.py init --agents 100 --task-file t.md", true)).toBeNull();
  });
});

describe("parsePythonVersion", () => {
  it("accepts 3.8 and newer", () => {
    expect(parsePythonVersion("Python 3.14.6")).toBe(true);
    expect(parsePythonVersion("Python 3.8.0")).toBe(true);
    expect(parsePythonVersion("Python 3.7.9")).toBe(false);
    expect(parsePythonVersion("Python 2.7.18")).toBe(false);
    expect(parsePythonVersion("command not found")).toBe(false);
  });
});
