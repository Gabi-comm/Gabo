import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRESETS, askProvider, maskKey, usableProviders, validateProvider } from "./providers";
import { loadProviders, publicProviders, saveProvider } from "@/server/providers";

const chatgpt = { ...PRESETS.find((p) => p.id === "chatgpt")!, apiKey: "sk-test-9876", enabled: true };
const gemini = { ...PRESETS.find((p) => p.id === "gemini")!, apiKey: "AIza-test", enabled: true };

function recordingFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reply), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

describe("provider presets", () => {
  it("ship ChatGPT, Gemini, OpenClaw, Hermes and a custom OpenAI-compatible slot, all off", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["chatgpt", "gemini", "openclaw", "hermes", "custom"]);
    expect(PRESETS.every((p) => !p.enabled && !p.apiKey)).toBe(true);
  });
});

describe("validateProvider", () => {
  it("accepts https anywhere and http only on this machine", () => {
    expect(validateProvider({ ...chatgpt })).toBeNull();
    expect(validateProvider({ ...chatgpt, baseUrl: "http://127.0.0.1:11434/v1" })).toBeNull();
    expect(validateProvider({ ...chatgpt, baseUrl: "http://evil.example/v1" })).toMatch(/https/);
    expect(validateProvider({ ...chatgpt, baseUrl: "file:///etc/passwd" })).toMatch(/https/);
    expect(validateProvider({ ...chatgpt, model: "gpt 5; rm" })).toMatch(/model/);
  });
});

describe("askProvider", () => {
  it("calls OpenAI-style chat completions with a bearer key", async () => {
    const { f, calls } = recordingFetch({ choices: [{ message: { content: "Hi from GPT" } }] });
    await expect(askProvider(chatgpt, { prompt: "hello", system: "be brief" }, f)).resolves.toBe("Hi from GPT");
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test-9876");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages).toEqual([{ role: "system", content: "be brief" }, { role: "user", content: "hello" }]);
  });

  it("calls Gemini generateContent with the key in a header", async () => {
    const { f, calls } = recordingFetch({ candidates: [{ content: { parts: [{ text: "Hi " }, { text: "from Gemini" }] } }] });
    await expect(askProvider(gemini, { prompt: "hello" }, f)).resolves.toBe("Hi from Gemini");
    expect(calls[0].url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${gemini.model}:generateContent`);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
  });

  it("turns an API error into a readable message", async () => {
    const { f } = recordingFetch({ error: { message: "Incorrect API key provided" } }, 401);
    await expect(askProvider(chatgpt, { prompt: "x" }, f)).rejects.toThrow(/401.*Incorrect API key/);
  });
});

describe("usableProviders", () => {
  it("only enabled providers with a key, or a key-less local endpoint", () => {
    const local = { ...PRESETS.find((p) => p.id === "hermes")!, baseUrl: "http://127.0.0.1:11434/v1", enabled: true };
    const off = { ...chatgpt, enabled: false };
    const noKey = { ...gemini, apiKey: undefined };
    expect(usableProviders([chatgpt, local, off, noKey]).map((p) => p.id)).toEqual(["chatgpt", "hermes"]);
  });
});

describe("maskKey", () => {
  it("shows only the last four characters", () => {
    expect(maskKey("sk-proj-abcdef1234")).toBe("••••1234");
    expect(maskKey(undefined)).toBe("");
  });
});

describe("provider store", () => {
  const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-prov-")), "ai-providers.json");

  it("keeps the saved key when a save leaves it out, clears it on empty, and never exposes it", () => {
    const f = file();
    saveProvider(f, "chatgpt", { enabled: true, apiKey: "sk-live-5555", model: "gpt-5" });
    saveProvider(f, "chatgpt", { model: "gpt-5-mini" });
    const saved = loadProviders(f).find((p) => p.id === "chatgpt")!;
    expect(saved).toMatchObject({ apiKey: "sk-live-5555", model: "gpt-5-mini", enabled: true });
    const pub = publicProviders(loadProviders(f)).find((p) => p.id === "chatgpt")!;
    expect(pub).toMatchObject({ hasKey: true, keyHint: "••••5555" });
    expect(JSON.stringify(pub)).not.toContain("sk-live-5555");
    saveProvider(f, "chatgpt", { apiKey: "" });
    expect(loadProviders(f).find((p) => p.id === "chatgpt")!.apiKey).toBeUndefined();
  });

  it("rejects unknown providers and invalid settings", () => {
    const f = file();
    expect(() => saveProvider(f, "skynet", { enabled: true })).toThrow(/Unknown/);
    expect(() => saveProvider(f, "chatgpt", { baseUrl: "http://evil.example" })).toThrow(/https/);
  });
});
