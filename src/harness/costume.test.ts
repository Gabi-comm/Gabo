import { describe, expect, it } from "vitest";
import {
  BACKDROP_THEMES, BODY_COLORS, PARTS, animKindFor, assembleProps, backdropFromText, costumeFromText, randomCostume, sanitizeCostume,
} from "./costume";

describe("costume parts", () => {
  it("has hats, faces, held items, clothes and capes, each with pixels and tags", () => {
    for (const slot of ["head", "face", "held", "front", "back"] as const) {
      expect(Object.keys(PARTS[slot]).length).toBeGreaterThan(0);
      for (const part of Object.values(PARTS[slot])) {
        expect(part.px.length).toBeGreaterThan(0);
        expect(part.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it("assembles a costume into mascot props and drops unknown parts", () => {
    const props = assembleProps({ head: "wizard", held: "staff", face: "nope" as never });
    expect(props.head).toEqual(PARTS.head.wizard.px);
    expect(props.held).toEqual(PARTS.held.staff.px);
    expect(props.face).toBeUndefined();
  });
});

describe("randomCostume", () => {
  it("only picks real parts and colors, and varies", () => {
    const seen = new Set<string>();
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 30; i++) {
      const c = randomCostume(rng);
      expect(sanitizeCostume(c)).toEqual(c);
      expect(c.held).toBeDefined();
      seen.add(JSON.stringify(c));
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe("costumeFromText (offline fallback for the generator)", () => {
  it("picks parts whose tags match the description", () => {
    expect(costumeFromText("a wise wizard with a magic staff and round glasses")).toMatchObject({ head: "wizard", held: "staff", face: "glasses" });
    expect(costumeFromText("pirate chef holding a coffee mug, green")).toMatchObject({ head: "chef", held: "mug", face: "eyepatch", body: "green" });
  });
  it("falls back to something wearable when nothing matches", () => {
    expect(sanitizeCostume(costumeFromText("zzz"))).toEqual(costumeFromText("zzz"));
  });
});

describe("sanitizeCostume", () => {
  it("keeps known slots and values only", () => {
    expect(sanitizeCostume({ head: "crown", held: "laser", body: "blue", evil: "x" })).toEqual({ head: "crown", body: "blue" });
    expect(sanitizeCostume(null)).toEqual({});
    expect(Object.keys(BODY_COLORS)).toContain("blue");
  });
});

describe("backdropFromText", () => {
  it("matches a role to a stage", () => {
    expect(backdropFromText("I teach calculus to first-year students")).toBe("classroom");
    expect(backdropFromText("Security auditor who hunts bugs in the test lab")).toBe("lab");
    expect(backdropFromText("Writes marketing copy and pitches investors on revenue")).toBe("market");
    expect(backdropFromText("zzz")).toBe("sunrise");
    expect(BACKDROP_THEMES).toContain("space");
  });
});

describe("animKindFor", () => {
  it("borrows a built-in agent's hover animation for the held item", () => {
    expect(animKindFor({ held: "gavel" })).toBe("judge");
    expect(animKindFor({ held: "sword" })).toBe("caveman");
    expect(animKindFor({})).toBe("believer");
  });
});
