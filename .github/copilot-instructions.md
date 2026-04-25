# Copilot Instructions

> **Repo:** `chamber-19/transmittal-builder`
> **Role:** Standalone Tauri app for generating engineering transmittals

These instructions apply to GitHub Copilot (chat, agent mode, and code suggestions) when working in this repository. They are the same across every repo in the Chamber 19 tool family — what changes is the top matter above and the repo-specific rules at the bottom.

---

## Architecture context

This repo is part of the **Chamber 19 tool family**, a coordinated set of engineering tools with clear separation of concerns. Before making changes, understand which repo you're in and how it relates to the others.

### Repo roles

| Repo | Role | Language / stack |
|---|---|---|
| `chamber-19/desktop-toolkit` | Shared framework for Tauri desktop apps (splash, updater, NSIS installer, Python sidecar plumbing) | Rust + JS + Python + NSIS |
| `chamber-19/autocad-pipeline` | Shared MSBuild props + csproj template for AutoCAD .NET plugins | MSBuild XML only |
| `chamber-19/object-totaler` | AutoCAD plugin: `TOTAL` and `TOTALSIM` commands for curve length totaling | C# / .NET, consumes `autocad-pipeline` |
| `chamber-19/launcher` | Tauri shell that installs, updates, and launches Chamber 19 tools | Rust + React, consumes `desktop-toolkit` |
| `chamber-19/transmittal-builder` | Standalone Tauri app for generating engineering transmittals | Rust + React + Python, consumes `desktop-toolkit` |

This repo is a **consumer of `desktop-toolkit`**. A toolkit release does not auto-propagate here — this repo pins an explicit version in `frontend/package.json` and `frontend/src-tauri/Cargo.toml`, and bumping those pins is a deliberate, reviewable action.

### Non-goals for this family

- **No Suite-style infrastructure.** The `Koraji95-coder/Suite` repo is a reference implementation that over-built shared infrastructure before tools existed. Don't reconstruct it. Every abstraction in this family must be extracted from at least two working concrete implementations.
- **No speculative shared code.** If a "helper" or "common utility" would be used by only one consumer today, it stays in that consumer. Duplication across two repos is tolerable; premature abstraction is not.
- **No multi-phase rollouts with layered toolkits.** Ship the smallest working thing, then extract from real duplication.

### Architectural decisions that persist across sessions

Use GitHub Copilot Memory (visible at Repo Settings → Copilot → Memory) to recall and update these as decisions evolve. Current state:

