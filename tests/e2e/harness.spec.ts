import { expect, test } from "@playwright/test";

const prompt = (page: import("@playwright/test").Page) => page.locator("#prompt-input");

// The intro animation plays once per browser session; skip it except in the test about it.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes("intro")) await page.addInitScript(() => sessionStorage.setItem("gabo:intro-seen", "1"));
});

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

test("Workspace rooms: agents work as a team and each shows who it builds on", async ({ page }) => {
  await page.goto("/library");
  await prompt(page).fill("teach me binary search --deep");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  const handoffs = page.getByTitle("Builds on what these teammates said");
  await expect(handoffs.first()).toContainText("← Researcher");
  await expect(handoffs).toHaveCount(3);
});

test("Workspace rooms: a short question gets a Quick team reply in one answer, shown as the agents' turns", async ({ page }) => {
  await page.goto("/library");
  await prompt(page).fill("what is a binary search?");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Quick reply \(short question.*the team answers together in one reply/)).toBeVisible();
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("The Researcher opens.")).toBeVisible();
  await expect(page.getByText("The Tutor answers and builds on it.")).toBeVisible();
  await expect(page.getByTitle("Builds on what these teammates said")).toHaveCount(1);
  await expect(page.getByTitle("Builds on what these teammates said")).toContainText("← Researcher");
  await expect(page.getByText("### researcher")).toHaveCount(0);
});

test("a Quick team reply can be redone with real agents in one click", async ({ page }) => {
  await page.goto("/library");
  await prompt(page).fill("what is a stack?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Redo with real agents" }).click();
  await expect(page.getByText("what is a stack? --deep")).toBeVisible();
  // Real agents report in their own blocks (the fake Deep run).
  await expect(page.getByText("The Researcher reporting.")).toBeVisible({ timeout: 20_000 });
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

test("mascots on the page loop their own animation; tiny sidebar ones wait for hover", async ({ page }) => {
  await page.goto("/agents");
  const rows = page.locator("main ul").first().locator("li a");
  await expect(rows).toHaveCount(12);
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const svg = rows.nth(i).locator("svg.mascot");
    const names = await svg.evaluate((el) =>
      el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName).sort().join(","));
    expect(names, (await svg.getAttribute("data-kind")) ?? "").not.toBe("");
    seen.add(names);
  }
  expect(seen.size).toBe(12);

  await page.goto("/settings");
  const tabJudge = page.getByRole("tab", { name: /Judge/ }).locator('svg.mascot[data-kind="judge"]');
  await page.mouse.move(900, 20);
  expect(await tabJudge.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await tabJudge.hover();
  await expect.poll(() => tabJudge.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
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
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByLabel("Role prompt")).toHaveValue(/BUILD, FIX FIRST, or KILL/);
  await expect(page.getByLabel("Added goal")).toHaveValue("");
  await expect(page.getByRole("tab", { name: /Judge/ })).not.toContainText("edited");
});

test("settings: token budget and per-agent model default to the recommendation, and runs use the budget", async ({ page }) => {
  await page.goto("/settings?agent=caveman");
  const budget = page.getByRole("radiogroup", { name: "Token budget" });
  await expect(budget.getByRole("radio", { name: "Balanced" })).toHaveAttribute("aria-checked", "true");
  const model = page.getByLabel("Agent model");
  await expect(model).toHaveValue("");
  await expect(model.locator("option").first()).toHaveText("Recommended (haiku)");
  await expect(page.getByText(/Why: Compresses text/)).toBeVisible();
  await page.getByRole("tab", { name: /Judge/ }).click();
  await expect(page.getByLabel("Agent model").locator("option").first()).toHaveText("Recommended (opus)");

  // Economy moves the Judge's recommendation to Sonnet.
  await budget.getByRole("radio", { name: "Economy" }).click();
  await expect(budget.getByRole("radio", { name: "Economy" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Agent model").locator("option").first()).toHaveText("Recommended (sonnet)");

  // A per-agent pick saves and marks the agent edited; reset clears it.
  await page.getByLabel("Agent model").selectOption("haiku");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Agent model")).toHaveValue("haiku");
  await expect(page.getByRole("tab", { name: /Judge/ })).toContainText("edited");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByLabel("Agent model")).toHaveValue("");

  // The run reports the budget it used.
  await page.goto("/");
  await prompt(page).fill("hello budget");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/budget economy/)).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Token budget" }).getByRole("radio", { name: "Balanced" }).click();
  await expect(page.getByRole("radiogroup", { name: "Token budget" }).getByRole("radio", { name: "Balanced" })).toHaveAttribute("aria-checked", "true");
});

