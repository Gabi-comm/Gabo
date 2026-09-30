import { describe, expect, it } from "vitest";
import path from "node:path";
import { createMapper } from "./events";
import { buildOptions } from "./runner";
import { loadSpec } from "./spec";
import { parseRunPrefs, nextMode } from "./controls";

const spec = loadSpec(path.resolve(__dirname, "../.."));

describe("CLI messages the app shows", () => {
  it("local command output (/context, /cost, …) becomes a notice", () => {
    expect(createMapper()({ type: "system", subtype: "local_command_output", content: "Context: 12k / 200k" } as never))
      .toEqual([{ type: "notice", text: "Context: 12k / 200k" }]);
  });
  it("a compaction is announced", () => {
    expect(createMapper()({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 50000 } } as never))
      .toEqual([{ type: "notice", text: "Conversation compacted (manual, was 50,000 tokens)." }]);
  });
  it("a permission-mode change (e.g. after plan approval) is reported", () => {
    expect(createMapper()({ type: "system", subtype: "status", status: null, permissionMode: "acceptEdits" } as never))
      .toEqual([{ type: "mode", mode: "acceptEdits" }]);
  });
});

describe("run preferences", () => {
  it("passes model, permission mode and effort to the run", () => {
    const opts = buildOptions({ room: "home", workspace: path.resolve("/w"), spec, prefs: { model: "opus", mode: "plan", effort: "high" } });
    expect(opts.model).toBe("opus");
    expect(opts.permissionMode).toBe("plan");
    expect(opts.effort).toBe("high");
  });
  it("defaults to the CLI's own choices when nothing is picked", () => {
    const opts = buildOptions({ room: "home", workspace: path.resolve("/w"), spec });
    expect(opts.model).toBeUndefined();
    expect(opts.effort).toBeUndefined();
    expect(opts.permissionMode).toBe("default");
  });
  it("accepts only known modes and efforts and sane model names", () => {
    expect(parseRunPrefs({ model: "claude-opus-5", mode: "acceptEdits", effort: "max" })).toEqual({ model: "claude-opus-5", mode: "acceptEdits", effort: "max" });
    expect(parseRunPrefs({ mode: "bypassPermissions" })).toEqual({});
    expect(parseRunPrefs({ model: "opus; rm -rf /", effort: "turbo" })).toEqual({});
    expect(parseRunPrefs(undefined)).toEqual({});
  });
  it("Shift+Tab cycles modes the way the CLI does", () => {
    expect(nextMode("default")).toBe("acceptEdits");
    expect(nextMode("acceptEdits")).toBe("plan");
    expect(nextMode("plan")).toBe("auto");
    expect(nextMode("auto")).toBe("default");
  });
});
