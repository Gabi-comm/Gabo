// Warm sessions (docs/plan-faster-replies.md §7): keep each chat's Claude Code process alive between messages,
// so a follow-up skips the ~5 s start-up (plugins, MCP servers). Follow-ups are pushed into the live session's
// streaming input; a turn ends at its `result` message. Idle sessions close after 10 minutes; at most 3 stay.
import type { CanUseTool, ClaimOptions, HookCallbackMatcher, Options, Query, SDKMessage, SDKUserMessage, SpareProcess } from "@anthropic-ai/claude-agent-sdk";

/** What the live session's callbacks hand off to: set for the running turn, cleared after. */
export interface TurnHandlers {
  canUseTool: CanUseTool;
  preToolUse: (input: unknown) => Promise<Record<string, unknown>>;
}

type QueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Query;
type PrewarmFn = (params: { options: Options }) => Promise<SpareProcess>;

/** Options a claim sets per chat; everything else is fixed when the spare starts (SDK prewarm/claim). */
const CLAIM_KEYS = new Set(["cwd", "model", "permissionMode", "agents", "additionalDirectories"]);

/**
 * Splits options into the spare's start-up part and the claim. Null when a spare can't serve them: a resumed
 * chat (claims can't resume), per-run tool or skill lists (Local LLM), or a non-preset system prompt.
 */
export function splitForSpare(options: Options): { host: Options; claim: ClaimOptions } | null {
  const sp = options.systemPrompt as { type?: string; preset?: string; append?: string } | undefined;
  if (options.resume || options.skills || options.tools || !options.cwd || sp?.type !== "preset") return null;
  const host = Object.fromEntries(Object.entries(options).filter(([k]) => !CLAIM_KEYS.has(k) && k !== "resume")) as Options;
  host.systemPrompt = { type: "preset", preset: "claude_code" } as Options["systemPrompt"];
  const claim: ClaimOptions = {
    cwd: options.cwd,
    ...(options.model ? { model: options.model } : {}),
    ...(options.permissionMode ? { permissionMode: options.permissionMode } : {}),
    ...(sp.append ? { appendSystemPrompt: sp.append } : {}),
    ...(options.agents ? { agents: options.agents } : {}),
    ...(options.additionalDirectories ? { additionalDirectories: options.additionalDirectories } : {}),
  };
  return { host, claim };
}

/** A push-based async iterable: the live session's input. */
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;
  push(m: SDKUserMessage) {
    if (this.waiting) { const w = this.waiting; this.waiting = null; w({ value: m, done: false }); } else this.items.push(m);
  }
  close() {
    this.closed = true;
    if (this.waiting) { const w = this.waiting; this.waiting = null; w({ value: undefined as never, done: true }); }
  }
  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => { this.waiting = resolve; });
      },
    };
  }
}

interface Entry {
  key: string;
  q: Query;
  input: InputQueue;
  iter: AsyncIterator<SDKMessage>;
  handlers: { current: TurnHandlers | null };
  sessionId: string | null;
  /** The model Claude Code reported at start-up (full id). */
  initModel: string | null;
  model: string | undefined;
  mode: string | undefined;
  busy: boolean;
  lastUsed: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Came from a parked spare: a refused claim falls back to a fresh start. */
  claimed?: boolean;
}

/** Options that can change on a live session without restarting it. */
const LIVE_KEYS = new Set(["resume", "model", "permissionMode", "abortController", "canUseTool", "hooks"]);

/**
 * The part of the options a live session is bound to. In-process (sdk) MCP servers are compared by name: a fresh
 * instance per run is normal and must not restart the session.
 */
export function sessionKey(options: Options): string {
  return JSON.stringify(options, (k, v) => {
    if (LIVE_KEYS.has(k)) return undefined;
    if (v && typeof v === "object" && (v as { type?: string }).type === "sdk") return `sdk:${(v as { name?: string }).name ?? ""}`;
    if (typeof v === "function") return undefined;
    return v;
  });
}

export interface TurnInput {
  conversationId: string;
  /** Full options without canUseTool/hooks/abortController (the pool supplies those). */
  options: Options;
  message: SDKUserMessage;
  handlers: TurnHandlers;
  onMessage: (m: SDKMessage) => void;
  signal: AbortSignal;
}