test("Recents lists Claude Code history; opening a CLI session shows its transcript and resumes it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^History/ }).click();
  const entry = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Fix login bug/ });
  await expect(entry).toContainText("Rivan-Simulation");
  await entry.click();
  await expect(page.getByText("Fix the login bug")).toBeVisible();
  await expect(page.getByText("Found it: the token check ran before the cookie was read.")).toBeVisible();
  await expect(page.getByText("Edit(src/auth.ts)")).toBeVisible();
  await expect(page).toHaveURL(/\?c=/);
  await page.reload();
  await expect(page.getByText("Fix the login bug")).toBeVisible();
  await page.locator("#prompt-input").fill("and add a test");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
});

test("New Session under the prompt compacts a copy of the chat into a new chat that continues from the summary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New Session" })).toHaveCount(0);
  await page.locator("#prompt-input").fill("first chat about budgets");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  const oldUrl = page.url();
  await expect(page.getByText("Continue in a fresh chat")).toHaveCount(0);
  await page.getByRole("button", { name: "New Session" }).click();
  await expect(page).not.toHaveURL(oldUrl);
  await expect(page).toHaveURL(/\?c=/);
  const carried = page.getByText(/Carried over from “first chat about budgets”/);
  await expect(carried).toBeVisible();
  await carried.click();
  await expect(page.getByText("Nothing is pending.")).toBeVisible();
  await page.getByRole("button", { name: /^History/ }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /first chat about budgets \(continued\)/ }).first()).toBeVisible();
  // The new chat keeps going.
  await page.locator("#prompt-input").fill("carry on");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  // The original chat is untouched.
  await page.goto(oldUrl);
  await expect(page.locator('ol[aria-live="polite"]').getByText("first chat about budgets").first()).toBeVisible();
  await expect(page.getByText(/Carried over/)).toHaveCount(0);
});

test("background agents: the chat keeps showing work until they finish", async ({ page }) => {
  await page.goto("/");
  await prompt(page).fill("fix it in the background");
  await page.keyboard.press("Enter");
  await expect(page.getByText("The Coder is fixing the bugs.")).toBeVisible({ timeout: 20_000 });
  // The lead's text is done, but the run is not: the spinner names the background work.
  const spinner = page.getByRole("status").filter({ hasText: "Working in the background" });
  await expect(spinner).toContainText("Coder fixing the bugs");
  await expect(spinner).toContainText("the reply continues when they finish");
  await expect(page.getByText("working in the background").first()).toBeVisible();
  await expect(page.getByText("coder finished in the background: fixed 3 bugs")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible();
  await expect(spinner).toHaveCount(0);
});

test("context guard: a huge chat warns above the prompt, shows its size, and asks before sending", async ({ page }) => {
  await page.goto("/");
  await prompt(page).fill("a huge chat");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("480k context")).toBeVisible();
  const guard = page.getByRole("status").filter({ hasText: "re-reads about" });
  await expect(guard).toContainText("480k");
  // Sending again asks first; Cancel starts a New Session instead.
  const oldUrl = page.url();
  page.once("dialog", (d) => { expect(d.message()).toContain("re-reads about 480k tokens"); void d.dismiss(); });
  await prompt(page).fill("one more question");
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(oldUrl);
  await expect(page.getByText(/Carried over from/)).toBeVisible();
});

