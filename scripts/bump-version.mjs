#!/usr/bin/env node
/**
 * bump-version.mjs — Update the app version in all three canonical places.
 *
 * Usage:
 *   node scripts/bump-version.mjs <new-version>
 *
 * Files updated:
 *   1. frontend/package.json          → "version"
 *   2. frontend/src-tauri/tauri.conf.json → "version"
 *   3. frontend/src-tauri/Cargo.toml  → [package] version
 *
 * After running this script, commit the four changed files
 * (package.json, tauri.conf.json, Cargo.toml, Cargo.lock) and tag the
 * release. Cargo.lock is updated automatically on the next `cargo build`
 * or `cargo check` — run `cargo check` inside frontend/src-tauri/ if you
 * want to refresh it before committing.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("Usage: node scripts/bump-version.mjs <version>  (e.g. 6.0.3)");
  process.exit(1);
}

// ── 1. frontend/package.json ─────────────────────────────────────────────
const pkgPath = resolve(ROOT, "frontend", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const oldPkgVersion = pkg.version;
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`frontend/package.json: ${oldPkgVersion} → ${newVersion}`);

// ── 2. frontend/src-tauri/tauri.conf.json ────────────────────────────────
const tauriConfPath = resolve(ROOT, "frontend", "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
const oldTauriVersion = tauriConf.version;
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log(`frontend/src-tauri/tauri.conf.json: ${oldTauriVersion} → ${newVersion}`);

// ── 3. frontend/src-tauri/Cargo.toml ─────────────────────────────────────
const cargoPath = resolve(ROOT, "frontend", "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf-8");
// Match the version field in the [package] section only.
// The pattern looks for [package] (optionally followed by other fields) then
// the first `version = "..."` that appears before the next section header.
const cargoVersionMatch = cargo.match(/\[package\][^\[]*?^version\s*=\s*"([^"]+)"/ms);
const oldCargoVersion = cargoVersionMatch?.[1] ?? "(unknown)";
// Replace only the version under [package] by anchoring to the section header.
cargo = cargo.replace(
  /(\[package\][^\[]*?^version\s*=\s*)"[^"]+"/ms,
  `$1"${newVersion}"`
);
writeFileSync(cargoPath, cargo);
console.log(`frontend/src-tauri/Cargo.toml: ${oldCargoVersion} → ${newVersion}`);

console.log(`\nDone. Next steps:`);
console.log(`  cd frontend/src-tauri && cargo check   # refreshes Cargo.lock`);
console.log(`  git add -A && git commit -m "chore: bump version to ${newVersion}"`);
console.log(`  git tag -a v${newVersion} -m "v${newVersion}"`);
console.log(`  git push origin main && git push origin v${newVersion}`);
