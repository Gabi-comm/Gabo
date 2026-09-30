import type { AgentId } from "@/harness/agents";

// Muted prop palette: blue stays the mascot's, props never compete with it.
const GOLD = "#E3B341";
const WOOD = "#9A6A3F";
const STEEL = "#9AA0A6";
const INK = "#1F1F1D";
const RED = "#C4513F";
const PAPER = "#EDE6D6";
const FUR = "#B5703A";

/** [x, y, w, h, color]. `head` draws in front of the body, `back` behind it (grid coords); `held` is relative to the hand. */
export type Px = readonly [number, number, number, number, string];

export interface PropSet {
  back?: Px[];
  head?: Px[];
  held?: Px[];
}

export type MascotKind = AgentId | "base" | "studying";

export const PROPS: Record<MascotKind, PropSet> = {
  base: {},
  studying: {
    held: [[0, -1.6, 2.4, 1.8, RED], [0.2, -1.4, 2, 1.4, PAPER], [1.15, -1.4, 0.1, 1.4, INK]],
  },
  believer: {
    held: [[0, -5, 0.4, 5.6, WOOD], [0.4, -5, 2.4, 0.8, RED], [0.4, -4.2, 1.6, 0.7, RED], [0.4, -3.5, 0.8, 0.5, RED]],
  },
  skeptic: {
    head: [[13.4, 0.35, 1.8, 0.35, INK]],
    held: [
      [-0.3, -2.4, 2.2, 0.4, STEEL], [-0.3, -0.8, 2.2, 0.4, STEEL], [-0.3, -2.4, 0.4, 2, STEEL], [1.5, -2.4, 0.4, 2, STEEL],
      [0.6, -0.4, 0.5, 1.2, WOOD],
    ],
  },
  investor: {
    head: [[9.5, -0.6, 7, 0.6, INK], [10.5, -3, 5, 2.4, INK], [10.5, -1.2, 5, 0.45, GOLD]],
    held: [[0, -1.3, 1.3, 1.3, GOLD], [0.4, -0.95, 0.5, 0.6, "#C99A2E"]],
  },
  judge: {
    head: [[9, -0.8, 8, 0.8, PAPER], [8.2, -0.4, 0.8, 3.4, PAPER], [17, -0.4, 0.8, 3.4, PAPER]],
    held: [[0.2, -2.2, 0.45, 2.6, WOOD], [-0.7, -3.2, 2.3, 1.1, "#6E4A2A"]],
  },
  designer: {
    head: [[10, -0.7, 6.5, 0.7, RED], [11, -1.3, 4, 0.6, RED], [12.8, -1.8, 0.5, 0.5, RED]],
    held: [[0.2, -2.6, 0.4, 2.8, WOOD], [0.05, -3.4, 0.7, 0.8, GOLD]],
  },
  coder: {
    head: [[9.4, -0.7, 7.2, 0.5, INK], [8.5, 0.8, 0.9, 2.2, INK], [17, 0.8, 0.9, 2.2, INK]],
    held: [[0, -2, 2.8, 1.8, INK], [0.2, -1.8, 2.4, 1.4, "#2B4F91"], [-0.2, -0.2, 3.2, 0.35, STEEL]],
  },
  tester: {
    head: [[10, -1.3, 6, 1.3, GOLD], [9.4, -0.3, 7.2, 0.4, GOLD]],
    held: [
      [0.2, -3, 0.4, 3.3, WOOD],
      [-0.8, -5, 2.2, 0.3, PAPER], [-0.8, -3.3, 2.2, 0.3, PAPER], [-0.8, -5, 0.3, 2, PAPER], [1.1, -5, 0.3, 2, PAPER],
    ],
  },
  researcher: {
    head: [[13.5, 0.65, 1.5, 0.25, INK], [13.5, 2.05, 1.5, 0.25, INK], [13.5, 0.65, 0.25, 1.6, INK], [14.75, 0.65, 0.25, 1.6, INK], [12.2, 1.1, 1.3, 0.2, INK]],
    held: [[0, -1.6, 2.4, 1.8, RED], [0.2, -1.4, 2, 1.4, PAPER], [1.15, -1.4, 0.1, 1.4, INK]],
  },
  tutor: {
    head: [[9.5, -0.9, 7, 0.5, INK], [11, -0.45, 4, 0.5, INK], [16.1, -0.7, 0.3, 1.6, GOLD]],
    held: [[0.2, -3.6, 0.35, 3.9, WOOD], [0.15, -3.9, 0.45, 0.4, PAPER]],
  },
  caveman: {
    head: [
      [11, -0.6, 3.6, 0.5, PAPER], [10.6, -0.95, 0.6, 1.2, PAPER], [14.4, -0.95, 0.6, 1.2, PAPER],
      [4, 9, 9, 1.2, FUR], [5, 10.2, 1, 0.5, FUR], [8, 10.2, 1, 0.5, FUR], [11, 10.2, 1, 0.5, FUR],
    ],
    held: [[0.1, -2.8, 0.8, 3.1, WOOD], [-0.25, -3.6, 1.5, 1.1, WOOD]],
  },
  planner: {
    held: [[0, -2.3, 2, 2.6, WOOD], [0.25, -2, 1.5, 2.1, PAPER], [0.45, -1.6, 1.1, 0.2, INK], [0.45, -1.1, 1.1, 0.2, INK], [0.45, -0.6, 0.7, 0.2, INK]],
  },
  emperor: {
    head: [[10, -0.9, 6, 0.9, GOLD], [10, -1.8, 0.8, 0.9, GOLD], [12.6, -1.8, 0.8, 0.9, GOLD], [15.2, -1.8, 0.8, 0.9, GOLD], [12.8, -0.65, 0.4, 0.4, RED]],
    back: [[3.2, 5, 1, 6.5, RED], [2.4, 9.5, 1, 2, RED]],
    held: [[-0.5, -2.6, 2.2, 1.2, GOLD], [0.35, -1.4, 0.5, 1, GOLD], [-0.1, -0.45, 1.4, 0.45, GOLD]],
  },
};
