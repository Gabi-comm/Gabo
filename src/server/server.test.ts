import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rejectForeign } from "./guard";
import { SessionStore } from "./sessions";
import { validateWorkspace } from "./config";

const req = (headers: Record<string, string>) => new Request("http://127.0.0.1:3217/api/run", { method: "POST", headers });

describe("rejectForeign", () => {
  it("allows same-origin localhost requests", () => {
    expect(rejectForeign(req({ host: "127.0.0.1:3217", origin: "http://127.0.0.1:3217" }))).toBeNull();
    expect(rejectForeign(req({ host: "localhost:3217" }))).toBeNull();
  });
  it("blocks other origins and rebinding hosts with 403", () => {
    expect(rejectForeign(req({ host: "127.0.0.1:3217", origin: "https://evil.example" }))?.status).toBe(403);
    expect(rejectForeign(req({ host: "evil.example:3217" }))?.status).toBe(403);
    expect(rejectForeign(req({ host: "localhost:3217", origin: "http://127.0.0.1:9999" }))?.status).toBe(403);
  });
});

describe("SessionStore", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "gabo-")); });

  it("upserts, lists newest first, and survives a reload", () => {
    const a = new SessionStore(dir);
    a.upsert({ id: "c1", room: "home", title: "first", sdkSessionId: undefined });
    a.upsert({ id: "c2", room: "arena", title: "second" });
    a.upsert({ id: "c1", sdkSessionId: "s-1" });
    const b = new SessionStore(dir);
    expect(b.list().map((s) => s.id)).toEqual(["c1", "c2"]);
    expect(b.get("c1")).toMatchObject({ room: "home", title: "first", sdkSessionId: "s-1" });
  });

  it("recovers from a corrupt file instead of crashing", () => {
    fs.writeFileSync(path.join(dir, "sessions.json"), "{not json");
    expect(new SessionStore(dir).list()).toEqual([]);
  });
});

describe("validateWorkspace", () => {
  it("accepts an existing absolute directory", () => {
    expect(validateWorkspace(os.tmpdir())).toEqual({ ok: true, path: path.resolve(os.tmpdir()) });
  });
  it("rejects relative, missing and file paths", () => {
    expect(validateWorkspace("relative/dir").ok).toBe(false);
    expect(validateWorkspace(path.join(os.tmpdir(), "definitely-missing-gabo")).ok).toBe(false);
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gabo-")), "f.txt");
    fs.writeFileSync(f, "x");
    expect(validateWorkspace(f).ok).toBe(false);
    expect(validateWorkspace("").ok).toBe(false);
  });
});
