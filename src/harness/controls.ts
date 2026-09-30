// Session controls shared by the browser and the server: model, permission mode, effort.

/** The modes the app offers. bypassPermissions is left out on purpose: it would skip Gab's allow/deny prompts. */
export const MODES = ["default", "acceptEdits", "plan", "auto"] as const;
export type Mode = (typeof MODES)[number];

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export interface RunPrefs {
  model?: string;
  mode?: Mode;
  effort?: Effort;
}

export const MODE_LABELS: Record<Mode, string> = {
  default: "ask before edits",
  acceptEdits: "⏵⏵ accept edits on",
  plan: "⏸ plan mode on",
  auto: "auto mode on",
};

const MODEL_NAME = /^[\w.:\-[\]]{1,80}$/;

export function isMode(v: unknown): v is Mode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

/** Cleans what the browser sends; anything unknown is dropped so the CLI's own default applies. */
export function parseRunPrefs(raw: unknown): RunPrefs {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: RunPrefs = {};
  if (typeof r.model === "string" && MODEL_NAME.test(r.model)) out.model = r.model;
  if (isMode(r.mode)) out.mode = r.mode;
  if (typeof r.effort === "string" && (EFFORTS as readonly string[]).includes(r.effort)) out.effort = r.effort as Effort;
  return out;
}

/** Shift+Tab order, as in the CLI. */
export function nextMode(mode: Mode): Mode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}
