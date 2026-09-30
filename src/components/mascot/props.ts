import type { AgentId } from "@/harness/agents";

// Muted prop palette: blue stays the mascot's, props never compete with it.
const GOLD = "#E3B341";
const GOLD_LIGHT = "#F2CB6B";
const GOLD_DARK = "#B8862B";
const WOOD = "#9A6A3F";
const WOOD_DARK = "#6E4A2A";
const STEEL = "#9AA0A6";
const INK = "#1F1F1D";
const RED = "#C4513F";
const PAPER = "#EDE6D6";
const FUR = "#B5703A";
const FUR_DARK = "#8A5429";
const SCREEN = "#2B4F91";
const SCREEN_TEXT = "#7AA2EA";
const GREEN = "#86C07F";
const LENS = "#CFE0FF";
const MESH = "#5F5D57";

/** [x, y, w, h, color]. */
export type Px = readonly [number, number, number, number, string];

export interface PropSet {
  /** Behind the body (grid coords): capes. */
  back?: Px[];
  /** In front of the body (grid coords): clothes. */
  front?: Px[];
  /** On the head (grid coords): hats, hair. Tilts on hover. */
  head?: Px[];
  /** Over the eye (grid coords): brows, glasses, sparkle. */
  face?: Px[];
  /** In the hand, relative to the hand anchor (0,0 = the hand). Animates on hover. */
  held?: Px[];
}

export type MascotKind = AgentId | "base" | "studying";

const OPEN_BOOK: Px[] = [
  [-0.4, -0.3, 4.6, 0.4, RED],
  [-0.2, -2.5, 2, 2.2, PAPER], [2, -2.5, 2, 2.2, PAPER], [1.8, -2.6, 0.4, 2.4, RED],
  [0.2, -2.1, 1.3, 0.25, INK], [0.2, -1.5, 1.3, 0.25, INK], [0.2, -0.9, 0.9, 0.25, INK],
  [2.4, -2.1, 1.3, 0.25, INK], [2.4, -1.5, 1.0, 0.25, INK],
];

