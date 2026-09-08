# Checkpoint: operator TUI split + workspace tasks (2026-09-08)

**Goal:** Freeze the operator layout after VS Code 1.136: human is HITL orchestrator; Grok does the work in one Windows Terminal TUI; VS Code keeps the IDE and the long-running process panes.

**Prior:** [`2026-09-08-vscode-1.136-alignment.md`](./2026-09-08-vscode-1.136-alignment.md) (editor bump; no app/runtime change required). Host SoT remains `~/.grok/docs/vscode-host/CURRENT.md`.

## Current checkpoint

Operator contract:

- **Human:** pick outcomes, approve irreversible/secret/product calls, stay in the loop.
- **Grok:** implement, verify, keep the tree honest, report what changed and what is blocked.

Window split (not Grok-as-shell, not Grok nested in the integrated terminal as the default command center):

| Pane | Role | How to start |
|---|---|---|
| Windows Terminal · Grok | One command-center TUI | Task **Grok in Windows Terminal** |
| VS Code · Node | App + proxy (`http://localhost:3000`) | Task **Launch app** (`Ctrl+Shift+B`) |
| VS Code · Sidecar | Research null tests (`127.0.0.1:5051`) | Task **Sidecar** |

Do not start a second `npm run launch` from Grok while the Node task owns port 3000. Grok may `curl` health and edit files; the process stays in the IDE pane.

## Files

| File | Change |
|---|---|
| `.vscode/tasks.json` | **New.** Three tasks, `instanceLimit: 1` each. Still no `.vscode/settings.json`. `mcp.json` stays `servers: {}`. |
| `docs/development/DEV-QUICK-REFERENCE.md` | Editor section: 1.136 pointer + the three tasks. |
| `docs/handoff/2026-09-08-vscode-1.136-alignment.md` | Alignment checkpoint (1.136.2). Follow-on pointer to this file. |
| `docs/handoff/HANDOFF.md` | Index. |

App, proxy, briefing, and research code are **untouched**.

### Tasks

| Label | Runs | Notes |
|---|---|---|
| **Launch app** | `npm run launch` | Default build. Dedicated VS Code terminal. Reuses an instance if one is already up. |
| **Sidecar** | `solar-env\Scripts\python.exe scripts\research_sidecar.py` | No `Activate.ps1` (venv python is enough). Fails closed if `solar-env/` is missing (gitignored). |
| **Grok in Windows Terminal** | `wt.exe -w new nt --title Grok -d ${workspaceFolder} %USERPROFILE%\.grok\bin\grok.exe` | New WT window. Silent in VS Code (no extra integrated terminal). Windows-only. |

## Validation already run (this session)

| Check | Result |
|---|---|
| `.vscode/tasks.json` JSON parse | Valid `2.0.0`, three labels |
| `solar-env\Scripts\python.exe` | Present on this machine |
| `%USERPROFILE%\.grok\bin\grok.exe` | Present |
| `wt.exe` | Present (`WindowsApps`) |
| Tab smoke / hypothesis-sim / live `npm run launch` | **Not re-run.** No `public/`, `server.js`, or sidecar source change. Prior 8/8 tab smoke remains the last recorded app check (pre-update + 1.136 alignment sessions). |
| The three tasks clicked in the UI | **Not yet.** Operator should Run Task once to confirm WT opens and Node/Sidecar panes attach. |

## Risks / caveats

- **Sidecar** needs a local `solar-env/` (not in git). Clone without the venv → task fails until `python -m venv solar-env` and `pip install -r requirements.txt`.
- **Grok in Windows Terminal** is a Windows mapping (`wt.exe` + `grok.exe`). Other OS: run `grok` in a dedicated terminal yourself.
- Nested Grok-in-VS-Code-terminal still works; it is no longer the recommended command center (Ctrl/Alt theft, xterm.js Shift+Enter, mouse leak in fullscreen).
- In WT, Grok chords differ from the nested remap: interject is **Ctrl+Enter** / **Ctrl+I**, not **Ctrl+L** (`Ctrl+L` is plugins). **Alt+V** still pastes screenshots unless WT’s Ctrl+V is unbound.
- `instanceLimit: 1` prevents a second Node/sidecar/Grok-from-this-task. It does not stop a hand-typed duplicate in some other terminal.
- NOAA plasma remains degraded (IMAP transition). Unrelated to this checkpoint.

## Immediate next step

1. Operator reviews this PR (docs + `tasks.json` only).
2. Once: Terminal → Run Task → **Launch app**, **Sidecar**, **Grok in Windows Terminal**.
3. Next product/research outcome is the operator’s call; Grok executes.
