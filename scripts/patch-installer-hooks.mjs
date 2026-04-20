#!/usr/bin/env node
// scripts/patch-installer-hooks.mjs
//
// Post-sync patch for the NSIS hooks.nsh copied from
// @chamber-19/desktop-toolkit by `desktop-toolkit-sync-installer-assets`.
//
// The framework template uses ${TOOL_SIDECAR_NAME} as a placeholder.
// Tauri's NSIS template defines ${PRODUCT_NAME} automatically, but
// ${TOOL_SIDECAR_NAME} must be defined by the consumer.  This script
// prepends the required !define to the synced hooks.nsh so NSIS can
// resolve the variable at compile time.
//
// Run automatically via `prebuild` in frontend/package.json:
//   "prebuild": "desktop-toolkit-sync-installer-assets && node scripts/patch-installer-hooks.mjs"

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// ── Constants ──────────────────────────────────────────────────────────────

/** PyInstaller sidecar binary name (without .exe). */
const SIDECAR_NAME = "transmittal-backend";

/** Sentinel comment that prevents double-patching on re-runs. */
const PATCH_SENTINEL = "!define TOOL_SIDECAR_NAME";

// ── Locate hooks.nsh ───────────────────────────────────────────────────────

// When this script is run via `npm run prebuild` from the frontend/ directory
// or from the repo root, cwd varies.  Try both common layouts.
const cwd = process.cwd();
const candidates = [
  join(cwd, "src-tauri", "installer", "hooks.nsh"),
  join(cwd, "frontend", "src-tauri", "installer", "hooks.nsh"),
];

let hooksPath = null;
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    hooksPath = candidate;
    break;
  }
}

if (!hooksPath) {
  // hooks.nsh hasn't been synced yet — sync script should have run first.
  console.warn(
    "[patch-installer-hooks] hooks.nsh not found — skipping patch.\n" +
      "  Ensure desktop-toolkit-sync-installer-assets ran before this script."
  );
  process.exit(0);
}

// ── Read, patch, write ─────────────────────────────────────────────────────

const original = readFileSync(hooksPath, "utf8");

if (original.includes(PATCH_SENTINEL)) {
  console.log("[patch-installer-hooks] hooks.nsh already patched — skipping.");
  process.exit(0);
}

const nsisDefine = `; TB-specific token: sidecar binary name used by the kill macro.\n!define TOOL_SIDECAR_NAME "${SIDECAR_NAME}"\n\n`;
const patched = nsisDefine + original;

writeFileSync(hooksPath, patched, "utf8");
console.log(
  `[patch-installer-hooks] Patched hooks.nsh — set TOOL_SIDECAR_NAME="${SIDECAR_NAME}"`
);