export const PROPS: Record<MascotKind, PropSet> = {
  base: {},
  studying: { held: OPEN_BOOK },

  believer: {
    face: [[14.1, 1.05, 0.4, 0.4, "#FFFFFF"]],
    held: [
      [0, -7.2, 0.6, 8, WOOD],
      [0.6, -7.2, 4, 1.4, RED], [0.6, -5.8, 3, 1.2, RED], [0.6, -4.6, 1.8, 1, RED],
      [1.3, -6.8, 0.7, 0.7, GOLD],
    ],
  },
  skeptic: {
    face: [[13, 0.15, 1.2, 0.45, INK], [14.1, 0.45, 1.3, 0.45, INK]],
    held: [
      [-0.5, -4.4, 3, 0.6, STEEL], [-0.5, -2, 3, 0.6, STEEL], [-0.5, -4.4, 0.6, 3, STEEL], [1.9, -4.4, 0.6, 3, STEEL],
      [0.1, -3.8, 1.8, 1.8, LENS], [0.35, -3.55, 0.5, 0.5, "#FFFFFF"],
      [0.7, -1.4, 0.8, 2.2, WOOD],
    ],
  },
  investor: {
    head: [[9, -0.7, 8.5, 0.7, INK], [10.5, -4.3, 5.5, 3.6, INK], [10.5, -1.6, 5.5, 0.6, GOLD]],
    face: [
      [13.6, 0.55, 1.8, 0.25, GOLD], [13.6, 2.2, 1.8, 0.25, GOLD], [13.6, 0.55, 0.25, 1.9, GOLD], [15.15, 0.55, 0.25, 1.9, GOLD],
      [15.3, 2.4, 0.25, 1.6, GOLD],
    ],
    held: [[0, -2.2, 2.2, 2.2, GOLD], [0.25, -1.95, 1.7, 0.3, GOLD_LIGHT], [0.9, -1.9, 0.4, 1.6, GOLD_DARK]],
  },
  judge: {
    head: [
      [9, -1, 8, 1, PAPER],
      [7.9, -0.6, 1.3, 1.3, PAPER], [7.9, 0.8, 1.3, 1.3, PAPER], [7.9, 2.2, 1.3, 1.3, PAPER],
      [16.8, -0.6, 1.3, 1.3, PAPER], [16.8, 0.8, 1.3, 1.3, PAPER],
    ],
    face: [[13.3, 0.35, 2.2, 0.45, INK]],
    held: [[0.5, -3.6, 0.6, 4, WOOD], [-1.2, -5, 3.6, 1.6, WOOD_DARK], [-1.2, -4.4, 3.6, 0.3, GOLD]],
  },
  designer: {
    head: [[9.5, -0.9, 7.5, 0.9, RED], [10.5, -1.7, 5, 0.8, RED], [12.8, -2.2, 0.6, 0.5, RED]],
    held: [[0.4, -4, 0.5, 4.4, WOOD], [0.3, -4.6, 0.7, 0.6, STEEL], [0.2, -5.9, 0.9, 1.3, RED], [0.4, -6.3, 0.5, 0.4, RED]],
  },
  coder: {
    head: [
      [9.2, -0.9, 7.6, 0.6, INK],
      [8.3, 0.6, 1.1, 2.6, INK], [16.6, 0.6, 1.1, 2.6, INK], [8.5, 1.2, 0.7, 1.4, SCREEN], [16.8, 1.2, 0.7, 1.4, SCREEN],
    ],
    held: [
      [0, -3.3, 3.4, 3, INK], [0.3, -3, 2.8, 2.4, SCREEN],
      [0.6, -2.6, 1.6, 0.3, SCREEN_TEXT], [0.6, -2, 2, 0.3, SCREEN_TEXT], [0.6, -1.4, 1.2, 0.3, SCREEN_TEXT],
      [-0.3, -0.3, 4, 0.5, STEEL],
    ],
  },
  tester: {
    head: [[10, -1.8, 6.5, 1.8, GOLD], [9, -0.4, 8.5, 0.5, GOLD], [12.7, -1.8, 1, 1.8, GOLD_DARK]],
    held: [
      [0.4, -4, 0.5, 4.4, WOOD],
      [-0.7, -6.6, 2.6, 2, MESH],
      [-1.2, -7.1, 3.6, 0.5, PAPER], [-1.2, -4.6, 3.6, 0.5, PAPER], [-1.2, -7.1, 0.5, 3, PAPER], [1.9, -7.1, 0.5, 3, PAPER],
      [0.2, -6, 0.9, 0.7, GREEN],
    ],
  },
  researcher: {
    face: [
      [13.3, 0.5, 2.3, 0.35, INK], [13.3, 2.2, 2.3, 0.35, INK], [13.3, 0.5, 0.35, 2, INK], [15.25, 0.5, 0.35, 2, INK],
      [11.4, 1.2, 1.9, 0.3, INK],
    ],
    held: OPEN_BOOK,
  },
  tutor: {
    head: [[8.8, -1.2, 8.5, 0.6, INK], [10.8, -0.7, 4.5, 0.8, INK], [16.6, -1, 0.4, 2.2, GOLD], [16.4, 1.1, 0.8, 0.6, GOLD]],
    held: [[0.3, -6, 0.45, 6.4, WOOD], [0.2, -6.7, 0.65, 0.7, RED]],
  },
  caveman: {
    head: [
      [10.5, -0.9, 4.5, 0.7, PAPER],
      [10, -1.3, 0.8, 0.8, PAPER], [10, -0.5, 0.8, 0.8, PAPER], [14.7, -1.3, 0.8, 0.8, PAPER], [14.7, -0.5, 0.8, 0.8, PAPER],
    ],
    face: [[13, 0.25, 3, 0.55, INK]],
    front: [
      [4, 8.5, 9, 1.6, FUR], [5.5, 8.9, 0.8, 0.6, FUR_DARK], [9, 8.8, 0.8, 0.6, FUR_DARK], [11.2, 9.3, 0.8, 0.6, FUR_DARK],
      [4.5, 10.1, 1.2, 0.6, FUR], [7.5, 10.1, 1.2, 0.6, FUR], [10.5, 10.1, 1.2, 0.6, FUR],
    ],
    held: [[0.2, -3, 0.9, 3.6, WOOD], [-0.6, -5.8, 2.5, 2.9, "#7A5230"], [0, -5, 0.5, 0.5, "#5D3D22"], [1, -4, 0.5, 0.5, "#5D3D22"]],
  },
  planner: {
    held: [
      [0, -3.9, 3, 4.3, WOOD], [0.9, -4.3, 1.2, 0.6, STEEL], [0.3, -3.5, 2.4, 3.5, PAPER],
      [0.6, -3, 0.5, 0.5, GREEN], [1.3, -2.9, 1.1, 0.3, INK],
      [0.6, -2.1, 0.5, 0.5, GREEN], [1.3, -2, 1.1, 0.3, INK],
      [0.6, -1.2, 0.5, 0.5, STEEL], [1.3, -1.1, 0.9, 0.3, INK],
    ],
  },
  emperor: {
    head: [
      [9.8, -1.2, 6.8, 1.2, GOLD],
      [9.8, -2.6, 1, 1.4, GOLD], [12.7, -3, 1, 1.8, GOLD], [15.6, -2.6, 1, 1.4, GOLD],
      [12.95, -0.9, 0.5, 0.5, RED], [10.9, -0.8, 0.4, 0.4, SCREEN_TEXT], [15, -0.8, 0.4, 0.4, SCREEN_TEXT],
    ],
    back: [[2.8, 5, 1.4, 7, RED], [2.8, 5, 1.4, 0.6, PAPER], [2, 10, 1.2, 2.5, RED]],
    front: [[11.4, 5, 2.2, 0.8, PAPER], [11.9, 5.2, 0.3, 0.3, INK], [12.8, 5.25, 0.3, 0.3, INK]],
    held: [
      [-1, -3.6, 3.2, 0.4, GOLD_LIGHT], [-0.8, -3.2, 2.8, 1.4, GOLD], [0.35, -1.8, 0.5, 1.3, GOLD], [-0.3, -0.6, 1.8, 0.5, GOLD],
      [0.4, -2.9, 0.4, 0.4, RED],
    ],
  },
};
