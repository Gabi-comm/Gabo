"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Decision } from "@/harness/events";
import type { RoomId } from "@/harness/rooms";
import { roomHref, SESSIONS_CHANGED } from "@/components/shell/Sidebar";
import { initialTranscript, parseSse, reduce, type Transcript } from "./transcript";

const storageKey = (id: string) => `gabo:t:${id}`;
const MAX_STORED_ITEMS = 400;

function newId(): string {
  return crypto.randomUUID();
}

function loadStored(id: string): Transcript | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Transcript) : null;
  } catch {
    return null;
  }
}

function store(id: string, t: Transcript) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify({ ...t, items: t.items.slice(-MAX_STORED_ITEMS) }));
  } catch { /* storage full or blocked: the transcript still lives in memory */ }
}

export function useConversation(room: RoomId, initialId?: string) {
  const [t, dispatch] = useReducer(reduce, initialTranscript);
  const [conversationId, setConversationId] = useState<string | undefined>(initialId);
  const abortRef = useRef<AbortController | null>(null);
  const busy = useRef(false);

  // Hydrate a resumed chat from this browser's copy of its transcript.
  useEffect(() => {
    setConversationId(initialId);
    const saved = initialId ? loadStored(initialId) : null;
    dispatch(saved ? { type: "hydrate", state: saved } : { type: "clear" });
  }, [initialId]);

  useEffect(() => {
    if (conversationId && t.items.length && !t.running) store(conversationId, t);
  }, [conversationId, t]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(undefined);
    dispatch({ type: "clear" });
    history.replaceState(null, "", roomHref(room));
  }, [room]);

  useEffect(() => {
    window.addEventListener("gabo:new", reset);
    return () => window.removeEventListener("gabo:new", reset);
  }, [reset]);

  const send = useCallback(async (prompt: string, opts: { full?: boolean } = {}) => {
    if (busy.current) return;
    busy.current = true;
    const id = conversationId ?? newId();
    if (!conversationId) {
      setConversationId(id);
      history.replaceState(null, "", roomHref(room, id));
    }
    dispatch({ type: "user_prompt", text: prompt });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let announced = false;
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, room, prompt, full: opts.full === true }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        dispatch({ type: "error", message: body.error ?? `The server answered ${res.status}.` });
        dispatch({ type: "done" });
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
          dispatch(e);
          if (!announced && e.type === "session") {
            announced = true;
            window.dispatchEvent(new Event(SESSIONS_CHANGED));
          }
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) {
        dispatch({ type: "notice", text: "Interrupted by you." });
      } else {
        dispatch({
          type: "error",
          message: "Lost the connection to the Gabo server.",
          hint: err instanceof Error ? `Is \`npm run dev\` still running? (${err.message})` : undefined,
        });
      }
    } finally {
      dispatch({ type: "done" });
      abortRef.current = null;
      busy.current = false;
      window.dispatchEvent(new Event(SESSIONS_CHANGED));
    }
  }, [conversationId, room]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const answer = useCallback(async (requestId: string, decision: Decision) => {
    dispatch({ type: "permission_resolved", requestId, decision });
    const res = await fetch("/api/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, decision }),
    }).catch(() => null);
    if (!res?.ok) dispatch({ type: "notice", text: "That permission request had already expired, so it was denied." });
  }, []);

  return { t, dispatch, conversationId, send, stop, answer, reset };
}
