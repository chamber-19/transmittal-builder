#!/usr/bin/env node
// scripts/sync-installer-assets-local.mjs
//
// TB-local wrapper for syncing NSIS installer assets from
// @chamber-19/desktop-toolkit.
//
// WHY NOT just call `desktop-toolkit-sync-installer-assets` directly?
//
// The packaged BMPs are intentionally NOT trusted here: we have seen upstream
// releases where the SVG masters were current but the pre-rendered BMPs still
// contained stale branding text. We regenerate the BMPs locally from the synced
// SVGs on every run so the installer always reflects the current artwork.
//
// Usage (wired up in package.json as the "prebuild" script):
//   node scripts/sync-installer-assets-local.mjs

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Paths ─────────────────────────────────────────────────────────────────

// Source: @chamber-19/desktop-toolkit NSIS asset directory
const srcDir = resolve(
  __dirname,
  "../node_modules/@chamber-19/desktop-toolkit/installer/nsis"
);

// Destination: src-tauri/installer (where tauri.conf.json expects them)
const destDir = resolve(__dirname, "../src-tauri/installer");

// ── Assets to sync ────────────────────────────────────────────────────────
const SVG_ASSETS = [
  "nsis-header.svg",
  "nsis-sidebar.svg",
];

function encodeBmp24(rawRgba, width, height, bgRgb = { r: 26, g: 18, b: 16 }) {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowBytes * height;
  const fileSize = 54 + pixelBytes;

  const buf = Buffer.alloc(fileSize, 0);
  let off = 0;

  buf.write("BM", off, "ascii"); off += 2;
  buf.writeUInt32LE(fileSize, off); off += 4;
  buf.writeUInt32LE(0, off); off += 4;
  buf.writeUInt32LE(54, off); off += 4;

  buf.writeUInt32LE(40, off); off += 4;
  buf.writeInt32LE(width, off); off += 4;
  buf.writeInt32LE(height, off); off += 4;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(24, off); off += 2;
  buf.writeUInt32LE(0, off); off += 4;
  buf.writeUInt32LE(pixelBytes, off); off += 4;
  buf.writeInt32LE(2835, off); off += 4;
  buf.writeInt32LE(2835, off); off += 4;
  buf.writeUInt32LE(0, off); off += 4;
  buf.writeUInt32LE(0, off); off += 4;

  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcOff = (y * width + x) * 4;
      const r = rawRgba[srcOff];
      const g = rawRgba[srcOff + 1];
      const b = rawRgba[srcOff + 2];
      const a = rawRgba[srcOff + 3] / 255;

      const fr = Math.round(r * a + bgRgb.r * (1 - a));
      const fg = Math.round(g * a + bgRgb.g * (1 - a));
      const fb = Math.round(b * a + bgRgb.b * (1 - a));

      buf[off++] = fb;
      buf[off++] = fg;
      buf[off++] = fr;
    }

    off += rowBytes - width * 3;
  }

  return buf;
}

async function renderBmpFromSvg(svgName, bmpName, width, height) {
  const svgPath = join(destDir, svgName);
  if (!existsSync(svgPath)) {
    throw new Error(`[sync-installer-assets] Cannot render ${bmpName}: missing ${svgName}`);
  }

  const { data, info } = await sharp(readFileSync(svgPath), { density: 300 })
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bmp = encodeBmp24(data, info.width, info.height);
  writeFileSync(join(destDir, bmpName), bmp);
  console.log(`  generated: ${bmpName}`);
}

// ── Run ───────────────────────────────────────────────────────────────────

console.log("[sync-installer-assets] Syncing NSIS SVG art assets");
console.log(`  from: ${srcDir}`);
console.log(`  to:   ${destDir}`);

if (!existsSync(srcDir)) {
  console.error(
    `[sync-installer-assets] ERROR: source directory not found: ${srcDir}\n` +
      `  Make sure @chamber-19/desktop-toolkit is installed (run \`npm ci\` first).`
  );
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
  console.log("  created destination directory");
}

let copied = 0;
let skipped = 0;

for (const filename of SVG_ASSETS) {
  const src = join(srcDir, filename);
  const dest = join(destDir, filename);

  if (!existsSync(src)) {
    console.warn(`  [warn] source not found, skipping: ${filename}`);
    skipped++;
    continue;
  }

  // Idempotency: skip if dest is strictly newer than src (same-mtime → re-copy
  // to be safe against sub-second updates within filesystem timestamp granularity).
  if (existsSync(dest)) {
    const srcStat = statSync(src);
    const destStat = statSync(dest);
    if (srcStat.size === destStat.size && srcStat.mtimeMs < destStat.mtimeMs) {
      skipped++;
      continue;
    }
  }

  copyFileSync(src, dest);
  console.log(`  copied: ${filename}`);
  copied++;
}

await renderBmpFromSvg("nsis-header.svg", "nsis-header.bmp", 150, 57);
await renderBmpFromSvg("nsis-sidebar.svg", "nsis-sidebar.bmp", 164, 314);

console.log(
  `[sync-installer-assets] Done — ${copied} SVG copied, ${skipped} SVG up-to-date/skipped, 2 BMP regenerated`
);
