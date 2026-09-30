"use client";

import { Backdrop, FLOOR_Y, backdropFor } from "./Backdrop";
import { FEET_AT, Mascot, mascotHeight } from "./Mascot";
import type { BackdropTheme, Costume } from "@/harness/costume";
import type { AgentId } from "@/harness/agents";

/** An agent standing on its own stage: a built-in agent (by id) or a custom one (costume + chosen backdrop). */
export function AgentStage({ agent, costume, theme, label, mascotWidth = 54, className, animate }: {
  agent?: AgentId;
  costume?: Costume;
  theme?: BackdropTheme;
  label: string;
  /** Mascot width in the stage's 160-unit space. */
  mascotWidth?: number;
  className?: string;
  animate?: "loop" | "hover";
}) {
  const stageTheme = theme ?? (agent ? backdropFor(agent) : "sunrise");
  const h = mascotHeight(mascotWidth);
  return (
    <Backdrop theme={stageTheme} label={label} className={className}>
      <ellipse cx={80} cy={FLOOR_Y + 1.5} rx={mascotWidth * 0.34} ry={2} fill="#000" opacity="0.28" />
      <Mascot
        kind={agent}
        costume={costume}
        size={mascotWidth}
        x={80 - mascotWidth * 0.45}
        y={FLOOR_Y + 1 - h * FEET_AT}
        animate={animate ?? "loop"}
        title={label}
      />
    </Backdrop>
  );
}
