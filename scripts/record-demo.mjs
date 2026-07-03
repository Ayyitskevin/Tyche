// Regenerate docs/assets/demo.gif — the animated terminal walkthrough used in
// the README and landing page. Deterministic (mock provider), no video tooling.
//
// Prereqs:
//   1. The app running locally:  pnpm demo   (or: pnpm dev)  → http://localhost:5173
//   2. The two encode-only deps (kept OUT of the repo's package.json):
//        npm i --no-save gifenc upng-js
//   3. Chromium (this repo's Playwright browser).
//
// Run:  node scripts/record-demo.mjs [out.gif] [http://localhost:5173]
//
// It drives ⌘K → AAPL GP → HEAT (Sectors) → ETH DEX → FUND → W, capturing frames
// as the panels build, then encodes a small looping GIF with a shared palette.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
let gifenc, UPNG;
try {
  gifenc = (await import('gifenc')).default;
  UPNG = (await import('upng-js')).default ?? (await import('upng-js'));
} catch {
  console.error('Missing encode deps. Run:  npm i --no-save gifenc upng-js');
  process.exit(1);
}
const { GIFEncoder, quantize, applyPalette } = gifenc;

const OUT = process.argv[2] || new URL('../docs/assets/demo.gif', import.meta.url).pathname;
const BASE = process.argv[3] || 'http://localhost:5173/';
const W = 1000;
const H = 620;

const browser = await chromium.launch({
  executablePath: process.env.TYCHE_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

async function run(cmd) {
  const input = page.getByLabel('Command input');
  await input.click();
  await input.fill(cmd);
  await input.press('Enter');
}

const frames = [];
async function grab(delay = 220) {
  const img = UPNG.decode(await page.screenshot({ type: 'png' }));
  frames.push({ rgba: new Uint8Array(UPNG.toRGBA8(img)[0]), delay });
}
async function beat(cmd, { pre = 400, shots = 3, gap = 240 } = {}) {
  await run(cmd);
  await page.waitForTimeout(pre);
  for (let i = 0; i < shots; i++) {
    await grab();
    await page.waitForTimeout(gap);
  }
}

await page.waitForTimeout(600);
await grab(700);
await grab(500);
await beat('AAPL GP', { pre: 700, shots: 5, gap: 260 });
await beat('HEAT', { pre: 500, shots: 2 });
await page.getByRole('button', { name: 'Sectors' }).click();
await page.waitForTimeout(500);
await grab();
await grab();
await beat('ETH DEX', { pre: 700, shots: 3 });
await beat('FUND', { pre: 500, shots: 3 });
await beat('W', { pre: 400, shots: 2 });
await grab(500);
await grab(2200);
await browser.close();

// Shared global palette from a few representative frames → smaller, stable GIF.
const sampleIdx = [4, 9, 14, frames.length - 1].filter((i) => i >= 0 && i < frames.length);
const sample = new Uint8Array(sampleIdx.length * W * H * 4);
sampleIdx.forEach((fi, k) => sample.set(frames[fi].rgba, k * W * H * 4));
const palette = quantize(sample, 256, { format: 'rgba4444' });

const gif = GIFEncoder();
for (const f of frames) gif.writeFrame(applyPalette(f.rgba, palette, 'rgba4444'), W, H, { palette, delay: f.delay });
gif.finish();
writeFileSync(OUT, gif.bytes());
console.log(`wrote ${OUT}: ${frames.length} frames, ${(gif.bytes().length / 1e6).toFixed(2)} MB`);
