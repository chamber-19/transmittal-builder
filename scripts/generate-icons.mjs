// SOURCED FROM kc-framework@v1.0.0 — build-scripts/generate-icons.mjs
// Do not edit directly. Sync via: scripts/sync-framework-tauri.mjs
#!/usr/bin/env node
/**
 * generate-icons.mjs
 *
 * Reads src-tauri/icons/icon-master.svg and emits all required
 * icon sizes for Tauri + Windows Store, plus NSIS installer BMPs.
 *
 * Usage (from the frontend/ directory):
 *   npm run icons:generate
 *
 * Dependencies (devDependencies in package.json):
 *   sharp      — high-quality SVG→PNG/BMP rasterisation
 *   png-to-ico — assembles multi-resolution .ico from PNG inputs
 *
 * Output files (relative to this script's directory, i.e. frontend/):
 *   src-tauri/icons/32x32.png
 *   src-tauri/icons/128x128.png
 *   src-tauri/icons/128x128@2x.png
 *   src-tauri/icons/icon.png          (512×512 master)
 *   src-tauri/icons/icon.ico          (16/24/32/48/64/128/256)
 *   src-tauri/icons/Square*.png       (Windows Store tiles)
 *   src-tauri/icons/StoreLogo.png
 *   src-tauri/installer/nsis-header.bmp
 *   src-tauri/installer/nsis-sidebar.bmp
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

// When run via `npm run icons:generate` from the frontend/ directory,
// process.cwd() = frontend/.  This is used as the root for Tauri paths.
// __dirname here is scripts/ (at repo root), so we can't rely on it.
const root = process.cwd();  // = frontend/ when invoked via npm run

// ── Paths ─────────────────────────────────────────────────────────────────
const ICON_MASTER_SVG    = join(root, "src-tauri/icons/icon-master.svg");
const NSIS_HEADER_SVG    = join(root, "src-tauri/installer/nsis-header.svg");
const NSIS_SIDEBAR_SVG   = join(root, "src-tauri/installer/nsis-sidebar.svg");
const ICONS_DIR          = join(root, "src-tauri/icons");
const INSTALLER_DIR      = join(root, "src-tauri/installer");

mkdirSync(ICONS_DIR,    { recursive: true });
mkdirSync(INSTALLER_DIR, { recursive: true });

// Read SVG buffers
const masterSvg  = readFileSync(ICON_MASTER_SVG);
const headerSvg  = readFileSync(NSIS_HEADER_SVG);
const sidebarSvg = readFileSync(NSIS_SIDEBAR_SVG);

// ── Helper: rasterise an SVG buffer to PNG at a given size ────────────────
async function svgToPng(svgBuf, width, height, outPath) {
  await sharp(svgBuf, { density: 300 })
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`  ✓  ${outPath.replace(root + "/", "")}`);
}

// ── Step 1: Standard icon PNGs ───────────────────────────────────────────
console.log("\n[1/4] Generating PNG icons…");

const pngSizes = [
  { w: 32,  h: 32,  name: "32x32.png" },
  { w: 128, h: 128, name: "128x128.png" },
  { w: 256, h: 256, name: "128x128@2x.png" },
  { w: 512, h: 512, name: "icon.png" },
];

for (const { w, h, name } of pngSizes) {
  await svgToPng(masterSvg, w, h, join(ICONS_DIR, name));
}

// ── Step 2: Windows Store tile PNGs ──────────────────────────────────────
console.log("\n[2/4] Generating Windows Store tile PNGs…");

const storeSizes = [
  { w: 30,  h: 30,  name: "Square30x30Logo.png" },
  { w: 44,  h: 44,  name: "Square44x44Logo.png" },
  { w: 71,  h: 71,  name: "Square71x71Logo.png" },
  { w: 89,  h: 89,  name: "Square89x89Logo.png" },
  { w: 107, h: 107, name: "Square107x107Logo.png" },
  { w: 142, h: 142, name: "Square142x142Logo.png" },
  { w: 150, h: 150, name: "Square150x150Logo.png" },
  { w: 284, h: 284, name: "Square284x284Logo.png" },
  { w: 310, h: 310, name: "Square310x310Logo.png" },
  { w: 50,  h: 50,  name: "StoreLogo.png" },
];

for (const { w, h, name } of storeSizes) {
  await svgToPng(masterSvg, w, h, join(ICONS_DIR, name));
}

// ── Step 3: Multi-resolution ICO ─────────────────────────────────────────
console.log("\n[3/4] Assembling icon.ico (16/24/32/48/64/128/256)…");

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs  = [];

for (const sz of icoSizes) {
  const tmpPath = join(ICONS_DIR, `_ico_tmp_${sz}.png`);
  await svgToPng(masterSvg, sz, sz, tmpPath);
  icoPngs.push(readFileSync(tmpPath));
}

const icoBuffer = await pngToIco(icoPngs);
const icoPath = join(ICONS_DIR, "icon.ico");
writeFileSync(icoPath, icoBuffer);
console.log(`  ✓  src-tauri/icons/icon.ico (${icoSizes.join("/")} px)`);

// Clean up temp files
import { unlinkSync } from "fs";
for (const sz of icoSizes) {
  try { unlinkSync(join(ICONS_DIR, `_ico_tmp_${sz}.png`)); } catch { /* ok */ }
}

