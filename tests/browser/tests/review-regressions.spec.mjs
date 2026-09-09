import { expect, test } from "@playwright/test";

async function open(page, board = "lifecycle") {
  await page.addInitScript((id) => localStorage.setItem("sisyphus.lastBoard", id), board);
  await page.goto("/");
  await expect(page.locator(".board-name")).toBeVisible();
}
async function create(request, description) {
  const response = await request.post("/api/v1/boards/lifecycle/tasks", { data: { description, column_id: "ready" } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).task;
}
async function task(request, uuid) { return (await (await request.get(`/api/v1/tasks/${uuid}`)).json()).task; }

test("Today keyboard drag moves, drops, and Escape cancels without mutation", async ({ page, request }) => {
  const created = await create(request, "Keyboard drag regression");
  await open(page, "daily");
  await page.getByPlaceholder("Search", { exact: true }).fill(created.description);
  const handle = page.getByRole("button", { name: `Drag ${created.description}`, exact: true });
  const moveTo = async (target, arrow) => {
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".today-dragging")).toHaveCount(1);
    for (let i = 0; i < 40; i++) {
      if (await page.locator(`[data-drop="${target}"].drop-over`).count()) break;
      await page.keyboard.press(arrow);
    }
    await expect(page.locator(`[data-drop="${target}"].drop-over`)).toHaveCount(1);
  };
  await moveTo("start", "ArrowUp");
  await page.keyboard.press("Space");
  await expect(page.getByRole("region", { name: "Doing", exact: true }).getByText(created.description)).toBeVisible();
  await expect(page.locator(".today-dragging")).toHaveCount(0);
  const before = await task(request, created.uuid);
  expect(before.lifecycle).toBe("doing");
  const mutations = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes(`/tasks/${created.uuid}/`)) mutations.push(r.url()); });
  await moveTo("up_next", "ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.locator(".today-dragging")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Doing", exact: true }).getByText(created.description)).toBeVisible();
  expect(await task(request, created.uuid)).toEqual(before);
  expect(mutations).toEqual([]);
  await expect(page.locator(".drawer")).toHaveCount(0);
});

for (const kind of ["block", "defer", "follow_up", "annotation"]) {
  test(`drawer protects and restores unsaved ${kind} across outside dismissal, reload and Escape`, async ({ page, request }) => {
    const created = await create(request, `Unsaved ${kind} regression`);
    if (kind === "follow_up") {
      const response = await request.post(`/api/v1/tasks/${created.uuid}/action`, { data: { action: "block", blocker: "Await approval", date: "2099-01-01", expected_modified: created.modified } });
      expect(response.ok()).toBeTruthy();
    }
    await open(page);
    await page.locator(`.card[data-uuid="${created.uuid}"]`).click();
    const drawer = page.locator(".drawer");
    if (kind !== "annotation") await drawer.getByRole("button", { name: { block: "Block", defer: "Defer", follow_up: "Review blocker" }[kind], exact: true }).click();
    const input = kind === "annotation" ? drawer.getByPlaceholder("Add a note…") : drawer.getByLabel({ block: "Blocking condition", defer: "Return date", follow_up: "Follow-up date (optional)" }[kind]);
    const value = kind === "annotation" || kind === "block" ? "Keep my unsaved context" : "2099-02-02";
    await input.fill(value);
    let confirmations = 0;
    const dismiss = async (dialog) => { confirmations++; expect(dialog.message()).toBe("Discard unsaved changes?"); await dialog.dismiss(); };
    page.on("dialog", dismiss);
    await page.locator(".drawer-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(input).toHaveValue(value);
    expect(confirmations).toBe(1);
    await page.reload();
    await expect(input).toHaveValue(value);
    await expect(drawer.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await input.focus();
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue(value);
    expect(confirmations).toBe(2);
    page.off("dialog", dismiss);
    page.once("dialog", (dialog) => dialog.accept());
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    expect(await page.evaluate((uuid) => sessionStorage.getItem(`sisyphus.draft.edit.${uuid}`), created.uuid)).toBeNull();
    const result = await task(request, created.uuid);
    expect(result.deferred).toBe(false);
    expect(result.blocker).toBe(kind === "follow_up" ? "Await approval" : null);
    expect(result.follow_up_on).toBe(kind === "follow_up" ? "2099-01-01" : null);
    expect(result.annotations).toEqual([]);
  });
}

test("unchanged semantic initial values dismiss without confirmation", async ({ page, request }) => {
  const created = await create(request, "Unchanged semantic regression");
  await open(page);
  const card = page.locator(`.card[data-uuid="${created.uuid}"]`);
  await card.click();
  const drawer = page.locator(".drawer");
  await drawer.getByRole("button", { name: "Block", exact: true }).click();
  await drawer.getByLabel("Blocking condition").fill("Temporary text");
  await drawer.getByLabel("Blocking condition").fill("");
  const confirmations = [];
  page.on("dialog", async (dialog) => { confirmations.push(dialog.message()); await dialog.dismiss(); });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  expect(confirmations).toEqual([]);
});

for (const columnId of ["ready", "doing", "waiting"]) {
  test(`legacy creation draft with ${columnId} submits with supported intent`, async ({ page }) => {
    await page.addInitScript((columnId) => sessionStorage.setItem("sisyphus.draft.create.lifecycle", JSON.stringify({ description: `Legacy ${columnId} draft`, project: "", priority: "", due: "", columnId })), columnId);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page);
    const dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(`Legacy ${columnId} draft`);
    await expect(dialog.getByLabel("Today", { exact: true })).not.toBeChecked();
    const response = page.waitForResponse((r) => r.url().endsWith("/boards/lifecycle/tasks") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    const result = await response;
    expect(result.ok()).toBeTruthy();
    expect(result.request().postDataJSON()).toMatchObject({ column_id: columnId === "ready" ? "ready" : "backlog", planned_for: null, annotations: [] });
    await expect(dialog).toHaveCount(0);
    expect((await result.json()).task.lifecycle).toBe(columnId === "ready" ? "ready" : "backlog");
    expect(errors).toEqual([]);
  });
}
