#!/usr/bin/env node
// scripts/sync-installer-assets-local.mjs
//
// TB-local wrapper for syncing NSIS installer assets from
// @chamber-19/desktop-toolkit.
//
// WHY NOT just call `desktop-toolkit-sync-installer-assets` directly?
//
// The upstream sync copies ALL five installer assets — including hooks.nsh.
// But hooks.nsh must be a TB-local checked-in file because the upstream
// v2.2.4 version contains:
//
//   !macro NSIS_HOOK_POSTINSTALL
//     File "${BUILD_DIR}\desktop-toolkit-updater.exe"
//   !macroend
//
// NSIS's `File` directive (compile-time file embedding) is only valid when
// the macro is defined in a Section/Function context; Tauri's NSIS template
// `!include`s the hooks file at the top level of installer.nsi, so makensis
// aborts with "command File not valid outside Section or Function".
//
// This wrapper copies only the BMP/SVG art assets (which ARE safe to
// overwrite) and leaves hooks.nsh untouched so our local override survives
// every `npm run prebuild` / `npm ci` cycle.
//
// See RELEASING.md §"Why we override hooks.nsh locally" for full context.
//
// Usage (wired up in package.json as the "prebuild" script):
//   node scripts/sync-installer-assets-local.mjs

import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
// Explicitly excludes hooks.nsh — that file is a TB-local checked-in
// override and must not be overwritten by the upstream package version.
const ART_ASSETS = [
  "nsis-header.bmp",
  "nsis-header.svg",
  "nsis-sidebar.bmp",
  "nsis-sidebar.svg",
];

// ── Run ───────────────────────────────────────────────────────────────────

console.log("[sync-installer-assets] Syncing NSIS art assets (hooks.nsh excluded)");
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

for (const filename of ART_ASSETS) {
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

console.log(
  `[sync-installer-assets] Done — ${copied} copied, ${skipped} up-to-date/skipped`
);
console.log("  hooks.nsh: preserved (TB-local override, not overwritten)");
