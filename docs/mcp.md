# MCP (Model Context Protocol) Setup

> See [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)
> for the natural-language instructions that govern Copilot Chat and the
> coding agent. This file describes the MCP servers; that file describes
> the rules they operate under.

This repo ships two MCP configurations:

| File | Used by | Notes |
|------|---------|-------|
| `.vscode/mcp.json` | VS Code + Copilot Chat (agent mode) | Prompts for secrets via VS Code inputs; stored in OS keychain. |
| `.github/copilot/mcp-config.json` | Copilot cloud coding agent | Reads `COPILOT_MCP_GITHUB_TOKEN` from repo Copilot secrets. |

## Local setup (VS Code)

1. Open the Command Palette → `MCP: List Servers` → start each server.
2. When prompted, paste your GitHub PAT (scopes: `repo`, `read:org`) and SVGMaker key.

## Cloud agent setup

1. Repo Settings → Secrets and variables → **Copilot** → add `COPILOT_MCP_GITHUB_TOKEN`.
2. That's it — the agent picks up the config automatically on its next run.

## Servers included

- **github** — repo/PR/issue/commit context (read-only in cloud).
- **filesystem** (local) — sandboxed to the workspace folder.
- **memory** (local) — persistent knowledge graph at `.mcp/memory.json` (gitignored).
- **sequential-thinking** — structured multi-step reasoning.
- **fetch** — pull arbitrary URLs into context.
- **playwright** (local) — headless browser, useful for PDF preview / e2e.
- **svgmaker** (local) — SVG generation.
