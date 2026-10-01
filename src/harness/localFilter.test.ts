import { describe, expect, it } from "vitest";
import { makeHeaderFilter } from "./localFilter";
import type { UiEvent } from "./events";

const text = (delta: string): UiEvent => ({ type: "text", delta, agent: null });
const run = (deltas: string[], f = makeHeaderFilter()) => deltas.flatMap((d) => f(text(d))).map((e) => (e as { delta: string }).delta).join("");

describe("local reply header filter", () => {
  it("drops a leaked 'assistant' header, even split across chunks", () => {
    expect(run(["assistant\n\nHello, Gab."])).toBe("Hello, Gab.");
    expect(run(["assi", "stant", "\n", "\nHi"])).toBe("Hi");
  });
  it("keeps normal replies, including ones that merely start with the word", () => {
    expect(run(["Hello", " there"])).toBe("Hello there");
    expect(run(["assistants can help"])).toBe("assistants can help");
  });
  it("checks again after a tool call", () => {
    const f = makeHeaderFilter();
    run(["Reading."], f);
    f({ type: "tool_start", id: "t", name: "Read", summary: "Read(a)", agent: null } as UiEvent);
    expect(run(["assistant\nDone."], f)).toBe("Done.");
  });
});
