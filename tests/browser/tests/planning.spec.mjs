import { expect, test } from "@playwright/test";

async function create(request, description, extra = {}) {
  const response = await request.post("/api/v1/boards/lifecycle/tasks", { data: { description, ...extra } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).task;
}
async function task(request, uuid) { return (await (await request.get(`/api/v1/tasks/${uuid}`)).json()).task; }
async function open(page, board = "lifecycle") {
  await page.addInitScript((id) => localStorage.setItem("sisyphus.lastBoard", id), board);
  await page.goto("/");
  await expect(page.locator(".board-name")).toBeVisible();
}
async function inspect(page, title) { await page.locator(".card", { hasText: title }).first().click(); return page.locator(".drawer"); }
async function tabTo(page, target) {
  for (let i = 0; i < 80; i++) { if (await target.evaluate((el) => el === document.activeElement)) return; await page.keyboard.press("Tab"); }
  throw new Error("Control not reachable by Tab");
}

for (const suffix of ["desktop", "touch @mobile"]) {
  test(`drawer outside dismissal protects edits and restores focus ${suffix}`, async ({ page, request }) => {
    const created = await create(request, `Outside dismissal ${suffix}`, { column_id: "ready" });
    await open(page, "daily");
    await page.getByPlaceholder("Search", { exact: true }).fill(created.description);
    const opener = page.locator(`.card[data-uuid="${created.uuid}"]`);
    await opener.click();
    const drawer = page.locator(".drawer");
    await expect(drawer).toBeVisible();
    await page.locator(".drawer-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(drawer).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await drawer.getByRole("button", { name: "Edit", exact: true }).click();
    await drawer.getByLabel("Description").fill("Keep this unsaved edit");
    await drawer.getByLabel("Project", { exact: true }).fill("outside-test.project");
    await expect(drawer).toBeVisible();
    page.once("dialog", async (dialog) => { expect(dialog.message()).toBe("Discard unsaved changes?"); await dialog.dismiss(); });
    await page.locator(".drawer-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(drawer.getByLabel("Description")).toHaveValue("Keep this unsaved edit");
    await expect(drawer.getByLabel("Project", { exact: true })).toHaveValue("outside-test.project");
    page.once("dialog", (dialog) => dialog.accept());
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test(`Ready starts directly and completion shows quiet progress ${suffix}`, async ({ page, request }, testInfo) => {
    const created = await create(request, `Pull as I go ${suffix}`, { column_id: "ready" });
    await open(page, "daily");
    await page.getByPlaceholder("Search", { exact: true }).fill(created.description);
    const ready = page.getByRole("region", { name: "Ready to start", exact: true });
    const start = ready.locator(".today-task", { hasText: created.description }).getByRole("button", { name: "Start", exact: true });
    if (suffix === "desktop") { await tabTo(page, start); await page.keyboard.press("Enter"); } else await start.click();
    const doing = page.getByRole("region", { name: "Doing", exact: true }).locator(".today-task", { hasText: created.description });
    await expect(doing).toBeVisible();
    expect((await task(request, created.uuid)).planned_for).toBeNull();
    await expect(page.locator(`.card[data-uuid="${created.uuid}"]`)).toHaveCount(1);
    await doing.getByRole("button", { name: "Complete", exact: true }).click();
    await expect.poll(async () => (await task(request, created.uuid)).lifecycle).toBe("done");
    await page.locator(".today-progress button").click();
    await expect(page.getByRole("dialog", { name: "Done today", exact: true }).getByText(created.description)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByPlaceholder("Search", { exact: true }).fill("");
    await page.screenshot({ path: testInfo.outputPath("today.png"), fullPage: true });
    if (suffix !== "desktop") for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await ready.getByRole("button").all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });
}

test("command palette navigates directly to Today", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("dialog", { name: "Command palette" }).getByLabel("Command", { exact: true }).fill("Today");
  await expect(page.getByRole("button", { name: "Go to Today", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".today-view")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sisyphus.lastBoard"))).toBe("daily");
});

test("first task remains fully visible when keyboard focused at the column edge", async ({ page, request }, testInfo) => {
  const created = await create(request, "Focus at column edge", { project: "e2e-focus-edge", column_id: "ready" });
  const boards = await (await request.get("/api/v1/boards")).json();
  await open(page, boards.find((b) => b.project === created.project).id);
  const card = page.locator(`.card[data-uuid="${created.uuid}"]`);
  await tabTo(page, card);
  await expect(card).toBeFocused();
  const geometry = await card.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const clip = el.closest(".column-body").getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, clipTop: clip.top, clipBottom: clip.bottom };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.clipTop);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.clipBottom);
  await page.screenshot({ path: testInfo.outputPath("focused-column-edge.png") });
});

for (const suffix of ["keyboard", "touch @mobile"]) test(`daily core actions and deferred return are direct and accessible ${suffix}`, async ({ page, request }) => {
  const created = await create(request, `Direct daily flow ${suffix}`, { column_id: "ready", due: "2020-01-01" });
  const deferred = await create(request, `Deferred direct flow ${suffix}`);
  await request.post(`/api/v1/tasks/${deferred.uuid}/action`, { data: { action: "defer", date: "2099-01-01", expected_modified: deferred.modified } });
  await open(page, "daily");
  const activate = async (locator) => { if (suffix === "keyboard") { await tabTo(page, locator); await page.keyboard.press("Enter"); } else await locator.click(); };
  await activate(page.getByRole("button", { name: "Choose from Ready", exact: true }));
  const picker = page.getByRole("dialog", { name: "Choose from Ready" });
  await expect(picker.getByLabel("Find a task")).toBeFocused();
  await picker.getByLabel("Find a task").fill(created.description);
  await expect(picker.getByText(/Deadline:/)).toBeVisible();
  await activate(picker.getByRole("button", { name: "Choose today", exact: true }));
  await expect.poll(async () => (await task(request, created.uuid)).planned_for).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Choose from Ready", exact: true })).toBeFocused();
  await activate(page.getByRole("region", { name: "Up next", exact: true }).locator(".today-task", { hasText: created.description }).getByRole("button", { name: "Start", exact: true }));
  const doing = page.getByRole("region", { name: "Doing", exact: true }).locator(".today-task", { hasText: created.description });
  await expect(doing).toBeVisible();
  await activate(doing.getByRole("button", { name: "Complete", exact: true }));
  await expect.poll(async () => (await task(request, created.uuid)).lifecycle).toBe("done");
  await activate(page.getByRole("button", { name: /^Deferred \(/ }));
  const panel = page.getByRole("dialog", { name: "Deferred tasks" });
  await panel.getByLabel("Find a task").fill(deferred.description);
  await expect(panel.getByText(/Returns/)).toBeVisible();
  await activate(panel.getByRole("button", { name: "Return now", exact: true }));
  await expect.poll(async () => (await task(request, deferred.uuid)).deferred).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Deferred \(/ })).toBeFocused();
  if (suffix !== "keyboard") {
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  }
});

test("capture defaults to Backlog; Today commits without inventing a deadline", async ({ page, request }) => {
  await open(page, "daily");
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create task" });
  await dialog.getByLabel("Title", { exact: true }).fill("Planning contract capture");
  await expect(dialog.getByLabel("Ready", { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("Today", { exact: true })).not.toBeChecked();
  await dialog.getByLabel("Today", { exact: true }).check();
  const response = page.waitForResponse((r) => r.url().endsWith("/boards/daily/tasks") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  const created = (await (await response).json()).task;
  expect(created.lifecycle).toBe("ready"); expect(created.planned_for).toBeTruthy(); expect(created.due).toBeNull(); expect(created.active).toBe(false);
  const drawer = await inspect(page, created.description);
  await expect(drawer.getByRole("button", { name: "Make ready", exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Plan today", exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Clear plan", exact: true }).click();
  await expect.poll(async () => (await task(request, created.uuid)).planned_for).toBeNull();
  expect((await task(request, created.uuid)).committed).toBe(true);
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Start", exact: false }).click();
  await expect.poll(async () => (await task(request, created.uuid)).lifecycle).toBe("doing");
  await expect(drawer.getByRole("button", { name: "Return to Ready", exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Plan today", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("region", { name: "Doing", exact: true }).getByText(created.description)).toBeVisible();
});

test("blocking preserves commitment; follow-up never resolves; deferral stays discoverable", async ({ page, request }) => {
  const created = await create(request, "Block and defer contract", { column_id: "ready" });
  await open(page);
  const drawer = await inspect(page, created.description);
  await drawer.getByRole("button", { name: "Block", exact: true }).click();
  await drawer.getByLabel("Blocking condition").fill("Receive the signed agreement");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer.locator(".drawer-status")).toHaveText("waiting");
  await expect(drawer.getByRole("button", { name: "Start", exact: false })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Review blocker", exact: true }).click();
  await drawer.getByLabel("Follow-up date (optional)").fill("2020-01-01");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await task(request, created.uuid)).follow_up_on).toBe("2020-01-01");
  expect((await task(request, created.uuid)).lifecycle).toBe("waiting");
  await drawer.getByRole("button", { name: "Review blocker", exact: true }).click();
  await expect(drawer.getByLabel("Follow-up date (optional)")).toHaveValue("2020-01-01");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await task(request, created.uuid)).follow_up_on).toBe("2020-01-01");
  await drawer.getByRole("button", { name: "Resolve blocker" }).click();
  await expect(drawer.locator(".drawer-status")).toHaveText("ready");
  await drawer.getByRole("button", { name: "Defer", exact: true }).click();
  await drawer.getByLabel("Return date").fill("2099-01-01");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer.locator(".drawer-status")).toHaveText("Deferred");
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".board-columns .card", { hasText: created.description })).toHaveCount(0);
  await page.getByRole("button", { name: /^Deferred \(/ }).click();
  await page.getByRole("dialog", { name: "Deferred tasks" }).getByRole("button", { name: new RegExp(created.description) }).click();
  await drawer.getByRole("button", { name: "Return now" }).click();
  await expect(drawer.locator(".drawer-status")).toHaveText("ready");
});

test("project transitions retain selection and history supports inspection, reopening and adding", async ({ page, request }) => {
  const project = "e2e-navigation-contract";
  const created = await create(request, "Finish navigation contract", { project, column_id: "ready" });
  const boards = await (await request.get("/api/v1/boards")).json();
  const board = boards.find((b) => b.project === project);
  await open(page, board.id);
  const drawer = await inspect(page, created.description);
  await drawer.getByRole("button", { name: "Complete", exact: false }).click();
  await expect(page.getByText("No unfinished tasks. This project is now in History.")).toBeVisible();
  await expect(page.locator(".board-name")).toHaveText(project);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".board-switcher").click();
  await page.getByRole("button", { name: "Browse history" }).click();
  await expect(page.getByRole("option", { name: new RegExp(project) })).toBeVisible();
  await page.getByLabel("Search projects").fill(project);
  await expect(page.getByRole("option", { name: new RegExp(project) })).toContainText("history");
  await page.getByRole("option", { name: new RegExp(project) }).click();
  await inspect(page, created.description);
  await drawer.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(page.locator(".board-name")).toHaveText(project);
  await expect(drawer.locator(".drawer-status")).not.toHaveText("done");
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create task" }).getByLabel("Project", { exact: true })).toHaveValue(project);
});

test("semantic conflicts require review and offline actions cannot mutate", async ({ page, request, context }) => {
  const created = await create(request, "Conflict contract");
  await open(page);
  const drawer = await inspect(page, created.description);
  await page.route(`**/api/v1/tasks/${created.uuid}/action`, (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "conflict", message: "Changed", task: created }) }));
  await drawer.getByRole("button", { name: "Plan today", exact: true }).click();
  await expect(page.locator(".toast", { hasText: "Review the latest task" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overwrite", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  expect((await task(request, created.uuid)).planned_for).toBeNull();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(drawer.getByRole("button", { name: "Plan today", exact: true })).toBeDisabled();
});

test("old plans are optional review; deadline references do not displace chosen work", async ({ page, request }) => {
  const old = await create(request, "Unfinished plan contract", { planned_for: "2020-01-01" });
  const chosen = await create(request, "Chosen with overdue deadline", { due: "2020-01-01" });
  const response = await request.post(`/api/v1/tasks/${chosen.uuid}/action`, { data: { action: "plan_today", expected_modified: chosen.modified } });
  expect(response.ok()).toBeTruthy();
  await open(page, "daily");
  const chosenSection = page.getByRole("region", { name: "Up next", exact: true });
  await expect(chosenSection.getByText(chosen.description)).toBeVisible();
  await expect(page.locator(".card", { hasText: chosen.description })).toHaveCount(1);
  await page.getByRole("button", { name: /^Needs attention/ }).click();
  await expect(page.locator(".review-task", { hasText: chosen.description })).toBeVisible();
  const plans = page.getByRole("region", { name: "Unfinished daily plans", exact: true });
  await plans.getByRole("button", { name: new RegExp(old.description) }).click();
  await page.locator(".drawer").getByRole("button", { name: "Clear plan", exact: true }).click();
  await expect.poll(async () => (await task(request, old.uuid)).planned_for).toBeNull();
  expect((await task(request, old.uuid)).lifecycle).toBe("ready");
});

for (const suffix of ["desktop", "touch @mobile"]) test(`panels dismiss outside but retain inside interactions ${suffix}`, async ({ page }) => {
  await open(page, "daily");
  for (const [trigger, title] of [[/^Deferred \(/, "Deferred tasks"], ["Choose from Ready", "Choose from Ready"], [/^Done today/, "Done today"]]) {
    const button = page.getByRole("button", { name: trigger, exact: typeof trigger === "string" });
    await button.click();
    const panel = page.getByRole("dialog", { name: title, exact: true });
    await panel.getByLabel("Find a task").fill("inside interaction");
    await expect(panel).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
  }
});

test("Today drag transitions are atomic and preserve deadlines", async ({ page, request }) => {
  const created = await create(request, "Drag Today contract", { column_id: "ready", due: "2099-01-10" });
  await open(page, "daily");
  await page.getByPlaceholder("Search", { exact: true }).fill(created.description);
  const move = async (target) => {
    const handle = page.getByRole("button", { name: `Drag ${created.description}`, exact: true });
    const from = await handle.boundingBox();
    const to = await page.locator(`[data-drop="${target}"]`).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + 25, { steps: 15 });
    await page.mouse.up();
  };
  await move("up_next");
  await expect(page.getByRole("region", { name: "Up next", exact: true }).getByText(created.description)).toBeVisible();
  await move("start");
  await expect(page.getByRole("region", { name: "Doing", exact: true }).getByText(created.description)).toBeVisible();
  await move("up_next");
  await expect(page.getByRole("region", { name: "Up next", exact: true }).getByText(created.description)).toBeVisible();
  expect((await task(request, created.uuid)).active).toBe(false);
  await move("ready_pool");
  await expect(page.getByRole("region", { name: "Ready to start", exact: true }).getByText(created.description)).toBeVisible();
  const result = await task(request, created.uuid);
  expect(result.planned_for).toBeNull();
  expect(result.due.slice(0, 10)).toBe("2099-01-10");
});

test("history requests all ages and renders completion dates rather than empty Kanban columns", async ({ page, request }) => {
  const created = await create(request, "Historical completion contract", { project: "e2e-all-age-history" });
  await request.post(`/api/v1/tasks/${created.uuid}/complete`, { data: { expected_modified: created.modified } });
  const boards = await (await request.get("/api/v1/boards")).json();
  const board = boards.find((b) => b.project === created.project);
  const historyRequest = page.waitForRequest((r) => r.url().includes(`/boards/${board.id}?history=true`));
  await open(page, board.id);
  await historyRequest;
  await expect(page.getByRole("heading", { name: "Completed tasks" })).toBeVisible();
  await expect(page.locator(".column")).toHaveCount(0);
  await expect(page.locator(".history-tasks").getByText(/^Completed \d/)).toBeVisible();
  const drawer = await inspect(page, created.description);
  await drawer.getByPlaceholder("Add a note…").fill("Retained completion context");
  await drawer.getByRole("button", { name: "Add", exact: true }).click();
  await expect(drawer.locator(".annotation", { hasText: "Retained completion context" })).toBeVisible();
});

test("Today remains usable on mobile without a planning ritual @mobile", async ({ page }) => {
  await open(page, "daily");
  await expect(page.locator(".today-view")).toBeVisible();
  await expect(page.locator(".mobile-tabs")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Doing/ })).toBeVisible();
  await page.getByRole("button", { name: "Choose from Ready", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Choose from Ready" })).toBeVisible();
});

test("server calendar dates survive a different browser timezone", async ({ browser, request }) => {
  const system = await (await request.get("/api/v1/system")).json();
  const serverDay = new Intl.DateTimeFormat("en-CA", { timeZone: system.server_timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const context = await browser.newContext({ timezoneId: "Pacific/Kiritimati" });
  const page = await context.newPage();
  await open(page, "daily");
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create task" });
  await dialog.getByLabel("Title", { exact: true }).fill("Server calendar contract");
  await dialog.getByLabel("Today", { exact: true }).check();
  await dialog.locator("summary", { hasText: "More details" }).click();
  await dialog.getByLabel("Deadline", { exact: true }).fill("2099-01-10");
  const response = page.waitForResponse((r) => r.url().endsWith("/boards/daily/tasks") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  const result = await response;
  expect(result.request().postDataJSON().planned_for).toBe(serverDay);
  expect(result.ok()).toBeTruthy();
  const created = (await result.json()).task;
  const drawer = await inspect(page, created.description);
  await drawer.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(drawer.getByLabel("Deadline", { exact: true })).toHaveValue("2099-01-10");
  await context.close();
});
