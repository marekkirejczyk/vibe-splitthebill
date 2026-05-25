import { expect, test, type Locator, type Page } from "@playwright/test";

// Drives the phase machine end-to-end against the Expo web export. Web has
// no native picker, so the host short-circuits to the mock fixture via
// Platform.OS === "web" (see apps/mobile/app/index.tsx). M5 replaced the
// M3 tap-to-cycle SwipeableRow with a real Gesture.Pan implementation, so
// this e2e drives row assignment via mouse-drag instead of .click().
// react-native-gesture-handler's web build accepts the pointer sequence
// below; if it flakes, the documented fallback in plan-m5.md §M5.5 is an
// env-gated test seam — prefer the explicit seam over coverage loss.
// Records a video of the whole flow + writes a keyframe screenshot at each
// notable state transition. The artifacts land in e2e/artifacts/.

async function swipeRow(
  page: Page,
  locator: Locator,
  direction: "left" | "right",
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("row has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + (direction === "left" ? -120 : 120);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Step through the move so gesture-handler's activeOffsetX engages
  // before END. A single .move() can register as a tap on web.
  await page.mouse.move((startX + endX) / 2, startY, { steps: 8 });
  await page.mouse.move(endX, startY, { steps: 8 });
  await page.mouse.up();
}

test("phase machine: start → load → bill → swipe → toggle → reset", async ({ page }, testInfo) => {
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

  // Swipe the first unassigned row left — null + left → "you" via nextAssignee.
  const firstUnassignedRow = page
    .getByTestId("section-unassigned")
    .locator('[data-testid^="row-"]')
    .first();
  const rowId = await firstUnassignedRow.getAttribute("data-testid");
  await swipeRow(page, firstUnassignedRow, "left");
  await expect(page.getByTestId("section-you")).toBeVisible();
  if (rowId) {
    await expect(page.getByTestId("section-you").locator(`[data-testid="${rowId}"]`)).toBeVisible();
  }
  await shot("04-assigned-to-you");

  // Swipe the same row right — "you" + right → "them".
  if (rowId) {
    const youRow = page.getByTestId("section-you").locator(`[data-testid="${rowId}"]`);
    await swipeRow(page, youRow, "right");
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

// M5-specific: the swipe underlay reveal + the 70 px commit threshold. The
// phase-machine test above only does full past-threshold swipes; this one
// holds a sub-threshold drag (to screenshot the "Them ←" underlay) and
// proves a below-threshold release does NOT commit, then contrasts with a
// full swipe that does. Complements the jest threshold unit test with
// visual + integration evidence on the real gesture-handler-web pipeline.
test("M5 swipe: underlay reveal + 70px threshold (sub-threshold cancels)", async ({ page }, testInfo) => {
  const shot = async (name: string) => {
    const file = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    await testInfo.attach(name, { path: file, contentType: "image/png" });
  };

  await page.goto("/");
  await page.getByTestId("start-take-photo").click();
  await expect(page.getByTestId("section-unassigned")).toBeVisible({ timeout: 5_000 });

  const row = page
    .getByTestId("section-unassigned")
    .locator('[data-testid^="row-"]')
    .first();
  const rowId = await row.getAttribute("data-testid");
  const box = await row.boundingBox();
  if (!box) throw new Error("row has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  // Drag RIGHT ~60 px and HOLD — below the 70 px commit threshold. The
  // left-positioned underlay (rightDir = nextAssignee(null,"right") = them)
  // fades in showing "Them ←".
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY, { steps: 5 });
  await page.mouse.move(startX + 60, startY, { steps: 5 });
  // Scope to the dragged row — every row renders its own underlays.
  await expect(row.getByText("Them ←")).toBeVisible();
  await shot("08-underlay-revealed");

  // Release below threshold → spring back, NO commit.
  await page.mouse.up();
  await expect(
    page.getByTestId("section-unassigned").locator(`[data-testid="${rowId}"]`),
  ).toBeVisible();
  await expect(page.getByTestId("section-you")).toHaveCount(0);
  await expect(page.getByTestId("section-them")).toHaveCount(0);
  await shot("09-below-threshold-no-commit");

  // Now a full past-threshold swipe right DOES commit → Them section.
  await swipeRow(page, row, "right");
  await expect(
    page.getByTestId("section-them").locator(`[data-testid="${rowId}"]`),
  ).toBeVisible();
  await shot("10-past-threshold-commit");
});
