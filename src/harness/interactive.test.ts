import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { createMapper } from "./events";
import { makeCanUseTool } from "./runner";
import { PermissionBroker } from "./permissions";

const ws = path.resolve("/work/proj");
const signal = new AbortController().signal;

describe("TodoWrite and edits in the transcript", () => {
  it("carries the todo list", () => {
    const todos = [{ content: "Write tests", status: "completed", activeForm: "Writing tests" }, { content: "Ship", status: "in_progress", activeForm: "Shipping" }];
    const [e] = createMapper()({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "t", name: "TodoWrite", input: { todos } },
    ] } } as never);
    expect(e).toMatchObject({ type: "tool_start", name: "TodoWrite", summary: "Update Todos", todos });
  });

  it("carries a small diff for Edit and Write", () => {
    const map = createMapper();
    const [edit] = map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "e", name: "Edit", input: { file_path: "a.ts", old_string: "let x = 1", new_string: "const x = 1" } },
    ] } } as never);
    expect(edit).toMatchObject({ diff: { path: "a.ts", removed: "let x = 1", added: "const x = 1" } });
    const [write] = map({ type: "assistant", parent_tool_use_id: null, message: { content: [
      { type: "tool_use", id: "w", name: "Write", input: { file_path: "b.md", content: "x".repeat(5000) } },
    ] } } as never);
    expect((write as { diff: { added: string } }).diff.added.length).toBeLessThan(2100);
  });
});

describe("AskUserQuestion", () => {
  it("asks Gab and hands the picked labels back to Claude as answers", async () => {
    const broker = new PermissionBroker();
    const answers = new Map<string, Record<string, string>>();
    const onAsk = vi.fn((req: { requestId: string }) => queueMicrotask(() => {
      answers.set(req.requestId, { "Which database?": "Postgres" });
      broker.resolve(req.requestId, "allow");
    }));
    const can = makeCanUseTool({ runId: "r", workspace: ws, broker, onAsk, sessionRules: new Set(), answers });
    const questions = [{ question: "Which database?", header: "DB", multiSelect: false, options: [{ label: "Postgres", description: "" }, { label: "SQLite", description: "" }] }];
    const res = await can("AskUserQuestion", { questions }, { signal } as never);
    expect(onAsk.mock.calls[0][0]).toMatchObject({ kind: "question", questions });
    expect(res).toEqual({ behavior: "allow", updatedInput: { questions, answers: { "Which database?": "Postgres" } } });
  });

  it("is never auto-approved by a 'yes for this chat' rule", async () => {
    const broker = new PermissionBroker();
    const onAsk = vi.fn((req: { requestId: string }) => queueMicrotask(() => broker.resolve(req.requestId, "deny")));
    const can = makeCanUseTool({ runId: "r", workspace: ws, broker, onAsk, sessionRules: new Set(["AskUserQuestion"]), answers: new Map() });
    await can("AskUserQuestion", { questions: [] }, { signal } as never);
    expect(onAsk).toHaveBeenCalledTimes(1);
  });
});

describe("ExitPlanMode", () => {
  const run = async (decision: "allow" | "allow_session" | "deny") => {
    const broker = new PermissionBroker();
    const onAsk = vi.fn((req: { requestId: string }) => queueMicrotask(() => broker.resolve(req.requestId, decision)));
    const can = makeCanUseTool({ runId: "r", workspace: ws, broker, onAsk, sessionRules: new Set(), answers: new Map() });
    const res = await can("ExitPlanMode", { plan: "1. Add tests\n2. Fix bug" }, { signal } as never);
    return { res, ask: onAsk.mock.calls[0][0] };
  };
  it("shows the plan for approval", async () => {
    const { ask } = await run("allow");
    expect(ask).toMatchObject({ kind: "plan", plan: "1. Add tests\n2. Fix bug" });
  });
  it("'yes, auto-accept edits' switches the session to acceptEdits like the CLI", async () => {
    const { res } = await run("allow_session");
    expect(res).toMatchObject({ behavior: "allow", updatedPermissions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }] });
  });
  it("'yes, approve edits manually' goes back to default", async () => {
    const { res } = await run("allow");
    expect(res).toMatchObject({ behavior: "allow", updatedPermissions: [{ type: "setMode", mode: "default", destination: "session" }] });
  });
  it("'no' keeps planning", async () => {
    const { res } = await run("deny");
    expect(res).toMatchObject({ behavior: "deny" });
  });
});
