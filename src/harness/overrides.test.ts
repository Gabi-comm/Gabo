import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOverrides, resetOverride, saveOverride, MAX_GOAL, MAX_PROMPT } from "./overrides";
import { buildOptions } from "./runner";
import { loadSpec } from "./spec";

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-ov-")), "config", "agent-overrides.json");
const spec = loadSpec(path.resolve(__dirname, "../.."));

describe("agent overrides", () => {
  it("starts empty and survives a reload", () => {
    const f = file();
    expect(loadOverrides(f)).toEqual({});
    saveOverride(f, "judge", { prompt: "Rule fast.", goal: "Prefer FIX FIRST when unsure." });
    expect(loadOverrides(f).judge).toMatchObject({ prompt: "Rule fast.", goal: "Prefer FIX FIRST when unsure." });
  });

  it("clears a field when saved empty, and reset removes the agent", () => {
    const f = file();
    saveOverride(f, "coder", { prompt: "x", goal: "ship it" });
    saveOverride(f, "coder", { prompt: "   " });
    expect(loadOverrides(f).coder).toEqual(expect.objectContaining({ goal: "ship it" }));
    expect(loadOverrides(f).coder?.prompt).toBeUndefined();
    resetOverride(f, "coder");
    expect(loadOverrides(f).coder).toBeUndefined();
  });

  it("rejects unknown agents and oversized text", () => {
    const f = file();
    expect(() => saveOverride(f, "ghost" as never, { goal: "x" })).toThrow(/Unknown agent/);
    expect(() => saveOverride(f, "tutor", { prompt: "a".repeat(MAX_PROMPT + 1) })).toThrow(/too long/);
    expect(() => saveOverride(f, "tutor", { goal: "a".repeat(MAX_GOAL + 1) })).toThrow(/too long/);
  });

  it("treats a corrupt file as no overrides", () => {
    const f = file();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, "{oops");
    expect(loadOverrides(f)).toEqual({});
  });
});

describe("prompts with overrides", () => {
  const ws = path.resolve("/work/proj");
  it("uses the edited role text instead of the spec and appends the added goal", () => {
    const opts = buildOptions({
      room: "arena", workspace: ws, spec,
      overrides: { skeptic: { prompt: "Kill ideas politely.", goal: "Always name a free competitor." } },
    });
    const p = opts.agents!.skeptic.prompt;
    expect(p).toContain("Kill ideas politely.");
    expect(p).not.toContain(spec.agents.skeptic);
    expect(p).toContain("Gab's added goal for you: Always name a free competitor.");
    expect(p).toContain(spec.skillScout);
  });

  it("a goal alone keeps the spec role text", () => {
    const opts = buildOptions({ room: "arena", workspace: ws, spec, overrides: { judge: { goal: "Be brief." } } });
    expect(opts.agents!.judge.prompt).toContain(spec.agents.judge);
    expect(opts.agents!.judge.prompt).toContain("Gab's added goal for you: Be brief.");
    expect(opts.agents!.believer.prompt).not.toContain("added goal");
  });
});

describe("room run notes", () => {
  it("extraWorkflow (e.g. where idea-arena lives) reaches the lead's system prompt", () => {
    const opts = buildOptions({ room: "arena", workspace: path.resolve("/w"), spec, extraWorkflow: "ARENA-NOTE-123" });
    expect((opts.systemPrompt as { append: string }).append).toContain("ARENA-NOTE-123");
  });
});