export class WarmPool {
  private entries = new Map<string, Entry>();
  /** One parked process for the next new chat (plan-faster-replies §7). */
  private spare: { key: string; handlers: Entry["handlers"]; ready: Promise<SpareProcess> } | null = null;

  constructor(private query: QueryFn, private idleMs = 10 * 60_000, private max = 3, private prewarm?: PrewarmFn) {}

  hasSpare() { return !!this.spare; }

  /** Delegating callbacks: the spare or session hands tool checks to whichever turn is running. */
  private callbacks(handlers: Entry["handlers"]): Pick<Options, "canUseTool" | "hooks"> {
    const preToolUse: HookCallbackMatcher = { hooks: [async (h) => (handlers.current ? await handlers.current.preToolUse(h) : {}) as never] };
    return {
      canUseTool: async (tool, toolInput, extra) =>
        handlers.current ? handlers.current.canUseTool(tool, toolInput, extra) : { behavior: "deny", message: "No turn is running." },
      hooks: { PreToolUse: [preToolUse] },
    };
  }

  /** Parks a spare process matching these options, unless one is already parked for them. */
  ensureSpare(options: Options) {
    // Any chat's options describe the next new chat too, minus its resume.
    const split = this.prewarm && splitForSpare({ ...options, resume: undefined });
    if (!split) return;
    const key = sessionKey(split.host);
    if (this.spare?.key === key) return;
    this.dropSpare();
    const handlers: Entry["handlers"] = { current: null };
    const ready = this.prewarm!({ options: { ...split.host, ...this.callbacks(handlers) } });
    const spare = { key, handlers, ready };
    this.spare = spare;
    // A spare that exits while parked rejects `claimed` before anyone claims it: handle that here.
    ready.then((sp) => sp.claimed.catch(() => { if (this.spare === spare) this.spare = null; }), () => { if (this.spare === spare) this.spare = null; });
  }

  private dropSpare() {
    const old = this.spare;
    this.spare = null;
    old?.ready.then((sp) => sp.close()).catch(() => {});
  }

  /** Claims the parked spare for a new chat when it matches; null otherwise. */
  private async claim(conversationId: string, options: Options): Promise<Entry | null> {
    const split = splitForSpare(options);
    const spare = this.spare;
    if (!split || !spare || spare.key !== sessionKey(split.host)) return null;
    this.spare = null;
    let sp: SpareProcess;
    try { sp = await spare.ready; } catch { return null; }
    const input = new InputQueue();
    let q: Query;
    try { q = sp.claim({ prompt: input, options: split.claim }); } catch { return null; }
    sp.claimed.catch(() => { /* the turn sees the refusal as an error result or an ended stream, and starts fresh */ });
    const entry: Entry = {
      key: sessionKey(options), q, input, iter: q[Symbol.asyncIterator](), handlers: spare.handlers, claimed: true,
      sessionId: null, initModel: null, model: options.model, mode: options.permissionMode, busy: false, lastUsed: Date.now(), timer: null,
    };
    this.entries.set(conversationId, entry);
    this.evict(conversationId);
    return entry;
  }

  /** Live sessions, for Status and tests. */
  size() { return this.entries.size; }
  has(conversationId: string) { return this.entries.has(conversationId); }

  close(conversationId: string) {
    const e = this.entries.get(conversationId);
    if (!e) return;
    this.entries.delete(conversationId);
    if (e.timer) clearTimeout(e.timer);
    e.input.close();
    try { e.q.close(); } catch { /* already gone */ }
  }

  closeAll() { for (const id of [...this.entries.keys()]) this.close(id); this.dropSpare(); }

  /** The live Query of a chat while a turn runs (for /api/control). */
  live(conversationId: string): Query | undefined {
    return this.entries.get(conversationId)?.q;
  }

  private start(conversationId: string, options: Options): Entry {
    const handlers: Entry["handlers"] = { current: null };
    const input = new InputQueue();
    const q = this.query({ prompt: input, options: { ...options, ...this.callbacks(handlers) } });
    const entry: Entry = {
      key: sessionKey(options), q, input, iter: q[Symbol.asyncIterator](), handlers,
      sessionId: options.resume ?? null, initModel: null, model: options.model, mode: options.permissionMode, busy: false, lastUsed: Date.now(), timer: null,
    };
    this.entries.set(conversationId, entry);
    this.evict(conversationId);
    return entry;
  }

