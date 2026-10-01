// Small local models (llama3.2 through Ollama) sometimes leak their chat template: a reply starts with
// "assistant" on its own line. This drops that header from the start of each reply before it reaches the UI.
import type { UiEvent } from "./events";

const HEADER = "assistant";

export function makeHeaderFilter(): (e: UiEvent) => UiEvent[] {
  let held = "";
  let atStart = true;
  return (e) => {
    if (e.type !== "text" || e.agent !== null) {
      // A tool call or another agent: the next text is a new reply that may start with the header again.
      if (e.type === "tool_start" || e.type === "tool_result") { atStart = true; held = ""; }
      return [e];
    }
    if (!atStart) return [e];
    held += e.delta;
    const lead = held.replace(/^\s+/, "");
    // Still could be the header ("assi…", "assistant", "assistant\n"): wait for more.
    if (lead.length <= HEADER.length ? HEADER.startsWith(lead) : /^assistant\s*$/.test(lead)) return [];
    atStart = false;
    const rest = held.replace(/^\s*assistant[ \t]*\r?\n\s*/, "");
    held = "";
    return rest ? [{ ...e, delta: rest }] : [];
  };
}
