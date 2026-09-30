import { AGENTS, isAgentId, type AgentKey } from "./agents";
import type { BackdropTheme, Costume } from "./costume";
import type { CustomAgent } from "./customAgents";

/** What the UI needs to show any agent, built-in or Gab's own. */
export interface AgentInfo {
  id: AgentKey;
  name: string;
  /** Name without "The ", for tight spots (tabs, roster lines). */
  short: string;
  tagline: string;
  verb: string;
  custom: boolean;
  costume?: Costume;
  backdrop?: BackdropTheme;
}

export function metaOf(id: AgentKey, customs: readonly CustomAgent[] = []): AgentInfo {
  if (isAgentId(id)) {
    const a = AGENTS[id];
    return { id, name: a.name, short: a.name.replace(/^The /, ""), tagline: a.tagline, verb: a.verb, custom: false };
  }
  const c = customs.find((x) => x.id === id);
  if (!c) return { id, name: id, short: id, tagline: "", verb: "Working", custom: true };
  return { id, name: c.name, short: c.name, tagline: c.tagline, verb: "Working", custom: true, costume: c.costume, backdrop: c.backdrop };
}
