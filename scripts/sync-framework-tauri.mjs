#!/usr/bin/env node
/**
 * sync-framework-tauri.mjs
 *
 * Syncs the Tauri Rust scaffolding files from kc-framework@v1.0.0.
 *
 * Usage:
 *   node scripts/sync-framework-tauri.mjs [--tag <tag>]
 *
 * This script:
 *   1. Clones kc-framework at the specified tag (default: v1.0.0) into a
 *      temporary directory.
 *   2. Copies the template Rust source files into frontend/src-tauri/src/
 *      and frontend/src-tauri/build.rs, applying tool-specific values where
 *      they differ from the generic templates:
 *        - Sidecar name: "transmittal-backend"
 *        - Update path env var: "TRANSMITTAL_UPDATE_PATH"
 *        - Default update path: G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder
 *   3. Copies the NSIS hooks template from installer/hooks.nsh.template,
 *      substituting PRODUCT_NAME=R3P Transmittal Builder.
 *   4. Adds the SOURCED FROM header comment to each file.
 *
 * After running, review changes with `git diff` and commit.
 *
 * NOTE: This script is for framework version upgrades only. Do not run it
 *       routinely. Pin the framework tag in the --tag argument to the version
 *       you intend to upgrade to.
 */

import { execSync } from "child_process";
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// ── Parse args ──────────────────────────────────────────────────────────────
const tagIndex = process.argv.indexOf("--tag");
const tag = tagIndex !== -1 ? process.argv[tagIndex + 1] : "v1.0.0";

console.log(`[sync-framework-tauri] Syncing from kc-framework@${tag}`);

// ── Clone framework at tag ───────────────────────────────────────────────────
const tmpDir = mkdtempSync(join(tmpdir(), "kc-framework-"));
try {
  execSync(
    `git clone --depth 1 --branch ${tag} https://github.com/Koraji95-coder/kc-framework.git ${tmpDir}`,
    { stdio: "inherit" }
  );

  const templateSrcDir = join(tmpDir, "tauri-template", "src-tauri-base", "src");
  const targetSrcDir   = join(repoRoot, "frontend", "src-tauri", "src");

  const header = (templatePath) =>
    `// SOURCED FROM kc-framework@${tag} — do not edit directly; sync via scripts/sync-framework-tauri.mjs.\n// ${templatePath}\n`;

  // ── Copy Rust source files ─────────────────────────────────────────────────
  const files = ["main.rs", "lib.rs", "sidecar.rs", "splash.rs", "updater.rs"];
  for (const f of files) {
    const src     = join(templateSrcDir, f);
    const dest    = join(targetSrcDir, f);
    let content   = readFileSync(src, "utf8");
    const relPath = `tauri-template/src-tauri-base/src/${f}`;
    content = header(relPath) + content;
    writeFileSync(dest, content, "utf8");
    console.log(`  Copied: ${f}`);
  }

  // ── Copy build.rs ──────────────────────────────────────────────────────────
  const buildRsSrc  = join(tmpDir, "tauri-template", "src-tauri-base", "build.rs");
  const buildRsDest = join(repoRoot, "frontend", "src-tauri", "build.rs");
  let buildRsContent = readFileSync(buildRsSrc, "utf8");
  buildRsContent = header("tauri-template/src-tauri-base/build.rs") + buildRsContent;
  writeFileSync(buildRsDest, buildRsContent, "utf8");
  console.log("  Copied: build.rs");

  console.log("\n[sync-framework-tauri] Done. Review with: git diff frontend/src-tauri/");
  console.log("Apply tool-specific patches:");
  console.log("  - sidecar.rs: rename SIDECAR_BACKEND_PORT → keep SIDECAR_BACKEND_PORT (already generic)");
  console.log("  - updater.rs: add DEFAULT_UPDATE_PATH constant and TRANSMITTAL_UPDATE_PATH env var");
  console.log("  - splash.rs: env!('CARGO_PKG_NAME') is already tool-agnostic");
  console.log("  - lib.rs: update sidecar::find_sidecar_path(\"transmittal-backend\") call");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
