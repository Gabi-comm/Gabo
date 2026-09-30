import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localEnv, validateLocal, DEFAULT_LOCAL } from "./localLlm";
import { parsePlanUsage, summarizeUsage, type UsageRecord } from "./usage";
import { buildOptions } from "./runner";
import { loadSpec } from "./spec";
import { loadPins, setPinned } from "@/server/pins";

const spec = loadSpec(path.resolve(__dirname, "../.."));

describe("local LLM (Ollama)", () => {
  it("validates the endpoint and model", () => {
    expect(validateLocal({ ...DEFAULT_LOCAL, model: "qwen3-coder:30b" })).toBeNull();
    expect(validateLocal({ ...DEFAULT_LOCAL, enabled: true, model: "" })).toMatch(/model/);
    expect(validateLocal({ ...DEFAULT_LOCAL, baseUrl: "http://evil.example:11434", model: "x" })).toMatch(/this machine/);
    expect(validateLocal({ ...DEFAULT_LOCAL, model: "bad model;" })).toMatch(/model/);
  });

  it("points Claude Code at Ollama's Anthropic-compatible API with one model for everything", () => {
    const env = localEnv({ enabled: true, baseUrl: "http://127.0.0.1:11434", model: "gpt-oss:20b" });
    expect(env).toMatchObject({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:11434",
      ANTHROPIC_AUTH_TOKEN: "ollama",
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_MODEL: "gpt-oss:20b",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "gpt-oss:20b",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "gpt-oss:20b",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "gpt-oss:20b",
      CLAUDE_CODE_SUBAGENT_MODEL: "gpt-oss:20b",
    });
  });

  it("runs use the local model for the lead and every agent when switched on", () => {
    const opts = buildOptions({
      room: "arena", workspace: path.resolve("/w"), spec, prefs: { model: "opus" },
      local: { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen3-coder" },
    });
    expect(opts.model).toBe("qwen3-coder");
    expect(opts.env?.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:11434");
    for (const def of Object.values(opts.agents!)) expect(def.model).toBe("qwen3-coder");
  });

  it("switched off, runs stay on the Claude subscription", () => {
    const opts = buildOptions({ room: "home", workspace: path.resolve("/w"), spec, local: { ...DEFAULT_LOCAL, model: "qwen3-coder" } });
    expect(opts.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(opts.env?.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe("plan usage (/usage)", () => {
  it("reads the session and week lines", () => {
    const text = [
      "You are currently using your subscription to power your Claude Code usage",
      "",
      "Current session: 88% used · resets Sep 30, 10:09pm (Asia/Taipei)",
      "Current week (all models): 43% used · resets Oct 1, 11:59pm (Asia/Taipei)",
      "Current week (Opus): 12% used · resets Oct 1, 11:59pm (Asia/Taipei)",
    ].join("\n");
    expect(parsePlanUsage(text)).toEqual([
      { label: "Current session", percent: 88, resets: "Sep 30, 10:09pm (Asia/Taipei)" },
      { label: "Current week (all models)", percent: 43, resets: "Oct 1, 11:59pm (Asia/Taipei)" },
      { label: "Current week (Opus)", percent: 12, resets: "Oct 1, 11:59pm (Asia/Taipei)" },
    ]);
    expect(parsePlanUsage("nothing here")).toEqual([]);
  });
});

describe("Gabo's own usage log", () => {
  it("totals today and the last 7 days, by room and by model", () => {
    const now = new Date("2026-09-30T12:00:00").getTime();
    const day = 86_400_000;
    const recs: UsageRecord[] = [
      { at: now - 1000, room: "home", model: "claude-opus-5", inputTokens: 100, outputTokens: 50, costUsd: 0.1 },
      { at: now - 2000, room: "arena", model: "claude-opus-5", inputTokens: 1000, outputTokens: 500, costUsd: 1 },
      { at: now - 3 * day, room: "home", model: "claude-haiku-4-5", inputTokens: 10, outputTokens: 5, costUsd: 0.01 },
      { at: now - 9 * day, room: "home", model: "old", inputTokens: 999, outputTokens: 999, costUsd: 9 },
    ];
    const s = summarizeUsage(recs, now);
    expect(s.today).toEqual({ runs: 2, tokens: 1650, costUsd: 1.1 });
    expect(s.week).toEqual({ runs: 3, tokens: 1665, costUsd: 1.11 });
    expect(s.byRoom[0]).toEqual({ key: "arena", runs: 1, tokens: 1500, costUsd: 1 });
    expect(s.byModel.map((m) => m.key)).toEqual(["claude-opus-5", "claude-haiku-4-5"]);
  });
});

describe("pins", () => {
  it("pin, unpin, and survive a reload; newest pin first", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-pins-")), "pins.json");
    setPinned(f, "s:abc", true);
    setPinned(f, "c:def", true);
    setPinned(f, "s:abc", true);
    expect(loadPins(f)).toEqual(["c:def", "s:abc"]);
    setPinned(f, "s:abc", false);
    expect(loadPins(f)).toEqual(["c:def"]);
    expect(() => setPinned(f, "../../x", true)).toThrow(/Bad/);
  });
});

import { createMapper } from "./events";
describe("rate limits from runs", () => {
  it("are surfaced so the Status page can show plan utilization", () => {
    expect(createMapper()({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "five_hour", utilization: 0.88, resetsAt: 1790780000 } } as never))
      .toEqual([{ type: "rate_limit", info: { status: "allowed_warning", rateLimitType: "five_hour", utilization: 0.88, resetsAt: 1790780000 } }]);
  });
});
