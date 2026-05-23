#!/usr/bin/env node
// Generates synthetic test fixtures. Run with:
//   node tests/fixtures/generate.mjs
//
// Network policy in CI/sandbox usually blocks Wikimedia/Google, so we render
// our own receipt-shaped JPEG from HTML via Playwright headless Chromium.
// The committed outputs in this directory were produced by this script.
// To use real CC-licensed receipt photos instead, drop them into
// tests/fixtures/real/ and the integration suite will pick them up.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Playwright is resolved against the globally installed package so the project
// doesn't have to install ~200MB of browsers just to run unit tests.
const playwrightPath = process.env.PLAYWRIGHT_PATH ||
  "/opt/node22/lib/node_modules/playwright";
const { chromium } = require(playwrightPath);

const HERE = dirname(fileURLToPath(import.meta.url));

const RECEIPT_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #fafafa; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; }
  .receipt { width: 360px; padding: 28px 24px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.06); margin: 24px auto; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; letter-spacing: 0.05em; }
  .sub { text-align: center; font-size: 12px; color: #555; margin-bottom: 18px; }
  .line { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
  .sep { border-top: 1px dashed #999; margin: 12px 0; }
  .tot { font-weight: 700; }
</style></head><body>
<div class="receipt">
  <h1>TRATTORIA LUNA</h1>
  <div class="sub">14 Bleecker St · 2026-05-23 · 19:42</div>
  <div class="line"><span>Margherita pizza</span><span>$14.00</span></div>
  <div class="line"><span>Caesar salad</span><span>$11.50</span></div>
  <div class="line"><span>Sparkling water</span><span>$4.00</span></div>
  <div class="line"><span>IPA pint</span><span>$8.00</span></div>
  <div class="line"><span>Tiramisu</span><span>$11.00</span></div>
  <div class="line"><span>Aperol spritz</span><span>$12.50</span></div>
  <div class="sep"></div>
  <div class="line"><span>Subtotal</span><span>$61.00</span></div>
  <div class="line"><span>Tax (8%)</span><span>$4.88</span></div>
  <div class="line"><span>Tip</span><span>$10.00</span></div>
  <div class="sep"></div>
  <div class="line tot"><span>TOTAL</span><span>$75.88</span></div>
</div></body></html>`;

const NOT_RECEIPT_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: linear-gradient(135deg, #ff7e5f, #feb47b); }
  .scene { display: flex; align-items: center; justify-content: center; height: 100%; font-family: ui-sans-serif, system-ui; }
  .blob { width: 200px; height: 200px; border-radius: 50%; background: white; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: grid; place-items: center; font-size: 64px; }
</style></head><body>
<div class="scene"><div class="blob">🌅</div></div>
</body></html>`;

async function snap(html, outName, viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: join(HERE, outName), type: "jpeg", quality: 85 });
  await browser.close();
  console.log("wrote", outName);
}

// 1x1 transparent PNG: 67 bytes, the smallest valid PNG.
function writeTinyPng() {
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  writeFileSync(join(HERE, "tiny.png"), bytes);
  console.log("wrote tiny.png");
}

function writeNotAnImage() {
  writeFileSync(
    join(HERE, "not-an-image.txt"),
    "this is plain text, not an image\n"
  );
  console.log("wrote not-an-image.txt");
}

await snap(RECEIPT_HTML, "receipt.jpg", { width: 420, height: 720 });
await snap(NOT_RECEIPT_HTML, "not-a-receipt.jpg", { width: 420, height: 420 });
writeTinyPng();
writeNotAnImage();
console.log("done");
