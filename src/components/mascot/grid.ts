// Mascot.png traced to its 17×14 grid (1 unit = 31px in the 960×720 source; origin at the tail's left edge, head's top).
// [col, row, width, height] in grid units.
export type Rect = readonly [number, number, number, number];

export const BLUE = "#4A7BD8";
export const EYE = "#000000";
export const STICKER = "#FFFFFF";

export type Pose = "stand" | "walk1" | "walk2" | "sit" | "raise" | "type1" | "type2" | "read" | "sitType1" | "sitType2" | "sitRead" | "hold";

const HEAD: Rect = [9, 0, 8, 5];
const SPIKES: Rect[] = [[5, 4, 1, 1], [7, 4, 1, 1]];
const BODY: Rect = [4, 5, 9, 6];
const TAIL: Rect[] = [[0, 5, 1, 2], [0, 7, 4, 2]];
export const EYE_RECT: Rect = [14, 1, 1, 1];

const ARM_REST: Rect[] = [[13, 6, 2, 1], [14, 7, 1, 1]];
const ARM_FORWARD: Rect[] = [[13, 6, 3, 1]];
/** Arm stretched out past the head, so a held prop has clear space around it. */
const ARM_OUT: Rect[] = [[13, 6, 4, 1], [17, 5, 1, 2]];
const ARM_UP: Rect[] = [[13, 6, 5, 1], [17, 3, 1, 3]];
const ARM_DOWN: Rect[] = [[13, 7, 2, 1]];

const LEGS_STAND: Rect[] = [[5, 11, 2, 3], [10, 11, 2, 3]];
const LEGS_W1: Rect[] = [[4, 11, 2, 3], [11, 11, 2, 2]];
const LEGS_W2: Rect[] = [[6, 11, 2, 2], [9, 11, 2, 3]];
/** Seated, side view: thighs forward along the seat (row 11), shins hanging down in front of it. */
const LEGS_SIT: Rect[] = [[5, 11, 3, 1], [7, 12, 1, 2], [10, 11, 3, 1], [12, 12, 1, 2]];

/** Where a held prop anchors (grid coords) for each pose. */
export const HAND: Record<Pose, readonly [number, number]> = {
  stand: [14.5, 8], walk1: [14.5, 8], walk2: [14.5, 8], sit: [14.5, 8],
  raise: [17.5, 3], type1: [15.5, 6.5], type2: [15.5, 7.5], read: [15.5, 6.5],
  sitType1: [15.5, 6.5], sitType2: [15.5, 7.5], sitRead: [15.5, 6.5],
  hold: [17.5, 5.2],
};

export function bodyRects(pose: Pose): Rect[] {
  const arm =
    pose === "raise" ? ARM_UP
    : pose === "hold" ? ARM_OUT
    : pose === "type1" || pose === "read" || pose === "sitType1" || pose === "sitRead" ? ARM_FORWARD
    : pose === "type2" || pose === "sitType2" ? ARM_DOWN
    : ARM_REST;
  const legs =
    pose === "walk1" ? LEGS_W1 : pose === "walk2" ? LEGS_W2 : pose.startsWith("sit") ? LEGS_SIT : LEGS_STAND;
  return [HEAD, ...SPIKES, BODY, ...TAIL, ...arm, ...legs];
}