test("status line: Shift+Tab cycles permission mode; model and effort reach the run", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("gabo:prefs"));
  await page.reload();
  const mode = page.getByRole("button", { name: /ask before edits|accept edits|plan mode|auto mode/ });
  await expect(mode).toHaveText("ask before edits");
  await expect(page.getByLabel("Model").locator("option")).toHaveCount(4); // hydrated, CLI info loaded
  await page.locator("#prompt-input").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(mode).toHaveText("⏵⏵ accept edits on");
  await page.keyboard.press("Shift+Tab");
  await expect(mode).toHaveText("⏸ plan mode on");
  await page.getByLabel("Model").selectOption("opus");
  await page.getByLabel("Effort").selectOption("high");
  await page.locator("#prompt-input").fill("plan something");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Run settings: mode plan, model opus, effort high")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /plan mode/ })).toBeVisible();
});

test("typing while Claude works queues the message and sends it next", async ({ page }) => {
  await page.goto("/library");
  const input = page.locator("#prompt-input");
  await input.fill("first question");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toBeVisible();
  await input.fill("follow-up question");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Queued messages" })).toContainText("follow-up question");
  await expect(page.locator("main ol").getByText("follow-up question", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("list", { name: "Queued messages" })).toHaveCount(0);
  await expect(page.getByText("Done. Fake run finished.")).toHaveCount(2, { timeout: 20_000 });
});

test("/ lists Claude Code's own commands and passes them through", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#prompt-input");
  await input.fill("/brain");
  await expect(page.getByRole("listbox", { name: "Commands" })).toContainText("/superpowers:brainstorming");
  await input.fill("/context");
  await page.keyboard.press("Enter");
  await expect(page.locator("main ol").getByText("/context", { exact: true })).toBeVisible();
  await expect(page.getByText("Unknown command")).toHaveCount(0);
});

test("AskUserQuestion: Gab picks an option and Claude gets the answer", async ({ page }) => {
  await page.goto("/");
  await page.locator("#prompt-input").fill("please ask me something");
  await page.keyboard.press("Enter");
  const q = page.getByRole("group", { name: "Claude has a question" });
  await expect(q).toContainText("Which database?");
  await q.getByLabel(/SQLite/).check();
  await q.getByRole("button", { name: "Answer" }).click();
  await expect(page.getByText('Answers: {"Which database?":"SQLite"}')).toBeVisible();
  await expect(page.getByText("Question — Which database? → SQLite")).toBeVisible();
});

test("plan approval: 'auto-accept edits' flips the mode like the CLI", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("gabo:prefs"));
  await page.reload();
  await page.locator("#prompt-input").fill("make a plan for the fix");
  await page.keyboard.press("Enter");
  const plan = page.getByRole("group", { name: "Claude has a plan" });
  await expect(plan).toContainText("Add tests");
  await page.keyboard.press("1");
  await expect(page.getByText("Plan approved.")).toBeVisible();
  await expect(page.getByRole("button", { name: /accept edits on/ })).toBeVisible();
});

test("todo list and edit diffs show like the CLI", async ({ page }) => {
  await page.goto("/hackathon");
  await page.locator("#prompt-input").fill("todo: build it");
  await page.keyboard.press("Enter");
  await page.getByRole("group", { name: /Permission needed/ }).getByRole("button", { name: /Yes$/ }).click();
  await expect(page.getByLabel("Diff of notes.md")).toContainText("+ # Notes");
  const todos = page.getByRole("list", { name: "Todo list" });
  await expect(todos).toContainText("Fix the bug");
  await expect(todos).toContainText("(in progress)");
});

test("@ suggests workspace files and inserts the path", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#prompt-input");
  await input.click();
  await page.keyboard.type("look at @log");
  const list = page.getByRole("listbox", { name: "Files" });
  await expect(list).toContainText("@src/auth/login.ts");
  await page.keyboard.press("Tab");
  await expect(input).toHaveValue("look at @src/auth/login.ts ");
});

test("a pasted screenshot is attached and sent as an image", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#prompt-input");
  await input.click();
  await page.evaluate(() => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    document.querySelector("#prompt-input")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("list", { name: "Attached images" }).getByRole("img")).toHaveCount(1);
  await input.fill("what is wrong here?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Received 1 image (image/png).")).toBeVisible();
  await expect(page.locator("main ol").getByText("[1 image]")).toBeVisible();
  await expect(page.getByRole("list", { name: "Attached images" })).toHaveCount(0);
});

