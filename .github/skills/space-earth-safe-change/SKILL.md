---
name: space-earth-safe-change
description: "Implement or refactor Space-Earth Monitor features and bug fixes safely. Use for dashboard UI changes, ES module edits, Node proxy updates, state-flow changes, docs sync, and repo-approved validation."
argument-hint: "Describe the bug, feature, or module change you want to make."
---

# Space-Earth Safe Change

## What it does

Runs a repo-safe implementation workflow for the Space-Earth Monitor codebase so changes stay aligned with the project's architecture, testing expectations, and documentation discipline.

## When to use

- Fixing a bug in `public/src/js/`, `server.js`, or the UI
- Adding or refining dashboard features, tabs, charts, settings, or map behavior
- Refactoring data flow, state updates, error handling, or launch/runtime behavior
- Making a change that should also update docs, testing steps, or handoff notes

## Procedure

1. **Load guardrails first**
   - Read `.github/copilot-instructions.md`, `README.md`, and `docs/development/DEV-QUICK-REFERENCE.md`.
   - Pull in the closest testing or research doc for the area being changed.

2. **Map the impacted surface area**
   - Frontend ES modules in `public/src/js/`
   - Browser UI in `public/index.html` and `public/src/css/`
   - Proxy/runtime behavior in `server.js`
   - Optional Python research compute in `scripts/research_sidecar.py` and `tests/`

3. **Hold the repo constraints line**
   - No build step, bundler, database, or API keys.
   - Keep `public/src/js/` as ES modules only.
   - Keep `server.js` in CommonJS.
   - Route frontend API calls through `public/src/js/config.js`.
   - Use `fetchWithRetry()` / `fetchWithTimeout()` instead of bare `fetch` for external data paths.
   - Keep shared mutable state in `store.js` rather than inventing new globals.
   - If Python is needed, activate `solar-env` first and keep Node/Express as the public-facing entry point.

4. **Make the smallest coherent change**
   - Prefer focused edits over broad rewrites.
   - Reuse existing modules and patterns before creating new ones.
   - Keep failure behavior explicit and graceful.

5. **Validate proportionally**
   - Launch the app with the recommended local flow.
   - If UI, tabs, rendering, or network behavior changed, do the closest smoke/manual verification available.
   - If hypothesis logic changed, run the simulation or the nearest targeted analytical check.
   - If Python research code changed, validate it inside the workspace venv only.

6. **Update docs in the same stretch of work**
   - `README.md` for user-facing startup or behavior changes.
   - `docs/development/DEV-QUICK-REFERENCE.md` for workflow/runtime changes.
   - `docs/testing/*` for new validation or troubleshooting steps.
   - `docs/handoff/` for meaningful session outcomes: create a new dated handoff file and keep `docs/handoff/HANDOFF.md` updated as the lineage/index.
   - Record what improved, what was validated, and what still looks weak or risky.

7. **Finish with an honest wrap-up**
   - List changed files.
   - Summarize validation performed.
   - State remaining risks, ambiguity, or follow-up checks plainly.

## Completion checks

- The change respects the repo's no-build / no-database / keyless-data constraints.
- Validation matched the kind of change made.
- Relevant docs were updated when behavior or workflow changed.
- Remaining uncertainty is stated explicitly rather than hand-waved away.
