"use client";

import { useCallback, useEffect, useState } from "react";
import { isAgentId, type AgentKey } from "@/harness/agents";
import { metaOf, type AgentInfo } from "@/harness/agentMeta";
import type { CustomAgent } from "@/harness/customAgents";
import { Mascot, type MascotProps } from "@/components/mascot/Mascot";

export const CUSTOM_AGENTS_CHANGED = "gabo:custom-agents-changed";

let cache: Promise<CustomAgent[]> | null = null;

export function fetchCustomAgents(refresh = false): Promise<CustomAgent[]> {
  if (!cache || refresh) {
    cache = fetch("/api/agents/custom", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<CustomAgent[]>) : []))
      .catch(() => []);
  }
  return cache;
}

/** Gab's own agents (null until loaded). Refreshes when Settings saves one. */
export function useCustomAgents(): CustomAgent[] | null {
  const [list, setList] = useState<CustomAgent[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = (refresh: boolean) => fetchCustomAgents(refresh).then((l) => { if (alive) setList(l); });
    load(false);
    const onChange = () => load(true);
    window.addEventListener(CUSTOM_AGENTS_CHANGED, onChange);
    return () => { alive = false; window.removeEventListener(CUSTOM_AGENTS_CHANGED, onChange); };
  }, []);
  return list;
}

/** Name, tagline, costume and backdrop for any agent id, built-in or custom. */
export function useAgentMeta(): (id: AgentKey) => AgentInfo {
  const customs = useCustomAgents();
  return useCallback((id: AgentKey) => metaOf(id, customs ?? []), [customs]);
}

/** The right mascot for any agent id. */
export function AgentMascot({ id, info, ...rest }: Omit<MascotProps, "kind" | "costume"> & { id: AgentKey; info?: AgentInfo }) {
  if (isAgentId(id)) return <Mascot kind={id} {...rest} />;
  return <Mascot costume={info?.costume ?? {}} title={rest.title ?? info?.name ?? id} {...rest} />;
}
