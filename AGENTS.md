# AGENTS.md

See [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for guidance applicable to all agents (Copilot, Claude Code, Aider, etc.).

Environment and operations references used by agents:

- Conda policy and commands: [`docs/CONDA.md`](docs/CONDA.md)
- Operator runbook (release + PIN lifecycle): [`docs/OPERATOR_RUNBOOK.md`](docs/OPERATOR_RUNBOOK.md)

For family-wide Chamber 19 rules, see [chamber-19/.github](https://github.com/chamber-19/.github).

## Backend auth

The Python sidecar (`backend/`) uses dual-auth to verify that requests come from an activated machine. The bearer check runs first; all other auth falls through.

- Set `ACTIVATION_HMAC_SECRET` as a runtime environment variable on the backend host. The value must match the secret compiled into the launcher binary.
- The toolkit dep is already registered: `from chamber19_desktop_toolkit.auth import toolkit_bearer_dep`.
- Never re-implement bearer validation inline — use `toolkit_bearer_dep` from `chamber19-desktop-toolkit`.

## Splash window

Transmittal-Builder does not have a custom splash window. The toolkit handles splash choreography via `splash::emit_status_step` and `splash::transition_to_main_window`. Do not add a custom splash window.