test("/ menu: arrow keys move through commands and Enter runs the highlighted one", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#prompt-input");
  await input.click();
  await page.keyboard.type("/");
  const menu = page.getByRole("listbox", { name: "Commands" });
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("option", { selected: true })).toContainText("/mode");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("option", { selected: true })).toContainText("/model");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Permission mode: (default|acceptEdits|plan|auto)\. Options/)).toBeVisible();
});

test("Up and Down recall previous prompts like a terminal", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("gabo:input-history"));
  const input = page.locator("#prompt-input");
  for (const [i, text] of ["first prompt", "second prompt"].entries()) {
    await input.fill(text);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Done. Fake run finished.")).toHaveCount(i + 1, { timeout: 20_000 });
  }
  await input.fill("draft");
  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveValue("second prompt");
  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveValue("first prompt");
  await page.keyboard.press("ArrowDown");
  await expect(input).toHaveValue("second prompt");
  await page.keyboard.press("ArrowDown");
  await expect(input).toHaveValue("draft");
});

test("sidebar: Workspace groups the rooms, History is a dropdown that remembers its state, Plugins has a tab", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const workspace = nav.getByRole("button", { name: /^Workspace/ });
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Library", exact: true })).toBeHidden();
  await workspace.click();
  for (const room of ["Library", "Arena", "Hackathon"]) await expect(nav.getByRole("link", { name: room, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Plugins" })).toBeVisible();

  const history = nav.getByRole("button", { name: /^History/ });
  await expect(history).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: /Fix login bug/ })).toBeHidden();
  await history.click();
  await expect(nav.getByRole("link", { name: /Fix login bug/ })).toBeVisible();
  await page.reload();
  await expect(nav.getByRole("link", { name: /Fix login bug/ })).toBeVisible();

  await nav.getByRole("link", { name: "Arena", exact: true }).click();
  await expect(page).toHaveURL(/\/arena$/);
  await expect(nav.getByRole("button", { name: /^Workspace/ })).toHaveAttribute("aria-expanded", "true");
});

test("intro: Gabo pops in, GABO types out with the tagline, then the app shows; only once per session", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("status", { name: "Gabo intro" });
  await expect(intro).toBeVisible();
  await expect(intro.getByRole("img", { name: "Gabo mascot" })).toBeVisible();
  await expect(intro.getByText("GABO", { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(intro.getByText("A Multi-Agent Harness")).toBeVisible({ timeout: 3000 });
  await expect(intro).toBeHidden({ timeout: 6000 });
  await expect(page.locator("#prompt-input")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status", { name: "Gabo intro" })).toHaveCount(0);
});

test("intro can be skipped with a click or a key", async ({ page }) => {
  await page.goto("/library");
  const intro = page.getByRole("status", { name: "Gabo intro" });
  await expect(intro).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(intro).toBeHidden();
});

test("Plugins: connect ChatGPT with a key (never shown back), test it, and see Claude Code plugins", async ({ page }) => {
  await page.goto("/plugins");
  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  const card = page.getByRole("region", { name: "ChatGPT" });
  await expect(card.getByRole("checkbox", { name: "Enable ChatGPT" })).not.toBeChecked();
  await card.getByRole("checkbox", { name: "Enable ChatGPT" }).check();
  await card.getByLabel("API key").fill("sk-test-abcd1234");
  await card.getByLabel("Model").fill("gpt-5");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved")).toBeVisible();
  await expect(card.getByText("Key saved: ••••1234")).toBeVisible();
  await expect(card.getByLabel("API key")).toHaveValue("");
  await card.getByRole("button", { name: "Test connection" }).click();
  await expect(card.getByText("OK (fake ChatGPT)")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "ChatGPT" }).getByRole("checkbox", { name: "Enable ChatGPT" })).toBeChecked();
  const html = await page.content();
  expect(html).not.toContain("sk-test-abcd1234");
  await expect(page.getByRole("region", { name: "Claude Code plugins" })).toContainText("superpowers");

  const openclaw = page.getByRole("region", { name: "OpenClaw" });
  await openclaw.getByLabel("Base URL").fill("http://evil.example/v1");
  await openclaw.getByRole("button", { name: "Save" }).click();
  await expect(openclaw.getByRole("alert")).toContainText("https");
});

test("Agents has no sidebar sub-tabs and no filler sentence; Plugins has no key-storage sentence", async ({ page }) => {
  await page.goto("/agents");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("button", { name: /agents/i })).toHaveCount(0);
  await expect(nav.locator('svg.mascot[data-kind="judge"]')).toHaveCount(0);
  await expect(page.getByText("Twelve roles.")).toHaveCount(0);
  await page.goto("/plugins");
  await expect(page.getByText("Keys stay in")).toHaveCount(0);
});

