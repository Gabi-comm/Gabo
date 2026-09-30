// Costumes for agents Gab creates: pick parts per slot (hat, face, held item, clothes, cape) and a body colour.
// Pure data + helpers, shared by the browser (drawing) and the server (validation, generation fallbacks).
import { PROPS, type Px, type PropSet } from "@/components/mascot/props";
import type { AgentId } from "./agents";

export type Slot = "head" | "face" | "held" | "front" | "back";
export interface Part { label: string; px: Px[]; tags: string[] }

const GOLD = "#E3B341";
const WOOD = "#9A6A3F";
const INK = "#1F1F1D";
const RED = "#C4513F";
const PAPER = "#EDE6D6";
const STEEL = "#9AA0A6";
const WHITE = "#FAF9F5";
const PURPLE = "#6D5B86";
const TEAL = "#4F9C98";

const from = (kind: AgentId, slot: Slot): Px[] => (PROPS[kind][slot === "front" ? "head" : slot] ?? []) as Px[];

export const PARTS: Record<Slot, Record<string, Part>> = {
  head: {
    tophat: { label: "Top hat", px: from("investor", "head"), tags: ["top hat", "rich", "banker", "investor", "gentleman", "magician", "fancy"] },
    wig: { label: "Judge's wig", px: from("judge", "head"), tags: ["wig", "judge", "lawyer", "court", "barrister"] },
    beret: { label: "Beret", px: from("designer", "head"), tags: ["beret", "artist", "painter", "french", "designer"] },
    headphones: { label: "Headphones", px: from("coder", "head"), tags: ["headphones", "music", "dj", "coder", "gamer", "listen"] },
    hardhat: { label: "Hard hat", px: from("tester", "head"), tags: ["hard hat", "helmet", "builder", "construction", "engineer", "safety"] },
    mortarboard: { label: "Graduation cap", px: from("tutor", "head"), tags: ["graduate", "graduation", "teacher", "professor", "scholar", "academic"] },
    crown: { label: "Crown", px: from("emperor", "head"), tags: ["crown", "king", "queen", "royal", "emperor", "prince", "princess"] },
    wizard: { label: "Wizard hat", px: [[10.5, -1, 5.5, 1, PURPLE], [11.5, -2.4, 3.5, 1.4, PURPLE], [12.4, -3.8, 1.8, 1.4, PURPLE], [13, -4.6, 0.8, 0.8, PURPLE], [9.4, -0.3, 7.6, 0.5, PURPLE], [12, -1.8, 0.5, 0.5, GOLD], [14.2, -1.2, 0.5, 0.5, GOLD]], tags: ["wizard", "witch", "mage", "magic", "sorcerer", "spell"] },
    chef: { label: "Chef's hat", px: [[10.5, -1.2, 5.5, 1.2, WHITE], [10, -3, 6.5, 1.9, WHITE], [11.2, -3.6, 1.6, 0.8, WHITE], [13.6, -3.6, 1.6, 0.8, WHITE]], tags: ["chef", "cook", "kitchen", "baker", "food", "recipe"] },
    cowboy: { label: "Cowboy hat", px: [[8.8, -0.5, 9, 0.6, "#8A5A34"], [10.8, -2.2, 5, 1.8, "#8A5A34"], [10.8, -1, 5, 0.4, "#5D3D22"]], tags: ["cowboy", "western", "ranch", "sheriff", "rodeo"] },
    beanie: { label: "Beanie", px: [[10, -1.4, 6.5, 1.4, TEAL], [10, -0.3, 6.5, 0.5, "#3B7874"], [12.8, -2.1, 0.9, 0.8, WHITE]], tags: ["beanie", "winter", "cozy", "casual", "hacker", "student"] },
    bone: { label: "Bone", px: from("caveman", "head").slice(0, 3), tags: ["bone", "caveman", "primitive", "stone age"] },
  },
  face: {
    sparkle: { label: "Sparkle eye", px: from("believer", "face"), tags: ["hopeful", "optimist", "sparkle", "happy", "cheerful", "believer"] },
    brows: { label: "Raised brows", px: from("skeptic", "face"), tags: ["skeptic", "suspicious", "doubt", "critic", "detective"] },
    monocle: { label: "Monocle", px: from("investor", "face"), tags: ["monocle", "rich", "posh", "fancy", "investor"] },
    stern: { label: "Stern brow", px: from("judge", "face"), tags: ["stern", "serious", "strict", "judge", "angry"] },
    glasses: { label: "Round glasses", px: from("researcher", "face"), tags: ["glasses", "spectacles", "round", "nerd", "reader", "research", "study"] },
    unibrow: { label: "Unibrow", px: from("caveman", "face"), tags: ["unibrow", "grumpy", "caveman", "tough"] },
    sunglasses: { label: "Sunglasses", px: [[13.2, 0.6, 2.8, 1.3, INK], [11.8, 0.9, 1.6, 0.3, INK]], tags: ["sunglasses", "cool", "shades", "summer", "spy", "agent"] },
    eyepatch: { label: "Eyepatch", px: [[13.5, 0.5, 1.9, 1.9, INK], [10.5, 0.2, 3.2, 0.3, INK]], tags: ["eyepatch", "pirate", "captain", "rogue"] },
  },
  held: {
    flag: { label: "Pennant", px: PROPS.believer.held!, tags: ["flag", "pennant", "cheer", "champion", "team", "advocate"] },
    magnifier: { label: "Magnifier", px: PROPS.skeptic.held!, tags: ["magnifier", "magnifying", "inspect", "detective", "investigate", "search"] },
    coin: { label: "Coin", px: PROPS.investor.held!, tags: ["coin", "money", "gold", "finance", "cash", "sales", "budget"] },
    gavel: { label: "Gavel", px: PROPS.judge.held!, tags: ["gavel", "judge", "verdict", "law", "decide", "auction"] },
    brush: { label: "Paintbrush", px: PROPS.designer.held!, tags: ["brush", "paint", "art", "design", "draw", "creative"] },
    laptop: { label: "Laptop", px: PROPS.coder.held!, tags: ["laptop", "computer", "code", "developer", "program", "hacker", "write"] },
    net: { label: "Bug net", px: PROPS.tester.held!, tags: ["net", "bug", "catch", "test", "qa"] },
    book: { label: "Book", px: PROPS.researcher.held!, tags: ["book", "read", "study", "research", "learn", "library", "story"] },
    pointer: { label: "Pointer", px: PROPS.tutor.held!, tags: ["pointer", "teach", "lecture", "present", "explain"] },
    club: { label: "Club", px: PROPS.caveman.held!, tags: ["club", "caveman", "smash", "brute"] },
    clipboard: { label: "Clipboard", px: PROPS.planner.held!, tags: ["clipboard", "plan", "checklist", "manage", "organize", "schedule"] },
    chalice: { label: "Chalice", px: PROPS.emperor.held!, tags: ["chalice", "cup", "toast", "victory", "trophy", "celebrate"] },
    wrench: { label: "Wrench", px: [[0.3, -3.2, 0.6, 3.5, STEEL], [-0.5, -4.4, 2.2, 1.4, STEEL], [0.25, -4.4, 0.7, 0.8, "#1F1F1D"]], tags: ["wrench", "fix", "repair", "mechanic", "tools", "devops", "ops"] },
    sword: { label: "Sword", px: [[0.35, -6.2, 0.6, 5.2, "#CFD6DE"], [-0.6, -1.2, 2.5, 0.5, GOLD], [0.35, -0.7, 0.6, 1.2, WOOD]], tags: ["sword", "knight", "warrior", "fight", "battle", "hero", "security", "defend"] },
    flask: { label: "Flask", px: [[0.4, -3.6, 1, 1.2, "#CFE0FF"], [-0.2, -2.4, 2.2, 2.2, "#CFE0FF"], [0, -1.4, 1.8, 1.1, "#86C07F"]], tags: ["flask", "potion", "science", "chemistry", "experiment", "lab"] },
    microphone: { label: "Microphone", px: [[0.4, -1.6, 0.6, 2, INK], [0.1, -2.8, 1.2, 1.3, STEEL]], tags: ["microphone", "mic", "sing", "podcast", "host", "speak", "interview"] },
    mug: { label: "Coffee mug", px: [[0, -1.8, 1.8, 2, WHITE], [1.8, -1.4, 0.6, 1.1, WHITE], [0.2, -1.6, 1.4, 0.4, "#6E4A2A"]], tags: ["mug", "coffee", "tea", "cozy", "morning", "barista"] },
    staff: { label: "Staff", px: [[0.3, -6.6, 0.55, 7, WOOD], [0.05, -7.6, 1.05, 1.05, "#7AA2EA"]], tags: ["staff", "wand", "magic", "wizard", "sage", "elder"] },
  },
  front: {
    fur: { label: "Fur tunic", px: (PROPS.caveman.head ?? []).slice(3) as Px[], tags: ["fur", "tunic", "caveman", "wild", "hunter"] },
    collar: { label: "Ermine collar", px: PROPS.emperor.front ?? [], tags: ["collar", "royal", "ermine", "noble"] },
    scarf: { label: "Scarf", px: [[9, 5, 4.2, 1, RED], [11.6, 6, 1, 2.4, RED]], tags: ["scarf", "winter", "cozy", "traveller", "adventurer"] },
    tie: { label: "Tie", px: [[11.2, 5, 1, 0.6, "#2B4F91"], [11.3, 5.6, 0.8, 2.6, "#2B4F91"]], tags: ["tie", "office", "business", "manager", "suit", "professional", "corporate"] },
    labcoat: { label: "Lab coat", px: [[4.2, 5.2, 8.6, 5.6, WHITE], [8.2, 5.2, 0.4, 5.6, "#C9C6BD"]], tags: ["lab coat", "doctor", "scientist", "medical", "nurse", "chemist"] },
  },
  back: {
    cape: { label: "Cape", px: PROPS.emperor.back ?? [], tags: ["cape", "hero", "super", "royal", "vampire"] },
    backpack: { label: "Backpack", px: [[2.6, 5.4, 1.8, 4.5, "#5A7A4A"], [2.4, 6.4, 0.6, 2.4, "#4A6A3A"]], tags: ["backpack", "student", "explorer", "hiker", "travel"] },
    wings: { label: "Wings", px: [[2.5, 3.2, 1.8, 1, WHITE], [1.6, 4.2, 2.7, 1, WHITE], [1, 5.2, 3.3, 1.2, WHITE]], tags: ["wings", "angel", "fairy", "fly", "bird", "free"] },
  },
};

