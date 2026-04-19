#!/usr/bin/env node
/**
 * generate-latest-json.mjs
 *
 * Generates the `latest.json` update manifest that the Tauri app reads from
 * the shared drive on every launch.
 *
 * Inputs (environment variables):
 *   TAG_NAME       - Git tag, e.g. "v4.1.0"
 *   INSTALLER_NAME - NSIS installer filename,
 *                    e.g. "Transmittal.Builder_6.0.0_x64-setup.exe"
 *
 * Output: latest.json written to the repository root (then uploaded as a
 * release artefact by the GitHub Actions workflow).
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// ── Resolve inputs ──────────────────────────────────────────────────────
const tagName = process.env.TAG_NAME ?? "";
const installerName = process.env.INSTALLER_NAME ?? "";

if (!tagName) {
  console.error("[generate-latest-json] TAG_NAME env var is required");
  process.exit(1);
}
if (!installerName) {
  console.error("[generate-latest-json] INSTALLER_NAME env var is required");
  process.exit(1);
}

// Strip leading "v" to get a clean semver string.
const version = tagName.replace(/^v/, "");

// ── Release notes ────────────────────────────────────────────────────────
// Use RELEASE_NOTES.md if present (written by git tag -m or a prior step),
// otherwise use a generic message.
let notes = `Transmittal Builder ${tagName}`;
const notesPath = join(process.cwd(), "RELEASE_NOTES.md");
if (existsSync(notesPath)) {
  notes = readFileSync(notesPath, "utf8").trim();
}

// ── Build the manifest ───────────────────────────────────────────────────
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  installer: installerName,
  notes,
  mandatory: true,
};

const outPath = join(process.cwd(), "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("[generate-latest-json] Written:", outPath);
console.log(JSON.stringify(manifest, null, 2));