1. **`autocad-pipeline` is deliberately minimal.** v0.1.0 contains only `Directory.Build.props` and a parameterized `Plugin.csproj.template`. No shared C# code. No NuGet packages. No PowerShell scripts. These get added when plugin #2 exists and reveals concrete duplication, not before.
2. **AutoCAD plugin commands use bare names, no prefix.** `TOTAL`, not `CH19TOTAL`. The Chamber 19 identity lives in package metadata, not in every command typed at the AutoCAD command line.
3. **Launcher is the installer/updater for AutoCAD plugins.** It does not ship plugin source code. Plugins live in their own repos (e.g. `object-totaler`). Launcher fetches their releases from GitHub and installs the DLL to `%APPDATA%\Chamber19\AutoCAD\`, managing NETLOAD via the user's `acaddoc.lsp`.
4. **GitHub Releases is the distribution channel, not a network share.** Even for internal use. This keeps engineers on VPN-optional workflows and is ready for external distribution if that ever happens.
5. **Plugins and the launcher release on independent tags.** Plugin tags follow the form `v0.1.0` within their own repo. Launcher has its own version. A launcher update does not imply a plugin update and vice versa.
6. **The launcher repo was renamed from `shopvac` to `launcher`.** Old clones need `git remote set-url`. GitHub's redirect handles URLs automatically but don't rely on it in documentation.
7. **GitHub Packages versions are immutable.** A bad `@chamber-19/desktop-toolkit` release cannot be yanked cleanly. When a toolkit release breaks this repo, fix forward with a new patch version upstream rather than trying to recall the bad one.

When making a decision that affects another repo or that future sessions need to respect, persist it to Copilot Memory. Explicit state beats re-derivation every time.

### Memory scope — what to persist

GitHub Copilot Memory is enabled on this repo. Memories persist across sessions, are repo-scoped, tagged by agent and model, and auto-expire. The user can review and curate them at Repo Settings → Copilot → Memory.

**Persist to Copilot Memory:**

- Repo-specific discoveries that aren't in this instructions file (e.g. "Publish-to-drive uses version-matching glob because `Select-Object -First 1` caused the v6.2.2 incident")
- Version-pin contracts with `desktop-toolkit` (e.g. "transmittal-builder v6.3.x expects desktop-toolkit ^2.2.6+")
- Deviations from documented conventions
- Recurring traps that cost time to discover

**Do NOT persist to memory:**

- Architectural decisions that belong in this instructions file (they're more durable there, and they load every session)
- Cross-repo context that applies family-wide (belongs in this file's shared section)
- Per-PR context (PR title, branch name, transient commit hashes)
- Debugging state from a single session
- File contents — re-read files when needed, don't cache them in memory
- Anything you could infer by reading current files in the repo

When in doubt, prefer to re-read the repo over trusting stale memory. Memory is for repo-specific discoveries, not the shape of permanent decisions — those go in this file.

---

## Scope and style

### Coding style

- **Match the style already in the file.** Don't introduce a new formatting convention in a repo that has a consistent one. Read neighboring files first.
- **Be concise.** No explanatory comments on obvious code. Comments explain *why*, not *what*.
- **No scope creep.** If asked to fix a bug, fix the bug. Don't also refactor the surrounding code "while you're there" unless explicitly asked.
- **Prefer editing over rewriting.** When given a file to modify, produce a minimal diff. Don't rewrite the whole file to apply a one-line change.

### Response style in chat

- Match the length of the question. Short questions get short answers.
- Be direct. If a request is a bad idea, say so and explain why rather than complying silently.
- Don't narrate what you're about to do before doing it. Just do it, then describe the result if relevant.
- If uncertain, say you're uncertain. Don't fabricate confidence.

### When to push back

Actively push back when the user:

- Proposes reconstructing Suite-style infrastructure (e.g. a shared controller exe, a named-pipe RPC layer, a multi-layer toolkit with 4+ components) before there's concrete duplication justifying it
- Suggests building an abstraction "because we'll probably need it" — ask whether the need is experience-based or prediction-based
- Wants to combine scoped work (e.g. "while we're renaming the repo, let's also add the installer logic") — keep unrelated changes in separate PRs
- Wants to combine a `desktop-toolkit` pin bump with feature work in the same PR — separate them, because pin-bump PRs need to be reviewable as pin-bump PRs

---

## MCP server usage

This repo has MCP servers configured via the GitHub coding agent settings. Use them actively; don't work from assumptions when a tool can give you real data.

### `github` — preferred for anything on github.com

- Use `get_file_contents`, `search_code`, `list_commits`, `get_pull_request_diff`, etc. over `fetch` when the target is a GitHub URL
- Use `create_or_update_file`, `push_files`, and `delete_file` for direct commits instead of going through the `git` server when the change is narrow and well-scoped
- Use `create_issue`, `create_pull_request`, `create_branch` rather than asking the user to do these manually
- Use `list_workflow_runs` + `get_workflow_run` + `list_workflow_jobs` + `download_workflow_run_logs` to diagnose CI failures instead of asking the user to paste logs
- Use `list_releases` and `get_release` when checking version state across repos (especially `desktop-toolkit` when planning pin bumps)
- Use `list_secret_scanning_alerts` and `list_code_scanning_alerts` when reviewing security posture or assessing dependency-bump PRs

### `git` — local repo operations

- Use `git_status`, `git_diff`, `git_log`, `git_blame` freely to orient yourself
- Use `git_add`, `git_commit`, `git_branch`, `git_checkout`, `git_create_branch` for safe local operations. Use `git` for multi-file changes that need careful staging.
- **Never use destructive operations** (`git_reset`, `git_clean`, force-push equivalents) without explicit confirmation in chat first

### `filesystem` — scoped to `/workspaces`

- Read and write files in the current repo freely
- Don't write outside the current repo directory
- Prefer `github.get_file_contents` when you need a file from a *different* Chamber 19 repo

### `fetch` — non-GitHub URLs

- Use only for URLs that aren't on github.com

### `sequential-thinking`

- Use for any plan with 3+ dependent steps, especially cross-repo work (e.g. coordinating a `desktop-toolkit` bump with consumer testing here)
- Use when debugging a multi-step failure where the root cause isn't obvious

### `time`

- Use for CHANGELOG entry dates, release tags, and any ISO-formatted timestamp
- Do not guess the current date from memory — always fetch it via this server

### `svgmaker`

- Use for generating or editing SVG icons and illustrations
- Match the Chamber 19 design system: warm neutral backgrounds, copper (`#C4884D`) accent for primary elements, flat / geometric / single-weight strokes
- Prefer editing an existing SVG when iterating rather than regenerating from a prompt

