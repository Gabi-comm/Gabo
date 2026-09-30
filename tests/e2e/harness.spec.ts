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
