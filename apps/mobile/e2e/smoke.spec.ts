import { expect, test } from "@playwright/test";

// Drives the phase machine end-to-end against the Expo web export. Web has
// no native picker, so the host short-circuits to the mock fixture via
// Platform.OS === "web" (see apps/mobile/app/index.tsx). M4 removed the
// dev-only "Show error" hatch on Start — the error/retry leg of this smoke
// is verified by jest in apps/mobile/src/lib/extractFromPicker.test.ts now.
// Records a video of the whole flow + writes a keyframe screenshot at each
// notable state transition. The artifacts land in e2e/artifacts/.
test("phase machine: start → load → bill → assign → toggle → reset", async ({ page }, testInfo) => {
  const shot = async (name: string) => {
    const file = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    await testInfo.attach(name, { path: file, contentType: "image/png" });
  };

  // --- Start screen ---
  await page.goto("/");
  await expect(page.getByText("Split the bill").first()).toBeVisible();
  await expect(page.getByTestId("start-take-photo")).toBeVisible();
  await expect(page.getByTestId("start-choose-library")).toBeVisible();
  await shot("01-start");

  // Tap "Take photo" → LoadingScreen
  await page.getByTestId("start-take-photo").click();
  await expect(page.getByTestId("loading-spinner")).toBeVisible();
  await shot("02-loading");

  // After the 700 ms fake latency, BillReview shows up.
  await expect(page.getByTestId("section-unassigned")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("totals-footer")).toBeVisible();
  await shot("03-bill-loaded");

  // Tap the first unassigned row — it should move to the You section.
  const firstUnassignedRow = page
    .getByTestId("section-unassigned")
    .locator('[data-testid^="row-"]')
    .first();
  const rowId = await firstUnassignedRow.getAttribute("data-testid");
  await firstUnassignedRow.click();
  await expect(page.getByTestId("section-you")).toBeVisible();
  if (rowId) {
    await expect(page.getByTestId("section-you").locator(`[data-testid="${rowId}"]`)).toBeVisible();
  }
  await shot("04-assigned-to-you");

  // Tap the same row again — second tap cycles to Them.
  if (rowId) {
    await page.getByTestId("section-you").locator(`[data-testid="${rowId}"]`).click();
    await expect(page.getByTestId("section-them").locator(`[data-testid="${rowId}"]`)).toBeVisible();
  }
  await shot("05-assigned-to-them");

  // Toggle the Tax inclusive switch — Them's total should drop because
  // Margherita pizza is assigned to Them and its tax share goes away.
  const themBefore = await page.getByTestId("totals-them").textContent();
  const taxSwitch = page.getByTestId("toggle-tax").locator('input[type="checkbox"]');
  await taxSwitch.check({ force: true });
  await page.waitForTimeout(200);
  const themAfter = await page.getByTestId("totals-them").textContent();
  expect(themAfter).not.toBe(themBefore);
  await shot("06-tax-inclusive-on");

  // "↻ New bill" returns to the Start screen.
  await page.getByTestId("bill-reset").click();
  await expect(page.getByTestId("start-take-photo")).toBeVisible();
  await shot("07-back-to-start");
});