---

## Design system

Shared visual language across all Chamber 19 tools:

### Colors

- **Background neutral (dark):** `#1C1B19`
- **Accent (copper):** `#C4884D`
- **Success:** `#6B9E6B`
- **Warning:** `#C4A24D`
- **Error:** `#B85C5C`
- **Info:** `#5C8EB8`

### Typography

- **Body:** DM Sans
- **Technical / data / filenames / drawing numbers:** JetBrains Mono
- **Display / headers:** Instrument Serif

### Tone

- Warm industrial. Engineering-grade, not corporate-slick.
- Short, matter-of-fact copy. Avoid marketing voice.
- No emoji in UI copy or product names (in commit messages or chat, fine).

---

## Release conventions

### Versioning

- All repos use **SemVer** (`vMAJOR.MINOR.PATCH`)
- Breaking changes require a major version bump and a MIGRATION.md entry
- Libraries (`desktop-toolkit`, `autocad-pipeline`) publish immutable version tags — downstream consumers pin exact versions
- Consumer apps (`launcher`, `object-totaler`, `transmittal-builder`) can use `^x.y.z` ranges when depending on libraries

### Tags

- Single-tool repos: `v0.1.0`
- Never use decorated tags like `release-0.1.0` — the repo context makes the tool name redundant

### Release artifacts

- **Tauri app releases** must include:
  - The NSIS installer `.exe`
  - A `latest.json` manifest for the Tauri updater
  - Signature files for auto-update verification
  - Release notes linking to the CHANGELOG entry

### CHANGELOG

Every repo has a `CHANGELOG.md` following Keep a Changelog conventions. Every release tag must have a corresponding CHANGELOG entry. Unreleased changes accumulate under an `## [Unreleased]` heading and get promoted to a versioned heading at release time.

---

## PR and commit conventions

### Commit messages

- Imperative mood: `add plugin installer` not `added plugin installer`
- No period at the end of the subject line
- Wrap body at ~72 chars
- Conventional Commits prefix is optional but preferred (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)

### PR scope

- One concern per PR. Don't bundle a repo rename with a feature addition.
- PR titles follow the same style as commit messages
- PR description includes: what changed, why, and any follow-up needed

### Draft PRs

Open a PR as draft when:

- The PR bumps the `desktop-toolkit` pin and is waiting on CI verification before going live
- CI feedback is wanted on a partial change before final commits
- A release is staged but should not be merged until downstream verification is complete

Convert to ready-for-review only once the coordinated flow is complete.

---

## Security

- Never commit secrets, tokens, or API keys
- `.env` files must be in `.gitignore`
- MCP configs reference environment variable names, never literal tokens
- When in doubt, assume a value might be sensitive and don't log it
- Audit dependency-bump PRs for unexpected maintainer changes on popular packages (supply-chain attack vector)
- Use `github.list_secret_scanning_alerts` and `github.list_code_scanning_alerts` to review open security alerts before major releases

---

## Working across repos

When a task spans multiple Chamber 19 repos:

1. Use `sequential-thinking` to plan the order of operations
2. Start with the lowest-level dependency. If a change touches `desktop-toolkit` and `transmittal-builder`, ship the toolkit change first, tag it, then bump `transmittal-builder`'s pin
3. Make each repo's PR self-contained. A `transmittal-builder` PR shouldn't say "this works once you merge #42 in desktop-toolkit." It should either pin to a released version or be explicitly marked "blocked on X."
4. If a `desktop-toolkit` bump reveals a problem, **fix forward** in the toolkit with a new patch version rather than yanking. GitHub Packages versions are immutable; a published bad release cannot be cleanly recalled, only superseded
5. If the relationship or decision is repo-specific (e.g. a new version pin contract), persist it to Copilot Memory. If it's family-wide, the user will update the instructions file.

---

## When you don't know

- Check Copilot Memory first (repo-specific discoveries and recurring traps live there)
- Then check the repo's `MIGRATION.md`, `RELEASING.md`, `CHANGELOG.md`, and `README.md`
- Then search across the five Chamber 19 repos via the `github` server
- Only then ask the user — and when you ask, ask a specific question, not an open-ended one

---

---

# Repo-specific rules — transmittal-builder

Everything above this section is shared across all Chamber 19 repos. Everything below is specific to `transmittal-builder` and must be followed in every PR that touches this repo.

## 1. Documentation currency is non-negotiable