test("Status shows Claude Code version, model, account, connectivity and tool statuses", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Status" }).click();
  await expect(page).toHaveURL(/\/status$/);
  const cc = page.getByRole("region", { name: "Claude Code" });
  await expect(cc).toContainText("Version");
  await expect(cc).toContainText("2.1.");
  await expect(cc).toContainText("Default model");
  await expect(page.getByRole("region", { name: "Account" })).toContainText("Claude Pro");
  await expect(page.getByRole("region", { name: "Connectivity" })).toContainText("Anthropic API");
  const tools = page.getByRole("region", { name: "Tools" });
  await expect(tools).toContainText("plugin:github:github");
  await expect(tools).toContainText("connected");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(cc).toContainText("Version");
});

test("Settings → Add agent: costume from a description, randomize, background from the role, save; it shows up everywhere", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Add agent" }).click();
  const form = page.getByRole("form", { name: "New agent" });
  await form.getByLabel("Name").fill("Data Wizard");
  await form.getByLabel("One-liner").fill("Finds the story in a spreadsheet.");
  await form.getByLabel("Describe the mascot").fill("a wise wizard with a magic staff and round glasses, violet");
  await form.getByRole("button", { name: "Generate mascot" }).click();
  await expect(form.getByLabel("Hat")).toHaveValue("wizard");
  await expect(form.getByLabel("Holding")).toHaveValue("staff");
  await expect(form.getByLabel("Body colour")).toHaveValue("violet");
  const before = await form.getByLabel("Holding").inputValue();
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) {
    await form.getByRole("button", { name: "Randomize costume" }).click();
    changed = (await form.getByLabel("Holding").inputValue()) !== before || (await form.getByLabel("Hat").inputValue()) !== "wizard";
  }
  expect(changed).toBe(true);
  await form.getByLabel("System prompt").fill("You teach statistics to first-year students with worked examples.");
  await form.getByLabel("Goal").fill("End every answer with one practice question.");
  await form.getByRole("button", { name: "Generate background" }).click();
  await expect(form.getByLabel("Background")).toHaveValue("classroom");
  await form.getByRole("button", { name: "Create agent" }).click();
  await expect(page.getByText("Created Data Wizard.")).toBeVisible();

  await page.goto("/agents");
  const row = page.locator("main a", { hasText: "Data Wizard" });
  await expect(row).toContainText("Finds the story in a spreadsheet.");
  await row.click();
  await expect(page).toHaveURL(/\/agents\/x-data-wizard/);
  await expect(page.getByRole("img", { name: "Data Wizard" }).first()).toBeVisible();
});

test("Laboratory: pick the team, their mascots load above the prompt, and they run", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Add agent" }).click();
  const form = page.getByRole("form", { name: "New agent" });
  await form.getByLabel("Name").fill("Lab Owl");
  await form.getByLabel("System prompt").fill("You review experiments.");
  await form.getByRole("button", { name: "Create agent" }).click();
  await expect(page.getByText("Created Lab Owl.")).toBeVisible();

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: /^Workspace/ }).click();
  await nav.getByRole("link", { name: "Laboratory", exact: true }).click();
  await expect(page).toHaveURL(/\/laboratory$/);
  const picker = page.getByRole("group", { name: "Pick your team" });
  const caveman = picker.getByRole("checkbox", { name: /The Caveman/ });
  await expect(caveman).toBeChecked();
  await expect(caveman).toBeDisabled();
  await picker.getByRole("checkbox", { name: /The Tutor/ }).check();
  await picker.getByRole("checkbox", { name: /Lab Owl/ }).check();
  await page.getByRole("button", { name: "Start with 3 agents" }).click();
  const team = page.getByRole("list", { name: "Your team" });
  for (const name of ["The Tutor", "Lab Owl", "The Caveman"]) await expect(team.getByRole("img", { name })).toBeVisible();
  await page.locator("#prompt-input").fill("review my experiment plan --deep");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Lab Owl reporting.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("The Tutor reporting.")).toBeVisible();
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
});

