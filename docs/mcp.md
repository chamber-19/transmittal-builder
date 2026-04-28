# MCP (Model Context Protocol) Setup

> See [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)
> for the natural-language instructions that govern Copilot Chat and the
> coding agent. This file describes the MCP servers; that file describes
> the rules they operate under.

This repo ships two MCP configurations with parity surfaces:

| File | Used by | Notes |
|------|---------|-------|
| `.vscode/mcp.json` | VS Code + Copilot Chat (agent mode) | Prompts for secrets via VS Code inputs (`${input:id}`); stored in OS keychain. Includes local-only `memory` server. |
| `.github/copilot/mcp-config.json` | Copilot cloud coding agent | Reads `COPILOT_MCP_GITHUB_TOKEN` and `COPILOT_MCP_SVGMAKER_API_KEY` from repo Copilot secrets. |

Both configs ship the same servers and tool surface so the cloud agent can
do the same work the local agent can. The only intentional difference: the
`memory` server is local-only because it writes to `.mcp/memory.json` in the
workspace and is gitignored — there's no useful persistence story for it in
a hosted runner.

If you add a server to either config, add it to the other in the same PR
unless there's an explicit reason to diverge (and document the reason here).

## Local setup (VS Code)

1. Open the Command Palette → `MCP: List Servers` → start each server.
2. When prompted, paste your GitHub PAT (scopes: `repo`, `read:org`) and
   SVGMaker key.

## Cloud agent setup

1. Repo Settings → Secrets and variables → **Copilot** → add
   `COPILOT_MCP_GITHUB_TOKEN` and `COPILOT_MCP_SVGMAKER_API_KEY`.
2. That's it — the agent picks up the config automatically on its next run.

The cloud config references secrets with the `$NAME` syntax (e.g.
`"$COPILOT_MCP_GITHUB_TOKEN"`). The `$` prefix is what triggers expansion;
without it the literal string is passed and authentication will fail.

## Servers

| Server | Purpose |
|--------|---------|
| `github` | Repo / PR / issue / commit / release / workflow / Dependabot alert access. |
| `git` | Local git operations (status, diff, log, blame, commit, branch, checkout). |
| `filesystem` | Sandboxed file access scoped to the workspace folder. |
| `fetch` | Pull arbitrary URLs into context. |
| `sequential-thinking` | Structured multi-step reasoning. |
| `time` | Date/time queries (release dating, changelog timestamps). |
| `svgmaker` | SVG generation. |
| `memory` (local only) | Persistent knowledge graph at `.mcp/memory.json` (gitignored). |

## Granting cloud-agent write capability is a deliberate choice

The cloud-agent surface now includes write tools (`create_issue`,
`create_pull_request`, `create_release`, `git_commit`, `git_add`, etc.).
That's a stronger trust posture than the previous read-only subset.
Implications:

- The cloud agent can open PRs and create branches without asking. Custom
  instructions and the org `copilot-instructions.md` have to carry the
  weight of preventing scope creep — there's no longer a capability fence
  forcing read-only behavior.
- Branch protection on `main` (CI green, required reviews) is the
  backstop. Verify it's enabled before relying on the cloud agent for
  PR-opening workflows.
- A leaked `COPILOT_MCP_GITHUB_TOKEN` is more dangerous than before. Rotate
  the token if you suspect compromise, and use a fine-grained PAT scoped
  to the chamber-19 org rather than a classic PAT.
  