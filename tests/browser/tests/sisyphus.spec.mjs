import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const theme = JSON.parse(
  readFileSync(new URL("../../../frontend/vendor/nocturne-rose/tokens.json", import.meta.url), "utf8"),
);

// The webServer seeds a fresh fake repository per run; tests run serially
// against shared state and each uses its own task where they mutate.

test.describe.configure({ mode: "serial" });

const gotoBoard = async (page, boardId = "lifecycle") => {
  await page.addInitScript((id) => localStorage.setItem("sisyphus.lastBoard", id), boardId);
  await page.goto("/");
  await expect(page.locator(".column").first()).toBeVisible();
};

test("board renders with columns, cards, and safety badge", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err));
  await gotoBoard(page);
  await expect(page.locator(".topbar .board-name")).toHaveText("Lifecycle");
  await expect(page.locator(".column")).toHaveCount(5);
  expect(await page.locator(".card").count()).toBeGreaterThan(10);
  await expect(page.locator(".fake-badge")).toBeVisible();
  expect(errors).toEqual([]);
});

test("PWA shell: manifest and service worker are served", async ({ page, request }) => {
  await gotoBoard(page);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifest = await request.get(manifestHref);
  expect(manifest.ok()).toBeTruthy();
  const manifestJson = await manifest.json();
  expect(manifestJson.name).toBe("Sisyphus");
  expect(manifestJson.background_color).toBe(theme.canvas);
  expect(manifestJson.theme_color).toBe(theme.canvas);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", theme.canvas);
  for (const icon of manifestJson.icons) {
    expect((await request.get(icon.src)).ok()).toBeTruthy();
  }
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBeTruthy();
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
});

test("keyboard move shows undo toast and undo restores", async ({ page }) => {
  await gotoBoard(page);
  await page.keyboard.press("g");
  const focused = page.locator(".card-focused");
  await expect(focused).toBeVisible();
  const title = await focused.locator(".card-title").innerText();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator(".toast", { hasText: "Moved to" })).toBeVisible();
  const ready = page.locator(".column", { has: page.getByRole("heading", { name: "Ready" }) });
  await expect(ready.locator(".card-title", { hasText: title })).toBeVisible();
  await page.keyboard.press("u");
  const backlog = page.locator(".column", {
    has: page.getByRole("heading", { name: "Backlog" }),
  });
  await expect(backlog.locator(".card-title", { hasText: title })).toBeVisible();
});

test("waiting column prompts for a date", async ({ page }) => {
  await gotoBoard(page);
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await page.locator(".move-menu button", { hasText: "Waiting" }).click();
  const dialog = page.locator(".dialog", { hasText: "Move to Waiting" });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="date"]').fill("2027-01-15");
  await dialog.locator(".btn-primary").click();
  await expect(page.locator(".toast", { hasText: "Moved to Waiting" })).toBeVisible();
});

test("create task via N lands on the board", async ({ page }) => {
  await gotoBoard(page);
  await page.keyboard.press("n");
  const dialog = page.locator(".create-dialog");
  await dialog.locator('input[placeholder="What needs doing?"]').fill("e2e created task");
  await dialog.locator(".btn-primary").click();
  await expect(page.locator(".card-title", { hasText: "e2e created task" })).toBeVisible();
});

test("daily board overdue column is read-only", async ({ page }) => {
  await gotoBoard(page, "daily");
  await expect(page.locator(".topbar .board-name")).toHaveText("Daily");
  const overdue = page.locator(".column", {
    has: page.getByRole("heading", { name: "Overdue" }),
  });
  await expect(overdue.locator(".column-lock")).toBeVisible();
});

test("collapse and sort persist across reload", async ({ page }) => {
  await gotoBoard(page);
  const backlog = page.locator(".column", {
    has: page.getByRole("heading", { name: "Backlog" }),
  });
  await backlog.locator(".column-collapse-btn").click();
  await expect(page.locator(".column-collapsed")).toHaveCount(1);
  await page.locator(".sort-button").click();
  await page.locator(".sort-menu button", { hasText: "Priority" }).click();
  await expect(page.locator(".sort-button")).toHaveText(/Priority/);
  await page.reload();
  await expect(page.locator(".column-collapsed")).toHaveCount(1);
  await expect(page.locator(".sort-button")).toHaveText(/Priority/);
  // restore defaults for later tests
  await page.locator(".sort-button").click();
  await page.locator(".sort-menu button", { hasText: "Board order" }).click();
  await page.locator(".collapsed-strip").click();
});

test("offline shows banner and disables mutations", async ({ page, context }) => {
  await gotoBoard(page);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".banner-offline")).toBeVisible();
  await expect(page.locator(".topbar-create")).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".banner-offline")).toHaveCount(0);
  await expect(page.locator(".topbar-create")).toBeEnabled();
});

test("mobile layout shows tabs and bottom bar @mobile", async ({ page }) => {
  await gotoBoard(page);
  await expect(page.locator(".mobile-tabs")).toBeVisible();
  await expect(page.locator(".bottom-bar")).toBeVisible();
  await page.locator(".mobile-tabs button", { hasText: "Backlog" }).click();
  expect(await page.locator(".card").count()).toBeGreaterThan(0);
});
