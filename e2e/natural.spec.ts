import { expect, test } from "@playwright/test";

test("editor opens a project and selects a scene node", async ({ page }) => {
  await page.goto("http://127.0.0.1:43100");
  await expect(page.getByText("NATURAL")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Arena" })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Arena" }).click();
  await expect(page.getByLabel("3D viewport")).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue("Arena");
  await page.getByRole("button", { name: "Child" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "New Node" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "New Node" })).toHaveCount(0);
  await page.getByRole("button", { name: "Play" }).click();
  const preview = page.frameLocator('iframe[title="Game preview"]');
  await expect(preview.locator("canvas#game")).toBeVisible({ timeout: 20_000 });
});

test("2D reference game reaches its playable loop", async ({ page }) => {
  await page.goto("http://127.0.0.1:43200");
  await expect(page.getByText("Natural Arena")).toBeVisible();
  await expect(page.locator("canvas#game")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-engine-ready", "true");
  await expect(page.locator("canvas#game")).toHaveScreenshot("arena-2d.png", {
    maxDiffPixelRatio: 0.03,
    threshold: 0.3,
  });
  await page.keyboard.press("KeyD");
  await page.waitForTimeout(100);
});

test("3D reference game renders the instanced world", async ({ page }) => {
  await page.goto("http://127.0.0.1:43300");
  await expect(page.getByText("Natural Sandbox")).toBeVisible();
  await expect(page.locator("canvas#game")).toBeVisible();
  await expect(page.locator("#stats")).toContainText("instances", { timeout: 20_000 });
});