Stale docs have caused production incidents in this project — most recently the v6.2.2 release uploading a cached v1.6.2 installer because `release.yml` and `publish-to-drive.ps1` both used `Select-Object -First 1`, and `RELEASING.md` had not been updated to reflect the post-rebrand filename convention. Stop the bleeding.

Every PR you produce **must** keep the following docs in lockstep with the code:

| When you change … | You must also update … |
|---|---|
| `frontend/src-tauri/tauri.conf.json` (`version`), `frontend/package.json` (`version`), or `frontend/src-tauri/Cargo.toml` (`version`) | All three together — they MUST match. Plus `RELEASING.md` examples if a release notes pattern changed. |
| The `@chamber-19/desktop-toolkit` pin in `frontend/package.json` | Also bump the matching `tag = "vX.Y.Z"` in `frontend/src-tauri/Cargo.toml`. Run `npm install` (in `frontend/`) and `cargo update -p desktop-toolkit --manifest-path frontend/src-tauri/Cargo.toml` to refresh both lockfiles in the same commit. |
| `.github/workflows/release.yml` | `RELEASING.md` if any user-visible step changed; `TROUBLESHOOTING.md` if a failure mode changed. |
| `scripts/publish-to-drive.ps1` | `RELEASING.md` § "Publish to shared drive" and `TROUBLESHOOTING.md` § "Stale cached installer" |
| `frontend/src-tauri/installer/hooks.nsh` (if a local override is ever re-added) | `RELEASING.md` § "Local `hooks.nsh` — historical note" and `TROUBLESHOOTING.md` § "Customising the NSIS installer" |
| `frontend/src-tauri/src/updater.rs` | `docs/AUTO_UPDATER.md` and `TROUBLESHOOTING.md` § "Update log" |
| `backend/requirements*.txt` | `MIGRATION.md` and `RELEASING.md` prerequisites table |
| Anything user-facing in behaviour | `CHANGELOG.md` (if present) or the next `RELEASE_NOTES.md` |

If a PR changes code but leaves a doc inconsistent, the PR is incomplete. Either fix the doc in the same PR, or open a tracking issue **before** merging and link it from the PR description.

## 2. Never leave historical references unmarked

The `docs/framework-extraction/` tree intentionally preserves the original `kc-framework` / `Koraji95-coder` naming because it documents how the extraction was originally executed. Every file in that tree starts with a `> **Historical archive:** …` blockquote callout. Apply the same pattern to any other doc that references a previous state of the world (an older repo name, a deprecated dependency, a superseded version):

```markdown
> **Historical archive:** this document predates X. Use [Y](./Y.md) for
> current guidance.
```

If a doc is _not_ historical and contains a reference to an older state, update it instead of marking it archival.

## 3. Markdown formatting

All `*.md` files must pass `markdownlint-cli2 "**/*.md"` against the rules in `.markdownlint.jsonc`. In short:

- Fenced code blocks: always declare a language. Use `text` for prose, ASCII art, or shell session output — never a bare block
- Use `_emphasis_` and `**strong**` consistently
- Surround headings, lists, and fenced blocks with blank lines
- First line of every file is a `#` H1; archival callouts go below it

## 4. Release-bump checklist

When cutting a new TB release, follow `RELEASING.md` § 2 exactly:

1. Bump version in **all three**: `frontend/package.json`, `frontend/src-tauri/tauri.conf.json`, `frontend/src-tauri/Cargo.toml`.
2. Refresh both lockfiles (`npm install` + `cargo update -p desktop-toolkit`) in the same commit.
3. Smoke-test locally: delete `frontend/src-tauri/target/release/bundle/` then run `npm run tauri build` and verify the only `.exe` produced has the new version in its filename.
4. Tag, push, monitor CI.
5. Verify the GitHub Release asset filename matches the tag.
6. Run `scripts/publish-to-drive.ps1 -Tag vX.Y.Z`.
7. Update any version examples in `TROUBLESHOOTING.md` and `MIGRATION.md` that were tied to the previous version.
8. Use the `time` MCP server for the release date in `CHANGELOG.md` — do not guess it.

## 5. Reference docs

- [`RELEASING.md`](../RELEASING.md) — release lifecycle (must always reflect the latest released version)
- [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) — diagnostic playbook
- [`MIGRATION.md`](../MIGRATION.md) — version-to-version upgrade notes
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — local dev workflow
- [`docs/AUTO_UPDATER.md`](../docs/AUTO_UPDATER.md) — auto-updater contract

If you find a discrepancy between code and these docs, fixing the doc is part of your job, not someone else's.
