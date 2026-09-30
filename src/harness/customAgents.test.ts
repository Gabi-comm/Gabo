import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isAgentKey, isCustomId } from "./agents";
import { makeCustomId, validateCustomAgent } from "./customAgents";
import { createCustomAgent, deleteCustomAgent, loadCustomAgents, updateCustomAgent } from "@/server/customAgents";

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-custom-")), "custom-agents.json");
const draft = { name: "Data Wizard", tagline: "Finds the story in a spreadsheet.", prompt: "You analyse data and explain it plainly.", goal: "Always show one chart idea.", costume: { head: "wizard", held: "staff" }, backdrop: "space" };

describe("custom agent ids", () => {
  it("are x- slugs, unique, and never collide with built-ins", () => {
    expect(makeCustomId("Data Wizard!", [])).toBe("x-data-wizard");
    expect(makeCustomId("Data Wizard", ["x-data-wizard"])).toBe("x-data-wizard-2");
    expect(makeCustomId("   ", [])).toBe("x-agent");
    expect(isCustomId("x-data-wizard")).toBe(true);
    expect(isCustomId("judge")).toBe(false);
    expect(isAgentKey("judge")).toBe(true);
    expect(isAgentKey("x-data-wizard")).toBe(true);
    expect(isAgentKey("x-../../etc")).toBe(false);
  });
});

describe("validateCustomAgent", () => {
  it("cleans a draft: trims, sanitises the costume, falls back to a backdrop", () => {
    const v = validateCustomAgent({ ...draft, name: "  Data Wizard  ", costume: { head: "wizard", held: "laser" }, backdrop: "mars" });
    expect(v).toMatchObject({ ok: true, value: { name: "Data Wizard", costume: { head: "wizard" }, backdrop: "sunrise" } });
  });
  it("needs a name and a role prompt, within limits", () => {
    expect(validateCustomAgent({ ...draft, name: "" })).toMatchObject({ ok: false });
    expect(validateCustomAgent({ ...draft, prompt: "  " })).toMatchObject({ ok: false });
    expect(validateCustomAgent({ ...draft, prompt: "a".repeat(20_001) })).toMatchObject({ ok: false });
    expect(validateCustomAgent({ ...draft, name: "The Caveman" })).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
  });
});

describe("custom agent store", () => {
  it("creates, updates and deletes, keeping ids stable", () => {
    const f = file();
    const a = createCustomAgent(f, draft);
    expect(a.id).toBe("x-data-wizard");
    expect(loadCustomAgents(f)).toHaveLength(1);
    expect(() => createCustomAgent(f, draft)).toThrow(/already have/);
    const b = createCustomAgent(f, { ...draft, name: "Data Wizard 2" });
    expect(b.id).toBe("x-data-wizard-2");
    const u = updateCustomAgent(f, a.id, { ...draft, goal: "Two chart ideas." });
    expect(u).toMatchObject({ id: "x-data-wizard", goal: "Two chart ideas." });
    deleteCustomAgent(f, a.id);
    expect(loadCustomAgents(f).map((x) => x.id)).toEqual(["x-data-wizard-2"]);
    expect(() => updateCustomAgent(f, "x-nope", draft)).toThrow(/not found/);
  });
});
