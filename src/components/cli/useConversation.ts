"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Decision } from "@/harness/events";
import type { RunPrefs } from "@/harness/controls";
import type { ImageAttachment } from "@/harness/images";
import type { RoomId } from "@/harness/rooms";
import { roomHref, SESSIONS_CHANGED } from "@/components/shell/Sidebar";
import { initialTranscript, parseSse, reduce, type Action, type Transcript } from "./transcript";

const storageKey = (id: string) => `gabo:t:${id}`;
const MAX_STORED_ITEMS = 400;

function newId(): string {
  return crypto.randomUUID();
}

type Stored = Transcript & { savedAt?: number };

function loadStored(id: string): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function store(id: string, t: Transcript) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify({ ...t, items: t.items.slice(-MAX_STORED_ITEMS), savedAt: Date.now() }));
  } catch { /* storage full or blocked: the transcript still lives in memory */ }
}

export function useConversation(room: RoomId, initialId?: string, sessionId?: string) {
  const [t, dispatch] = useReducer(reduce, initialTranscript);
  const [conversationId, setConversationId] = useState<string | undefined>(initialId);
  const abortRef = useRef<AbortController | null>(null);
  const busy = useRef(false);
  // Bumped by + New / /clear. A run started before the bump must not write into the fresh chat.
  const generation = useRef(0);

  // Open a chat: this browser's copy shows at once; the Claude Code session file (shared with the CLI)
  // replaces it when it's newer, so a session continued in the terminal shows up here too.
  useEffect(() => {
    let cancelled = false;
    setConversationId(initialId);
    const saved = initialId ? loadStored(initialId) : null;
    dispatch(saved ? { type: "hydrate", state: saved } : { type: "clear" });
    if (!initialId && !sessionId) return;
    const query = initialId ? `c=${encodeURIComponent(initialId)}` : `s=${encodeURIComponent(sessionId!)}`;
    fetch(`/api/history?${query}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          if (sessionId) dispatch({ type: "error", message: body.error ?? "Couldn't open that Claude Code session." });
          return;
        }
        setConversationId(body.conversationId);
        if (sessionId) history.replaceState(null, "", roomHref(body.room, body.conversationId));
        if (body.items?.length && body.updatedAt > (saved?.savedAt ?? 0)) {
          dispatch({ type: "hydrate", state: { ...initialTranscript, items: body.items, cwd: body.cwd ?? "" } });
        }
      })
      .catch(() => { /* offline: keep the local copy */ });
    return () => { cancelled = true; };
  }, [initialId, sessionId]);

  useEffect(() => {
    if (conversationId && t.items.length && !t.running) store(conversationId, t);
  }, [conversationId, t]);

  const reset = useCallback(() => {
    generation.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    busy.current = false;
    setConversationId(undefined);
    dispatch({ type: "clear" });
    history.replaceState(null, "", roomHref(room));
  }, [room]);

  // Leaving the chat (sidebar link, another room) stops its run so the server frees it.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    window.addEventListener("gabo:new", reset);
    return () => window.removeEventListener("gabo:new", reset);
  }, [reset]);

  const send = useCallback(async (prompt: string, opts: { full?: boolean; prefs?: RunPrefs; images?: ImageAttachment[] } = {}) => {
    if (busy.current) return;
    busy.current = true;
    const gen = generation.current;
    const live = (a: Action) => { if (generation.current === gen) dispatch(a); };
    const id = conversationId ?? newId();
    if (!conversationId) {
      setConversationId(id);
      history.replaceState(null, "", roomHref(room, id));
    }
    live({ type: "user_prompt", text: prompt, ...(opts.images?.length ? { images: opts.images.length } : {}) });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let announced = false;
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, room, prompt, full: opts.full === true, prefs: opts.prefs, ...(opts.images?.length ? { images: opts.images } : {}) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        live({ type: "error", message: body.error ?? `The server answered ${res.status}.` });
        live({ type: "done" });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const { events, rest } = parseSse(buffer + value);
        buffer = rest;
        for (const e of events) {
          live(e);
          if (!announced && e.type === "session") {
            announced = true;
            window.dispatchEvent(new Event(SESSIONS_CHANGED));
          }
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) {
        live({ type: "notice", text: "Interrupted by you." });
      } else {
        live({
          type: "error",
          message: "Lost the connection to the Gabo server.",
          hint: err instanceof Error ? `Is \`npm run dev\` still running? (${err.message})` : undefined,
        });
      }
    } finally {
      live({ type: "done" });
      if (generation.current === gen) {
        abortRef.current = null;
        busy.current = false;
      }
      window.dispatchEvent(new Event(SESSIONS_CHANGED));
    }
  }, [conversationId, room]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const answer = useCallback(async (requestId: string, decision: Decision, answers?: Record<string, string>) => {
    dispatch({ type: "permission_resolved", requestId, decision, ...(answers ? { answers } : {}) });
    const res = await fetch("/api/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, decision, ...(answers ? { answers } : {}) }),
    }).catch(() => null);
    if (!res?.ok) dispatch({ type: "notice", text: "That permission request had already expired, so it was denied." });
  }, []);

  return { t, dispatch, conversationId, send, stop, answer, reset };
}