export const BODY_COLORS: Record<string, { label: string; fill: string }> = {
  blue: { label: "Gabo blue", fill: "#4A7BD8" },
  teal: { label: "Teal", fill: "#3F9A93" },
  green: { label: "Green", fill: "#5A9E55" },
  orange: { label: "Orange", fill: "#D9803F" },
  pink: { label: "Pink", fill: "#D46A93" },
  violet: { label: "Violet", fill: "#8A6BD1" },
  slate: { label: "Slate", fill: "#6F7A8C" },
};

export interface Costume { body?: string; head?: string; face?: string; held?: string; front?: string; back?: string }

export const SLOTS: Slot[] = ["head", "face", "held", "front", "back"];

export function sanitizeCostume(raw: unknown): Costume {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Costume = {};
  if (typeof r.body === "string" && BODY_COLORS[r.body]) out.body = r.body;
  for (const slot of SLOTS) {
    const v = r[slot];
    if (typeof v === "string" && PARTS[slot][v]) out[slot] = v;
  }
  return out;
}

/** Costume → mascot props (front clothes are drawn with the head layer, in front of the body). */
export function assembleProps(c: Costume): PropSet & { face?: Px[] } {
  const clean = sanitizeCostume(c);
  const head = [...(clean.head ? PARTS.head[clean.head].px : []), ...(clean.front ? PARTS.front[clean.front].px : [])];
  return {
    ...(head.length ? { head } : {}),
    ...(clean.face ? { face: PARTS.face[clean.face].px } : {}),
    ...(clean.held ? { held: PARTS.held[clean.held].px } : {}),
    ...(clean.back ? { back: PARTS.back[clean.back].px } : {}),
  };
}