test("pin a chat: it stays at the top under Pinned, survives a reload, and can be unpinned", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: /^History/ }).click();
  await nav.getByRole("button", { name: "Pin Fix login bug" }).click();
  const pinned = nav.getByRole("list", { name: "Pinned" });
  await expect(pinned.getByRole("link", { name: /Fix login bug/ })).toBeVisible();
  await nav.getByRole("button", { name: /^History/ }).click();
  await page.reload();
  await expect(nav.getByRole("list", { name: "Pinned" }).getByRole("link", { name: /Fix login bug/ })).toBeVisible();
  await nav.getByRole("list", { name: "Pinned" }).getByRole("button", { name: "Unpin Fix login bug" }).click();
  await expect(nav.getByRole("list", { name: "Pinned" })).toHaveCount(0);
});

test("About explains what Gabo is", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("heading", { name: "About Gabo" })).toBeVisible();
  await expect(page.getByText(/multi-agent harness/i).first()).toBeVisible();
  await expect(page.locator("main")).toContainText("Laboratory");
});

test("Switch to Local LLM: guide, Ollama status, pick a model, test, switch on — runs use it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Local LLM" }).click();
  await expect(page.getByRole("heading", { name: "Switch to Local LLM" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Setup guide" })).toContainText("ollama pull");
  await expect(page.getByRole("region", { name: "Ollama" })).toContainText("running");
  await page.getByLabel("Model", { exact: true }).selectOption("qwen3-coder:30b");
  await page.getByRole("button", { name: "Test model" }).click();
  await expect(page.getByText(/Tools work: called read_note \(fake qwen3-coder:30b\)/)).toBeVisible();
  await page.getByRole("switch", { name: "Use the local model for all agents" }).click();
  await expect(page.getByRole("switch", { name: "Use the local model for all agents" })).toHaveAttribute("aria-checked", "true");
  await page.goto("/");
  await expect(page.getByText("local · qwen3-coder:30b")).toBeVisible();
  await page.locator("#prompt-input").fill("hello local");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/model qwen3-coder:30b \(local\)/)).toBeVisible();
  await page.goto("/local-llm");
  await page.getByRole("switch", { name: "Use the local model for all agents" }).click();
  await expect(page.getByRole("switch", { name: "Use the local model for all agents" })).toHaveAttribute("aria-checked", "false");
});

test("Status shows usage: plan meters and Gabo's own token log", async ({ page }) => {
  await page.goto("/status");
  const usage = page.getByRole("region", { name: "Usage" });
  await expect(usage).toContainText("Current session");
  await expect(usage).toContainText("42%");
  await expect(usage).toContainText("Today");
  await expect(usage).toContainText("Last 7 days");
});

test("Status → Analytics: tokens used this week, day by day, with a hover breakdown and a table view", async ({ page }) => {
  // Earlier tests made fake runs, so this week has data.
  await page.goto("/status");
  const analytics = page.getByRole("region", { name: "Analytics" });
  await expect(analytics).toContainText("Tokens used");
  await expect(analytics).toContainText("no data for the week before");
  await expect(analytics.getByRole("list", { name: "Legend" })).toContainText("Cache read");
  const days = analytics.getByRole("list", { name: "Tokens per day" }).getByRole("listitem");
  await expect(days).toHaveCount(7);
  await expect(analytics.getByText("Today", { exact: true })).toBeVisible();
  await days.last().hover();
  await expect(analytics.getByRole("status")).toContainText("(today)");
  await expect(analytics.getByRole("status")).toContainText("Total");
  await analytics.getByText("Show as a table").click();
  await expect(analytics.getByRole("table")).toContainText("Fresh input");
});

// These change the shared connection, so they run last and leave Gabo connected (fake key) for reruns.
const CLAUDE_FAKE_KEY = "sk-ant-api03-" + "f".repeat(40);