// ── Step 4: NSIS installer BMPs ───────────────────────────────────────────
console.log("\n[4/4] Generating NSIS installer BMPs…");

/**
 * Encode raw RGBA pixel data (top-to-bottom) to a Windows BMP v3 buffer.
 */
function encodeBmp24(rawRgba, width, height, bgRgb = { r: 26, g: 18, b: 16 }) {
  const rowBytes   = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowBytes * height;
  const fileSize   = 54 + pixelBytes;

  const buf = Buffer.alloc(fileSize, 0);
  let off = 0;

  buf.write("BM", off, "ascii");                     off += 2;
  buf.writeUInt32LE(fileSize, off);                  off += 4;
  buf.writeUInt32LE(0, off);                         off += 4;
  buf.writeUInt32LE(54, off);                        off += 4;

  buf.writeUInt32LE(40, off);                        off += 4;
  buf.writeInt32LE(width, off);                      off += 4;
  buf.writeInt32LE(height, off);                     off += 4;
  buf.writeUInt16LE(1, off);                         off += 2;
  buf.writeUInt16LE(24, off);                        off += 2;
  buf.writeUInt32LE(0, off);                         off += 4;
  buf.writeUInt32LE(pixelBytes, off);                off += 4;
  buf.writeInt32LE(2835, off);                       off += 4;
  buf.writeInt32LE(2835, off);                       off += 4;
  buf.writeUInt32LE(0, off);                         off += 4;
  buf.writeUInt32LE(0, off);                         off += 4;

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
    const pad = rowBytes - width * 3;
    off += pad;
  }

  return buf;
}

// nsis-header.bmp — 150×57 px
{
  const { data, info } = await sharp(headerSvg, { density: 300 })
    .resize(150, 57, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bmp = encodeBmp24(data, info.width, info.height, { r: 26, g: 18, b: 16 });
  writeFileSync(join(INSTALLER_DIR, "nsis-header.bmp"), bmp);
  console.log("  ✓  src-tauri/installer/nsis-header.bmp (150×57)");
}

// nsis-sidebar.bmp — 164×314 px
{
  const { data, info } = await sharp(sidebarSvg, { density: 300 })
    .resize(164, 314, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bmp = encodeBmp24(data, info.width, info.height, { r: 26, g: 18, b: 16 });
  writeFileSync(join(INSTALLER_DIR, "nsis-sidebar.bmp"), bmp);
  console.log("  ✓  src-tauri/installer/nsis-sidebar.bmp (164×314)");
}

console.log("\n✅  All icon assets generated successfully.\n");
