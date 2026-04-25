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

import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

// ── Resolve inputs ──────────────────────────────────────────────────────
const tagName = process.env.TAG_NAME ?? "";
// softprops/action-gh-release (and Tauri's NSIS bundler) replace spaces with
// dots in the uploaded artifact filename, so normalise here to ensure the
// value we write into latest.json matches the file users actually download.
const installerName = (process.env.INSTALLER_NAME ?? "").replace(/ /g, ".");

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
// Extract the matching ## [<version>] section from CHANGELOG.md.
// Fails loudly if the section is not found — a missing entry for a tagged
// release is a bug we want to catch in CI before publishing.
const changelogPath = join(process.cwd(), "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");

const escapedVersion = version.replace(/\./g, "\\.");
const headingRe = new RegExp(`^## \\[${escapedVersion}\\]`, "m");
const sectionStart = changelog.search(headingRe);
if (sectionStart === -1) {
  console.error(
    `[generate-latest-json] CHANGELOG.md has no section for version ${version}`
  );
  process.exit(1);
}
const fromSection = changelog.slice(sectionStart);
const bodyStart = fromSection.indexOf("\n") + 1;
const body = fromSection.slice(bodyStart);
const nextHeading = body.match(/^## \[/m);
const sectionBody = nextHeading ? body.slice(0, nextHeading.index) : body;
const notes = sectionBody.trim();

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