test("first run: after the intro a pop-up asks to connect an AI; Connect opens the provider's sign-in and a pasted key connects it", async ({ page, context }) => {
  await page.request.delete("/api/backend");
  await context.route("https://platform.openai.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>OpenAI sign in</title>" }));
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Connect your AI" });
  await expect(dialog).toBeVisible();
  // Without a connection, runs say how to connect instead of using any login.
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toBeHidden();
  await page.locator("#prompt-input").fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Connect an AI first/)).toBeVisible();

  await page.goto("/connect");
  await expect(page.getByLabel("Current connection")).toContainText("Not connected");
  await page.getByRole("radio", { name: /OpenAI/ }).click();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  expect((await popup).url()).toContain("platform.openai.com/api-keys");
  await page.getByLabel("OpenAI API key").fill("sk-bad-" + "x".repeat(30));
  await page.getByRole("button", { name: "Test and connect" }).click();
  await expect(page.getByText(/rejected the key/)).toBeVisible();
  await page.getByLabel("OpenAI API key").fill("sk-proj-" + "y".repeat(30));
  await page.getByRole("button", { name: "Test and connect" }).click();
  await expect(page.getByText("Connected to OpenAI.")).toBeVisible();
  await expect(page.getByLabel("Current connection")).toContainText("OpenAI API key");
  await expect(page.getByRole("radio", { name: /OpenAI/ })).toContainText("key saved");

  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Connect your AI" })).toHaveCount(0);
  await page.locator("#prompt-input").fill("hello again");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Done. Fake run finished.")).toBeVisible({ timeout: 20_000 });
});

test("pop-up: Use Local LLM opens the setup guide; the Local LLM page prepares the model and connects plugins", async ({ page }) => {
  await page.request.delete("/api/backend");
  await page.goto("/");
  await page.getByRole("dialog", { name: "Connect your AI" }).getByRole("button", { name: "Use Local LLM" }).click();
  await expect(page).toHaveURL(/\/local-llm\?setup=1/);
  const guide = page.getByRole("region", { name: "Setup guide" });
  await expect(guide).toHaveAttribute("data-highlight", "true");
  await expect(guide).toContainText("Install Ollama");
  await expect(guide).toContainText("qwen3:8b");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("Model", { exact: true }).selectOption("qwen3-coder:30b");
  await expect(page.getByLabel("Model details")).toContainText("Ollama default");
  await page.getByRole("button", { name: "Prepare model" }).click();
  await expect(page.getByText(/Ready: qwen3-coder-30b-gabo-16k/)).toBeVisible();
  await page.getByRole("button", { name: "Test model" }).click();
  await expect(page.getByText(/Tools work/)).toBeVisible();
  const ready = page.getByRole("region", { name: "Readiness" });
  await expect(ready.locator("li[data-ok=true]")).toHaveCount(6);

  const plugins = page.getByRole("region", { name: "Plugins for Local LLM" });
  await expect(plugins.getByLabel("github")).not.toBeChecked();
  await plugins.getByLabel("github").click();
  await expect(plugins.getByLabel("github")).toBeChecked();
  await expect(plugins.getByText("needs a Claude login, not available locally")).toBeVisible();
  await plugins.getByLabel("Notion token").fill("not-a-token");
  await plugins.getByRole("button", { name: "Save token" }).click();
  await expect(plugins.getByRole("alert")).toContainText("Notion integration token");
  await plugins.getByLabel("Plugin name").fill("Memory");
  await plugins.getByLabel("Plugin command").fill("npx -y @modelcontextprotocol/server-memory");
  await plugins.getByRole("button", { name: "Add plugin" }).click();
  await expect(plugins.getByText("npx -y @modelcontextprotocol/server-memory")).toBeVisible();
  await plugins.getByRole("listitem").filter({ hasText: "Memory" }).getByRole("button", { name: "Test" }).click();
  await expect(plugins.getByText(/✓ 2 tools: search, fetch/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Plugins for Local LLM" }).getByText("npx -y @modelcontextprotocol/server-memory")).toBeVisible();

  // Leave Gabo connected for whatever runs next.
  const res = await page.request.put("/api/backend", { data: { provider: "claude", apiKey: CLAUDE_FAKE_KEY } });
  expect(res.ok()).toBe(true);
});
