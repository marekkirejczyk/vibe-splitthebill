#!/usr/bin/env node
// Generates the app icon / adaptive-icon / splash / favicon PNGs from the
// approved "Split the Bill — Mobile" Figma design
// (https://www.figma.com/design/yDOs60DEcPKCIvBEbMPtRD, "Icon — master" et al).
//
// Why render here instead of exporting from Figma: the deployment sandbox's
// network policy only allows api.anthropic.com + the git remote, so Figma's
// asset CDN is unreachable. We reproduce the vector mark in HTML/CSS (exact
// colors, geometry and the 7° middle-card tilt lifted from the Figma nodes)
// and rasterize it with headless Chromium — the same Playwright technique
// tests/fixtures/generate.mjs already uses. Re-run after a design change:
//   node apps/mobile/assets/generate-icons.mjs
//
// The committed PNGs in this directory are the output of this script.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright";
const { chromium } = require(playwrightPath);

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- design tokens (from theme.ts gradient + the Figma icon nodes) ----
const GRADIENT = "linear-gradient(145deg, #f97316 14.1%, #ec4899 85.901%)";
const BAR = "#d1d5db"; // item-name bar
const PILL_DARK = "#111927"; // price pill on the white cards
const PILL_ROSE = "#e11d6f"; // price pill on the tilted pink card
const CARD_WHITE = "#ffffff";
const CARD_PINK = "#fde7f1";
const MONO = "#111927"; // monochrome silhouette (Android tints via alpha)

// One 360x84 r20 card. `solid` collapses it to a single-color silhouette.
function card({ left, top, rotate = 0, bg, pill, shadow, solid }) {
  const inner = solid
    ? ""
    : `
      <div style="position:absolute;left:26px;top:34px;width:150px;height:16px;border-radius:8px;background:${BAR};"></div>
      <div style="position:absolute;left:270px;top:27px;width:64px;height:30px;border-radius:15px;background:${pill};"></div>`;
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:360px;height:84px;border-radius:20px;background:${bg};box-shadow:${shadow};transform:rotate(${rotate}deg);transform-origin:center;overflow:hidden;">${inner}</div>`;
}

// The three stacked cards. Middle card is centered at (608,512) rotated 7°.
function mark({ solid = false } = {}) {
  const whiteBg = solid ? MONO : CARD_WHITE;
  const pinkBg = solid ? MONO : CARD_PINK;
  const shTop = solid ? "none" : "0px 8px 20px rgba(0,0,0,0.14)";
  const shMid = solid ? "none" : "0px 16px 34px rgba(0,0,0,0.28)";
  return [
    card({ left: 316, top: 360, bg: whiteBg, pill: PILL_DARK, shadow: shTop, solid }),
    card({ left: 428, top: 470, rotate: 7, bg: pinkBg, pill: PILL_ROSE, shadow: shMid, solid }),
    card({ left: 316, top: 580, bg: whiteBg, pill: PILL_DARK, shadow: shTop, solid }),
  ].join("");
}

// A 1024x1024 stage. `panelBg` is the fill behind the mark (gradient / none);
// `radius` rounds the panel (used by the splash tile); `cards` picks the mark.
function html({ panelBg, radius = 0, cards = "full" }) {
  const markHtml = cards === "none" ? "" : mark({ solid: cards === "solid" });
  const bg = panelBg === "gradient" ? GRADIENT : "transparent";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;}
    #stage{position:relative;width:1024px;height:1024px;border-radius:${radius}px;background:${bg};overflow:hidden;}
  </style></head><body><div id="stage">${markHtml}</div></body></html>`;
}

const TARGETS = [
  // iOS + the source all platforms derive from. Full-bleed, opaque.
  { file: "icon.png", size: 1024, opaque: true, opts: { panelBg: "gradient", cards: "full" } },
  // Android adaptive layers.
  { file: "android-icon-foreground.png", size: 1024, opaque: false, opts: { panelBg: "none", cards: "full" } },
  { file: "android-icon-background.png", size: 1024, opaque: true, opts: { panelBg: "gradient", cards: "none" } },
  { file: "android-icon-monochrome.png", size: 1024, opaque: false, opts: { panelBg: "none", cards: "solid" } },
  // Splash: a rounded icon tile, centered by expo-splash-screen over #f5f5f4.
  { file: "splash-icon.png", size: 1024, opaque: false, opts: { panelBg: "gradient", cards: "full", radius: 224 } },
  // Web tab icon.
  { file: "favicon.png", size: 48, opaque: true, opts: { panelBg: "gradient", cards: "full" } },
];

const browser = await chromium.launch();
try {
  for (const t of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 1024 },
      deviceScaleFactor: t.size / 1024,
    });
    await page.setContent(html(t.opts), { waitUntil: "load" });
    const stage = await page.$("#stage");
    const buf = await stage.screenshot({ omitBackground: !t.opaque });
    writeFileSync(join(HERE, t.file), buf);
    await page.close();
    console.log(`wrote ${t.file} (${t.size}x${t.size})`);
  }
} finally {
  await browser.close();
}
