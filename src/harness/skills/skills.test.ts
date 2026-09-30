import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { fetchCatalog, listLocal } from "./catalog";
import { computeMissing, parseScoutReply } from "./scout";
import { installSkills } from "./install";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gabo-skills-"));

function fakeFetch(routes: Record<string, string | number>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return new Response("nope", { status: 404 });
    return typeof hit[1] === "number" ? new Response("err", { status: hit[1] }) : new Response(hit[1]);
  }) as typeof fetch;
}

const TREE = JSON.stringify({
  tree: [
    { path: "skills/web-design-guidelines", type: "tree" },
    { path: "skills/web-design-guidelines/SKILL.md", type: "blob" },
    { path: "skills/web-design-guidelines/refs/a.md", type: "blob" },
    { path: "skills/web-design-guidelines.zip", type: "blob" },
    { path: "skills/react-best-practices/SKILL.md", type: "blob" },
    { path: "README.md", type: "blob" },
  ],
});
const WDG = "---\nname: web-design-guidelines\ndescription: Review UI code for Web Interface Guidelines compliance.\n---\n# body";
const RBP = "---\nname: vercel-react-best-practices\ndescription: \"React perf rules.\"\n---\n";

describe("parseFrontmatter", () => {
  it("reads name and one-line description, quoted or not, CRLF or not", () => {
    expect(parseFrontmatter(WDG)).toEqual({ name: "web-design-guidelines", description: "Review UI code for Web Interface Guidelines compliance." });
    expect(parseFrontmatter(RBP.replace(/\n/g, "\r\n"))).toEqual({ name: "vercel-react-best-practices", description: "React perf rules." });
    expect(parseFrontmatter("no frontmatter")).toBeNull();
  });
});

describe("fetchCatalog", () => {
  it("lists each skill folder once with its frontmatter, skipping zips", async () => {
    const f = fakeFetch({ "git/trees": TREE, "web-design-guidelines/SKILL.md": WDG, "react-best-practices/SKILL.md": RBP });
    const cat = await fetchCatalog({ fetchImpl: f, cacheFile: path.join(tmp(), "c.json") });
    expect(cat.map((s) => [s.name, s.dir])).toEqual([
      ["web-design-guidelines", "web-design-guidelines"],
      ["vercel-react-best-practices", "react-best-practices"],
    ]);
  });

  it("serves the cache when GitHub is unreachable, and throws with no cache", async () => {
    const cacheFile = path.join(tmp(), "c.json");
    await fetchCatalog({ fetchImpl: fakeFetch({ "git/trees": TREE, "web-design-guidelines/SKILL.md": WDG, "react-best-practices/SKILL.md": RBP }), cacheFile });
    const down = fakeFetch({ "git/trees": 503 });
    expect(await fetchCatalog({ fetchImpl: down, cacheFile, maxAgeMs: 0 })).toHaveLength(2);
    await expect(fetchCatalog({ fetchImpl: down, cacheFile: path.join(tmp(), "none.json") })).rejects.toThrow();
  });
});

describe("listLocal", () => {
  it("reads installed skills from several roots and ignores folders without SKILL.md", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "a"));
    fs.writeFileSync(path.join(root, "a", "SKILL.md"), "---\nname: alpha\ndescription: A.\n---\n");
    fs.mkdirSync(path.join(root, "empty"));
    expect(listLocal([root, path.join(root, "missing")])).toEqual([{ name: "alpha", description: "A.", dir: path.join(root, "a") }]);
  });
});

describe("scout reply", () => {
  const pool = ["web-design-guidelines", "vercel-react-best-practices"];
  it("keeps only known agents and known skills, one line per roster agent", () => {
    const reply = 'Sure!\n{"lines":[{"agent":"designer","skills":["web-design-guidelines","made-up"],"why":"design rules"},{"agent":"ghost","skills":["x"],"why":""}]}';
    expect(parseScoutReply(reply, ["designer", "caveman"], pool)).toEqual([
      { agent: "designer", skills: ["web-design-guidelines"], why: "design rules" },
      { agent: "caveman", skills: [], why: "" },
    ]);
  });
  it("falls back to none for everyone on junk", () => {
    expect(parseScoutReply("no json here", ["tester"], pool)).toEqual([{ agent: "tester", skills: [], why: "" }]);
  });
  it("recommends catalog skills that aren't installed, grouped by agent", () => {
    const lines = [
      { agent: "designer" as const, skills: ["web-design-guidelines"], why: "" },
      { agent: "tester" as const, skills: ["web-design-guidelines", "vercel-react-best-practices"], why: "" },
    ];
    const catalog = [
      { name: "web-design-guidelines", dir: "web-design-guidelines", description: "d1" },
      { name: "vercel-react-best-practices", dir: "react-best-practices", description: "d2" },
    ];
    expect(computeMissing(lines, catalog, new Set(["vercel-react-best-practices"]))).toEqual([
      { name: "web-design-guidelines", description: "d1", agents: ["designer", "tester"] },
    ]);
  });
});

describe("installSkills", () => {
  const catalog = [{ name: "web-design-guidelines", dir: "web-design-guidelines", description: "d" }];

  it("downloads every file of the skill into <workspace>/.claude/skills/<name>", async () => {
    const ws = tmp();
    const f = fakeFetch({ "git/trees": TREE, "web-design-guidelines/SKILL.md": WDG, "web-design-guidelines/refs/a.md": "ref" });
    expect(await installSkills(["web-design-guidelines"], ws, catalog, f)).toEqual(["web-design-guidelines"]);
    expect(fs.readFileSync(path.join(ws, ".claude/skills/web-design-guidelines/refs/a.md"), "utf8")).toBe("ref");
    expect(fs.existsSync(path.join(ws, ".claude/skills/web-design-guidelines/SKILL.md"))).toBe(true);
  });

  it("rejects names that aren't in the catalog or aren't slugs", async () => {
    const ws = tmp();
    await expect(installSkills(["../evil"], ws, catalog, fakeFetch({}))).rejects.toThrow(/Invalid skill name/);
    await expect(installSkills(["not-in-catalog"], ws, catalog, fakeFetch({}))).rejects.toThrow(/not in the catalog/);
  });

  it("refuses tree paths that escape the skill folder", async () => {
    const ws = tmp();
    const evilTree = JSON.stringify({ tree: [{ path: "skills/web-design-guidelines/../../../evil.txt", type: "blob" }] });
    await expect(installSkills(["web-design-guidelines"], ws, catalog, fakeFetch({ "git/trees": evilTree, "evil.txt": "x" }))).rejects.toThrow(/outside/);
    expect(fs.existsSync(path.join(ws, "..", "evil.txt"))).toBe(false);
  });
});
