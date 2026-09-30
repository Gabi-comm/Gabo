import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findFiles } from "./files";
import { checkImages, userContent, MAX_IMAGES } from "./images";

describe("findFiles (@ mentions)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gabo-files-"));
  for (const f of ["src/app/page.tsx", "src/auth/login.ts", "README.md", "node_modules/x/index.js", ".git/HEAD", ".next/a.js", "docs/login-flow.md"]) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), "x");
  }

  it("matches by name first, then by path, with forward slashes", () => {
    expect(findFiles(root, "login")).toEqual(["src/auth/login.ts", "docs/login-flow.md"]);
    expect(findFiles(root, "app/pa")).toEqual(["src/app/page.tsx"]);
  });
  it("skips dependency and build folders", () => {
    expect(findFiles(root, "index")).toEqual([]);
    expect(findFiles(root, "HEAD")).toEqual([]);
  });
  it("lists top-level things for an empty query and caps results", () => {
    expect(findFiles(root, "").length).toBeGreaterThan(0);
    expect(findFiles(root, "", 2)).toHaveLength(2);
  });
  it("returns nothing for a missing folder", () => {
    expect(findFiles(path.join(root, "nope"), "a")).toEqual([]);
  });
});

describe("images in a message", () => {
  const png = { mediaType: "image/png", data: Buffer.from("fake-png").toString("base64") };

  it("builds image blocks before the text, like a pasted screenshot in the CLI", () => {
    expect(userContent("what is wrong here?", [png])).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: png.data } },
      { type: "text", text: "what is wrong here?" },
    ]);
  });
  it("accepts png/jpeg/gif/webp only, up to the size and count limits", () => {
    expect(checkImages([png])).toBeNull();
    expect(checkImages([{ mediaType: "image/svg+xml", data: "x" }])).toMatch(/PNG, JPEG, GIF or WebP/);
    expect(checkImages([{ mediaType: "image/png", data: "A".repeat(8_000_000) }])).toMatch(/too large/);
    expect(checkImages(Array(MAX_IMAGES + 1).fill(png))).toMatch(/at most/);
    expect(checkImages([{ mediaType: "image/png", data: "not base64!!" }])).toMatch(/base64/);
  });
});
