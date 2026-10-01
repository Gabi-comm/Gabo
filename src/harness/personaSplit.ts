// "Team in one reply": the lead writes several agents' turns, each under a `### <agent id>` line. This turns
// those turns into agent blocks in the transcript, so they look and read like the agents talking.
import type { AgentKey } from "./agents";
import type { UiEvent } from "./events";

export interface PersonaName { id: AgentKey; names: string[] }

const HEADING = /^\s*#{2,4}\s*(.+?)\s*:?\s*$/;

export function makePersonaSplitter(roster: PersonaName[]): { push: (e: UiEvent) => UiEvent[]; end: () => UiEvent[] } {
  const lookup = new Map<string, AgentKey>();
  for (const p of roster) for (const n of [p.id, ...p.names]) lookup.set(norm(n), p.id);
  let held = "";
  let atLineStart = true;
  let current: AgentKey | null = null;
  let turn = 0;
  const said: AgentKey[] = [];

  const text = (delta: string): UiEvent => ({ type: "text", delta, agent: current });
  const stop = (): UiEvent[] => {
    if (!current) return [];
    const e: UiEvent = { type: "agent_stop", agent: current, toolUseId: `persona-${turn}`, ok: true };
    current = null;
    return [e];
  };
  const heading = (line: string): UiEvent[] | null => {
    const m = HEADING.exec(line);
    if (!m) return null;
    const label = norm(m[1].replace(/[*_`]/g, ""));
    if (label === "recap" || label === "summary" || label === "caveman recap") return stop();
    const who = lookup.get(label);
    if (!who) return null;
    const out = stop();
    turn += 1;
    current = who;
    const from = said.filter((a) => a !== who).slice(-1);
    said.push(who);
    out.push({ type: "agent_start", agent: who, toolUseId: `persona-${turn}`, description: "in the team reply", ...(from.length ? { from } : {}) });
    return out;
  };

  function feed(delta: string): UiEvent[] {
    const out: UiEvent[] = [];
    let rest = held + delta;
    held = "";
    while (rest) {
      if (atLineStart && /^\s*#/.test(rest)) {
        const nl = rest.indexOf("\n");
        if (nl === -1) { held = rest; break; }
        const line = rest.slice(0, nl + 1);
        rest = rest.slice(nl + 1);
        const switched = heading(line);
        if (switched) out.push(...switched);
        else out.push(text(line));
        atLineStart = true;
        continue;
      }
      if (atLineStart && /^\s*$/.test(rest) && !rest.includes("\n")) { held = rest; break; }
      const nl = rest.indexOf("\n");
      if (nl === -1) { out.push(text(rest)); atLineStart = false; break; }
      out.push(text(rest.slice(0, nl + 1)));
      rest = rest.slice(nl + 1);
      atLineStart = true;
    }
    return out;
  }

  return {
    push(e) {
      if (e.type === "text" && e.agent === null) return feed(e.delta);
      // A real agent or tool call ends the current written turn.
      if (e.type === "agent_start" || e.type === "tool_start") return [...flush(), ...stop(), e];
      if (e.type === "result" || e.type === "done") return [...flush(), ...stop(), e];
      return [e];
    },
    end: () => [...flush(), ...stop()],
  };

  function flush(): UiEvent[] {
    if (!held) return [];
    const h = held;
    held = "";
    const switched = heading(h);
    return switched ?? [text(h)];
  }
}

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