export function bodyFill(c: Costume): string | undefined {
  return c.body ? BODY_COLORS[c.body]?.fill : undefined;
}

/** A random but wearable costume: always a held item, most slots filled, sometimes a new colour. */
export function randomCostume(rng: () => number = Math.random): Costume {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length) % xs.length];
  const maybe = (slot: Slot, chance: number) => (rng() < chance ? pick(Object.keys(PARTS[slot])) : undefined);
  const c: Costume = {
    body: rng() < 0.55 ? "blue" : pick(Object.keys(BODY_COLORS)),
    head: maybe("head", 0.8),
    face: maybe("face", 0.5),
    held: pick(Object.keys(PARTS.held)),
    front: maybe("front", 0.4),
    back: maybe("back", 0.25),
  };
  return sanitizeCostume(c);
}

function score(text: string, tags: string[]): number {
  return tags.reduce((n, t) => n + (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text) ? 1 : 0), 0);
}

function best<T extends string>(text: string, options: Record<T, { tags: string[] }>): T | undefined {
  let top: T | undefined;
  let topScore = 0;
  for (const [id, o] of Object.entries(options) as [T, { tags: string[] }][]) {
    const s = score(text, o.tags);
    if (s > topScore) { top = id; topScore = s; }
  }
  return top;
}

