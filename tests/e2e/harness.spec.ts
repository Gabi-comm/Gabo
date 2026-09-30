import { expect, test } from "@playwright/test";

const prompt = (page: import("@playwright/test").Page) => page.locator("#prompt-input");

test("home shows the office scene above the input, no greeting", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: /walks into the office/ })).toBeVisible();
  await expect(prompt(page)).toBeVisible();
});

for (const width of [320, 1440]) {
  test(`no horizontal scroll at ${width}px on every room`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/library", "/arena", "/hackathon", "/agents", "/agents/caveman"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}

test("keyboard only: send, answer the permission prompt with a number key, run finishes", async ({ page }) => {
  await page.goto("/hackathon");
  await prompt(page).focus();
  await page.keyboard.type("build a timer");
  await page.keyboard.press("Enter");
  const perm = page.getByRole("group", { name: /Permission needed: Write\(notes.md\)/ });
  await expect(perm).toBeVisible();
  await expect(perm.getByRole("button", { name: /Yes$/ })).toBeFocused();
  await page.keyboard.press("2");
  await expect(page.getByText("allowed for this chat")).toBeVisible();
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: /Hackathon: .*The Caveman/ })).toBeVisible();
});

test("Esc interrupts a running run", async ({ page }) => {
  await page.goto("/library");
  await prompt(page).fill("teach me recursion");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Interrupted by you.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("double-clicking send starts only one run", async ({ page }) => {
  await page.goto("/arena");
  await prompt(page).fill("coffee ideas");
  const send = page.getByRole("button", { name: "Send" });
  await send.dblclick();
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main ol").getByText("coffee ideas", { exact: true })).toHaveCount(1);
  await expect(page.getByText("A run is already going")).toHaveCount(0);
});

test("error state explains how to log in", async ({ page }) => {
  await page.goto("/");
  await prompt(page).fill("trigger an error please");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Error" })).toContainText("not logged in");
  await expect(page.getByRole("alert").filter({ hasText: "Error" })).toContainText("/login");
});

test("slash commands: /help and unknown command", async ({ page }) => {
  await page.goto("/");
  await prompt(page).fill("/help");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Esc interrupt/)).toBeVisible();
  await prompt(page).fill("/nope");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Unknown command /nope. Try /help.")).toBeVisible();
});

test("every agent has a subtab and the Caveman is in every room", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.locator("main").getByRole("link", { name: /The / })).toHaveCount(12);
  await expect(page.locator("main a", { hasText: "The Caveman" })).toContainText("Home · Library · Arena · Hackathon");
});

test("reduced motion shows the mascot already seated", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:3218/");
  const walker = page.locator("svg[aria-label*='office'] g[style*='translate']").first();
  await expect(walker).toHaveAttribute("style", /translate\(30\.3px/);
  await ctx.close();
});

test("skill scout: one line per agent, then Download installs the recommended skill", async ({ page }) => {
  await page.goto("/hackathon");
  await prompt(page).fill("design a landing page");
  await page.keyboard.press("Enter");
  const card = page.locator("li", { hasText: "Recommended, not installed" });
  await expect(card).toContainText("web-design-guidelines");
  await expect(card).toContainText("Designer, Tester");
  await expect(page.locator("li", { hasText: "Skills" }).first()).toContainText("Caveman");
  await card.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("Installed web-design-guidelines.")).toBeVisible();
});

test("arena --full asks before a 100-agent run; cancel falls back to --quick", async ({ page }) => {
  await page.goto("/arena");
  page.once("dialog", (d) => d.dismiss());
  await prompt(page).fill("--full ideas for a campus food app");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Running --quick (16 agents) instead.")).toBeVisible();
});

test("leaving a chat mid-run cancels it on the server (no 409 when you come back)", async ({ page }) => {
  await page.goto("/library");
  await prompt(page).fill("teach me sorting");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("c");
  expect(id).toBeTruthy();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Arena", exact: true }).click();
  await expect(page).toHaveURL(/\/arena$/);
  // A fake run lasts ~4 s; a cancelled one frees the chat almost at once.
  const statusNow = () => page.evaluate(async (cid) => {
    const ctrl = new AbortController();
    const res = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ conversationId: cid, room: "library", prompt: "again" }),
    });
    ctrl.abort(); // only the status matters; don't hold a new run open
    return res.status;
  }, id);
  await expect.poll(statusNow, { timeout: 1500, intervals: [150, 250, 400] }).toBe(200);
});

for (const room of ["/", "/library", "/agents/caveman"]) {
  test(`+ New starts a fresh chat in ${room}, during and after a run`, async ({ page }) => {
    const newChat = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "New" });
    const hero = page.locator("#prompt-input");
    await page.goto(room);
    await hero.fill("first chat");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\?c=/);
    await newChat.click();
    await expect(page).not.toHaveURL(/\?c=/);
    await expect(page.locator("main ol")).toHaveCount(0);
    await hero.fill("second chat");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toBeVisible();
    await newChat.click();
    await expect(page.locator("main ol")).toHaveCount(0);
    await expect(page.getByText("Interrupted by you.")).toHaveCount(0);
  });
}

test("the sidebar has no account footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Gabi-comm")).toHaveCount(0);
});

test("every agent mascot plays its own animation on hover", async ({ page }) => {
  await page.goto("/agents");
  const rows = page.locator("main li a");
  await expect(rows).toHaveCount(12);
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const row = rows.nth(i);
    const svg = row.locator("svg.mascot");
    const idle = await svg.evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(idle).toBe(0);
    await row.hover();
    const names = await svg.evaluate((el) =>
      el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName).sort().join(","));
    expect(names, await svg.getAttribute("data-kind") ?? "").not.toBe("");
    seen.add(names);
  }
  expect(seen.size).toBe(12);
});

test("sidebar toggles on desktop, remembers it, and Ctrl+B flips it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(nav).toBeHidden();
  await page.reload();
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(nav).toBeVisible();
  await page.keyboard.press("Control+b");
  await expect(nav).toBeHidden();
  await page.keyboard.press("Control+b");
  await expect(nav).toBeVisible();
});

test("settings: edit an agent's prompt and goal, it persists, and reset restores the spec", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await page.getByRole("tab", { name: /Judge/ }).click();
  const role = page.getByLabel("Role prompt");
  const goal = page.getByLabel("Added goal");
  await expect(role).toHaveValue(/BUILD, FIX FIRST, or KILL/);
  await goal.fill("Keep every ruling under 50 words.");
  await role.fill("You are a fast judge. Rule in one line.");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Judge/ }).click();
  await expect(page.getByLabel("Added goal")).toHaveValue("Keep every ruling under 50 words.");
  await expect(page.getByLabel("Role prompt")).toHaveValue("You are a fast judge. Rule in one line.");
  await expect(page.getByRole("tab", { name: /Judge/ })).toContainText("edited");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset to spec" }).click();
  await expect(page.getByLabel("Role prompt")).toHaveValue(/BUILD, FIX FIRST, or KILL/);
  await expect(page.getByLabel("Added goal")).toHaveValue("");
  await expect(page.getByRole("tab", { name: /Judge/ })).not.toContainText("edited");
});
