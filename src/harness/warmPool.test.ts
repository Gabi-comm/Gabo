import { describe, expect, it, vi } from "vitest";
import type { Options, Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { WarmPool, sessionKey, splitForSpare } from "./warmPool";

/** A fake Claude Code session: answers each pushed message with init (first only), text and a result. */
function fakeQueryFactory(opts: { dieBeforeTurn?: number } = {}) {
  const started: Options[] = [];
  const interrupts: number[] = [];
  const closed: number[] = [];
  let turnCount = 0;
  const make = ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage>; options: Options }): Query => {
    const id = started.push(options);
    const sessionId = options.resume ?? `s${id}`;
    async function* run(): AsyncGenerator<SDKMessage> {
      let first = true;
      for await (const m of prompt) {
        turnCount += 1;
        if (opts.dieBeforeTurn === turnCount) throw new Error("process exited");
        if (first) { yield { type: "system", subtype: "init", session_id: sessionId, model: "claude-sonnet-x" } as never; first = false; }
        const text = typeof m.message.content === "string" ? m.message.content : "blocks";
        yield { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: `echo ${text}` }] } } as never;
        yield { type: "result", subtype: "success", session_id: sessionId } as never;
      }
    }
    const gen = run();
    return Object.assign(gen, {
      interrupt: vi.fn(async () => { interrupts.push(id); }),
      setModel: vi.fn(async () => {}),
      setPermissionMode: vi.fn(async () => {}),
      close: vi.fn(() => { closed.push(id); }),
    }) as unknown as Query;
  };
  return { make, started, interrupts, closed };
}

const msg = (text: string) => ({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, session_id: "" }) as SDKUserMessage;
const handlers = { canUseTool: async () => ({ behavior: "allow" as const, updatedInput: {} }), preToolUse: async () => ({}) };
const base = { cwd: "/w", model: "sonnet", systemPrompt: { type: "preset", preset: "claude_code", append: "room A" } } as Options;

async function turn(pool: WarmPool, conversationId: string, text: string, options = base, signal = new AbortController().signal) {
  const seen: SDKMessage[] = [];
  const kind = await pool.runTurn({ conversationId, options, message: msg(text), handlers, onMessage: (m) => seen.push(m), signal });
  return { kind, seen };
}

describe("warm session pool", () => {
  it("reuses one live process for a chat's follow-ups", async () => {
    const f = fakeQueryFactory();
    const pool = new WarmPool(f.make);
    const a = await turn(pool, "c1", "hello");
    const b = await turn(pool, "c1", "again");
    expect([a.kind, b.kind]).toEqual(["fresh", "warm"]);
    expect(f.started).toHaveLength(1);
    expect(b.seen.map((m) => m.type)).toEqual(["assistant", "result"]);
    expect(pool.info("c1")).toEqual({ sessionId: "s1", model: "claude-sonnet-x" });
    pool.closeAll();
  });

  it("restarts when settings the session is bound to change; model changes stay live", async () => {
    const f = fakeQueryFactory();
    const pool = new WarmPool(f.make);
    await turn(pool, "c1", "one");
    await turn(pool, "c1", "two", { ...base, model: "opus" });
    expect(f.started).toHaveLength(1);
    await turn(pool, "c1", "three", { ...base, systemPrompt: { type: "preset", preset: "claude_code", append: "room B" } });
    expect(f.started).toHaveLength(2);
    expect(sessionKey({ ...base, resume: "x", model: "haiku" })).toBe(sessionKey(base));
    pool.closeAll();
  });

  it("closes idle sessions and keeps at most 3", async () => {
    vi.useFakeTimers();
    const f = fakeQueryFactory();
    const pool = new WarmPool(f.make, 1000, 3);
    for (const c of ["a", "b", "c", "d"]) await turn(pool, c, "hi");
    expect(pool.size()).toBe(3);
    expect(pool.has("a")).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(pool.size()).toBe(0);
    vi.useRealTimers();
  });

  it("restarts a parked process that died, resuming the chat", async () => {
    const f = fakeQueryFactory({ dieBeforeTurn: 2 });
    const pool = new WarmPool(f.make);
    await turn(pool, "c1", "one");
    const again = await turn(pool, "c1", "two");
    expect(again.kind).toBe("fresh");
    expect(f.started).toHaveLength(2);
    expect(f.started[1].resume).toBe("s1");
    pool.closeAll();
  });

  it("Esc interrupts the turn instead of killing the process", async () => {
    const f = fakeQueryFactory();
    const pool = new WarmPool(f.make);
    await turn(pool, "c1", "one");
    const ac = new AbortController();
    const p = turn(pool, "c1", "two", base, ac.signal);
    ac.abort();
    await p;
    expect(pool.has("c1")).toBe(true);
    pool.closeAll();
    expect(f.closed).toContain(1);
  });

  it("parks a spare after a reply and claims it for the next new chat", async () => {
    vi.useFakeTimers();
    const f = fakeQueryFactory();
    const claims: unknown[] = [];
    const prewarm = vi.fn(async ({ options }: { options: Options }) => ({
      claim: ({ prompt, options: claim }: { prompt: AsyncIterable<SDKUserMessage>; options: unknown }) => { claims.push(claim); return f.make({ prompt, options: { ...options, ...(claim as object) } }); },
      claimed: Promise.resolve({ cwd: "/w", sessionId: "spare" }),
      close: vi.fn(),
    }) as never);
    const pool = new WarmPool(f.make, 60_000, 3, prewarm);
    await turn(pool, "c1", "first chat");
    await vi.advanceTimersByTimeAsync(2000);
    expect(prewarm).toHaveBeenCalledTimes(1);
    expect(pool.hasSpare()).toBe(true);
    const b = await turn(pool, "c2", "new chat");
    expect(b.seen.at(-1)?.type).toBe("result");
    expect(claims[0]).toMatchObject({ cwd: "/w", model: "sonnet", appendSystemPrompt: "room A" });
    expect(f.started).toHaveLength(2); // c1 fresh + c2 via the claimed spare
    pool.closeAll();
    vi.useRealTimers();
  });

  it("falls back to a fresh start when the claim is refused", async () => {
    vi.useFakeTimers();
    const f = fakeQueryFactory();
    const prewarm = vi.fn(async () => ({
      claim: () => {
        async function* refused(): AsyncGenerator<SDKMessage> { yield { type: "result", subtype: "error_during_execution", is_error: true, errors: ["not_claimed: cwd_not_found"] } as never; }
        return Object.assign(refused(), { close: vi.fn(), interrupt: vi.fn(), setModel: vi.fn(), setPermissionMode: vi.fn() }) as unknown as Query;
      },
      claimed: Promise.reject(new Error("cwd_not_found")),
      close: vi.fn(),
    }) as never);
    const pool = new WarmPool(f.make, 60_000, 3, prewarm);
    await turn(pool, "c1", "one");
    await vi.advanceTimersByTimeAsync(2000);
    const b = await turn(pool, "c2", "two");
    expect(b.kind).toBe("fresh");
    expect(b.seen.map((m) => m.type)).toContain("assistant");
    pool.closeAll();
    vi.useRealTimers();
  });

  it("no spare for resumed chats' claims or Local LLM runs with per-run tool lists", () => {
    expect(splitForSpare({ ...base, resume: "s1" })).toBeNull();
    expect(splitForSpare({ ...base, tools: ["Read"] })).toBeNull();
    expect(splitForSpare(base)?.host.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
  });
});