/** Offline stand-in for the AI generator: tag matching per slot. */
export function costumeFromText(text: string): Costume {
  const colorTags = Object.fromEntries(Object.keys(BODY_COLORS).map((k) => [k, { tags: [k] }])) as Record<string, { tags: string[] }>;
  const c: Costume = {
    body: best(text, colorTags),
    head: best(text, PARTS.head),
    face: best(text, PARTS.face),
    held: best(text, PARTS.held) ?? "flag",
    front: best(text, PARTS.front),
    back: best(text, PARTS.back),
  };
  return sanitizeCostume(c);
}

export const BACKDROP_THEMES = [
  "sunrise", "noir", "market", "courtroom", "studio", "terminal", "lab", "library", "classroom", "cave", "board", "throne",
  "garden", "space", "ocean", "forest", "stage",
] as const;
export type BackdropTheme = (typeof BACKDROP_THEMES)[number];

export const BACKDROP_TAGS: Record<BackdropTheme, string[]> = {
  sunrise: ["motivat", "hope", "believ", "optimis", "coach", "inspir", "encourag"],
  noir: ["skeptic", "detective", "investigat", "doubt", "critic", "risk", "crime", "mystery", "fraud"],
  market: ["money", "invest", "revenue", "financ", "stock", "market", "sales", "pitch", "business", "startup", "profit"],
  courtroom: ["judge", "law", "legal", "verdict", "contract", "court", "complian", "policy", "ethic"],
  studio: ["design", "art", "paint", "ui", "ux", "brand", "visual", "creativ", "illustrat", "photo"],
  terminal: ["code", "program", "develop", "software", "engineer", "debug", "api", "deploy", "script", "devops"],
  lab: ["test", "bug", "qa", "lab", "scien", "experiment", "security", "audit", "chemi", "biolog"],
  library: ["research", "source", "read", "book", "paper", "cite", "histor", "literatur", "archiv"],
  classroom: ["teach", "tutor", "student", "class", "lesson", "school", "exam", "course", "math", "calculus", "quiz"],
  cave: ["brief", "terse", "primitive", "caveman", "grunt", "surviv", "minimal"],
  board: ["plan", "project", "schedul", "task", "roadmap", "manag", "organi", "sprint", "deadline"],
  throne: ["lead", "king", "emperor", "command", "strateg", "vision", "crown", "empire"],
  garden: ["garden", "plant", "nature", "health", "wellness", "food", "cook", "nutrition", "recipe"],
  space: ["space", "astronom", "physics", "star", "rocket", "cosmos", "planet"],
  ocean: ["ocean", "sea", "travel", "beach", "sail", "marine", "fish", "trip"],
  forest: ["forest", "camp", "hike", "ecolog", "environment", "climate", "outdoor"],
  stage: ["music", "perform", "speak", "comed", "stori", "podcast", "presenter", "sing", "writer", "copy"],
};

/** Offline stand-in for the background generator: the stage whose words the role uses most. */
export function backdropFromText(text: string): BackdropTheme {
  let top: BackdropTheme = "sunrise";
  let topScore = 0;
  for (const theme of BACKDROP_THEMES) {
    const s = BACKDROP_TAGS[theme].reduce((n, t) => n + (new RegExp(`\\b${t}`, "i").test(text) ? 1 : 0), 0);
    if (s > topScore) { top = theme; topScore = s; }
  }
  return top;
}

const ANIM_BY_HELD: Record<string, AgentId> = {
  flag: "believer", magnifier: "skeptic", coin: "investor", gavel: "judge", brush: "designer", laptop: "coder",
  net: "tester", book: "researcher", pointer: "tutor", club: "caveman", clipboard: "planner", chalice: "emperor",
  wrench: "judge", sword: "caveman", flask: "investor", microphone: "tutor", mug: "coder", staff: "tutor",
};

/** Custom mascots borrow the hover/loop animation of the built-in agent holding a similar item. */
export function animKindFor(c: Costume): AgentId {
  return (c.held && ANIM_BY_HELD[c.held]) || "believer";
}