  /** Keep at most `max` sessions: close the least recently used idle ones. */
  private evict(keep: string) {
    const idle = [...this.entries.entries()].filter(([id, e]) => id !== keep && !e.busy).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.entries.size > this.max && idle.length) this.close(idle.shift()![0]);
  }

  /**
   * Runs one message on the chat's live session (starting one if needed). Resolves at the turn's `result`.
   * Returns "fresh" when a new process was started, "warm" when an existing one was reused.
   */
  async runTurn({ conversationId, options, message, handlers, onMessage, signal }: TurnInput): Promise<"fresh" | "warm"> {
    let entry = this.entries.get(conversationId);
    if (entry && (entry.busy || entry.key !== sessionKey(options))) { this.close(conversationId); entry = undefined; }
    let reused = !!entry;
    if (entry) {
      try {
        if (options.model !== entry.model) { await entry.q.setModel(options.model); entry.model = options.model; }
        if (options.permissionMode && options.permissionMode !== entry.mode) { await entry.q.setPermissionMode(options.permissionMode); entry.mode = options.permissionMode; }
      } catch {
        this.close(conversationId);
        entry = undefined;
        reused = false;
      }
    }
    const live = entry ?? (await this.claim(conversationId, options)) ?? this.start(conversationId, options);
    try {
      return await this.turn(live, conversationId, message, handlers, onMessage, signal, reused);
    } catch (err) {
      // A parked process that died while idle, or a refused claim, fails before the turn produced anything:
      // start fresh once (resuming the chat from its saved history when it has one).
      if ((reused || live.claimed) && err instanceof StaleSession) {
        const fresh = this.start(conversationId, { ...options, ...(err.sessionId ? { resume: err.sessionId } : {}) });
        return this.turn(fresh, conversationId, message, handlers, onMessage, signal, false);
      }
      throw err;
    } finally {
      // Park a spare for the next new chat, after this reply so it doesn't compete for the CPU.
      if (this.prewarm) setTimeout(() => this.ensureSpare(options), 1500).unref?.();
    }
  }

  private async turn(entry: Entry, conversationId: string, message: SDKUserMessage, handlers: TurnHandlers, onMessage: (m: SDKMessage) => void, signal: AbortSignal, reused: boolean): Promise<"fresh" | "warm"> {
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    entry.busy = true;
    entry.handlers.current = handlers;
    const onAbort = () => { entry.q.interrupt().catch(() => this.close(conversationId)); };
    signal.addEventListener("abort", onAbort);
    let produced = false;
    try {
      entry.input.push({ ...message, session_id: entry.sessionId ?? "" });
      for (;;) {
        let next: IteratorResult<SDKMessage>;
        try {
          next = await entry.iter.next();
        } catch (err) {
          this.close(conversationId);
          if (!produced) throw new StaleSession(entry.sessionId, err);
          throw err;
        }
        if (next.done) {
          this.close(conversationId);
          if (!produced) throw new StaleSession(entry.sessionId, new Error("The session ended."));
          throw new Error("The Claude Code session ended unexpectedly.");
        }
        const m = next.value;
        // A refused claim answers the prompt with an error result starting "not_claimed": nothing ran yet.
        if (!produced && m.type === "result" && entry.claimed && /^not_claimed/.test(String((m as { result?: unknown; errors?: unknown[] }).result ?? (m as { errors?: unknown[] }).errors?.[0] ?? ""))) {
          this.close(conversationId);
          throw new StaleSession(null, new Error("not_claimed"));
        }
        produced = true;
        if (m.type === "system" && m.subtype === "init") { entry.sessionId = m.session_id; entry.initModel = m.model; }
        onMessage(m);
        if (m.type === "result") break;
      }
      return reused ? "warm" : "fresh";
    } finally {
      signal.removeEventListener("abort", onAbort);
      entry.handlers.current = null;
      entry.busy = false;
      entry.lastUsed = Date.now();
      if (this.entries.get(conversationId) === entry) {
        entry.timer = setTimeout(() => this.close(conversationId), this.idleMs);
        entry.timer.unref?.();
      }
    }
  }

  /** A chat's live session: its id and model (known after its first turn). */
  info(conversationId: string): { sessionId: string | null; model: string | null } | null {
    const e = this.entries.get(conversationId);
    return e ? { sessionId: e.sessionId, model: e.initModel } : null;
  }
}

export class StaleSession extends Error {
  constructor(readonly sessionId: string | null, readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}
