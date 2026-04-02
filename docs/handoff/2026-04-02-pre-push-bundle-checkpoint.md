# 2026-04-02 — Pre-push bundle checkpoint

## Goal

Prepare a truthful commit/push for the accumulated 2026-04-02 workspace changes without flattening several distinct checkpoints into a fake single-feature story.

## Current checkpoint

This pending push bundles multiple related checkpoints already captured elsewhere in `docs/handoff/`, including:

- PB2002 tectonic baselayer work
- PB2002 plate polygon + UI polish work
- map semantic tightening and honest motion/vector copy
- factor-sidequest framing for optional sidereal/synodic analysis
- Python research stack lane hardening and Docker-as-optional direction

Most relevant surfaces in the working tree:

- Runtime/map/UI:
  - `public/src/js/map.js`
  - `public/src/js/config.js`
  - `public/src/js/main.js`
  - `public/src/js/error-logger.js`
  - `public/index.html`
  - `public/src/css/base.css`
  - `public/src/css/components.css`
  - `public/src/css/map.css`
  - `public/src/css/variables.css`
  - `public/sw.js`
- Tectonic artifacts / generation:
  - `public/data/tectonics/**`
  - `scripts/build-pb2002-boundaries.mjs`
  - `package.json` (`build:tectonics`)
- Runtime / proxy / docs / guidance:
  - `server.js`
  - `README.md`
  - `docs/development/DEV-QUICK-REFERENCE.md`
  - `docs/research/RESEARCH.md`
  - `docs/planning/ROADMAP.md`
  - `docs/testing/TESTING-CHECKLIST.md`
  - `docs/testing/TESTING-TROUBLESHOOT.md`
  - `.github/copilot-instructions.md`
  - `.github/agents/space-earth-lab.agent.md`
  - `.github/prompts/create-space-earth-micro-handoff.prompt.md`
  - `.github/skills/space-earth-change-continuation/SKILL.md`
  - `.github/skills/space-earth-runtime-degradation/SKILL.md`

Validation artifacts were also refreshed under `test-results/tab-smoke/`.

## Validation already run

Validated in this turn:

- `npm run test:hypothesis-sim` → passed
- `& .\solar-env\Scripts\Activate.ps1; pytest tests/test_research_stats.py -q` → `3 passed in 0.15s`
- `$env:APP_URL='http://localhost:3000'; node scripts/tab-smoke-test.mjs` → 6/6 tabs passed, 0 console errors, 0 page errors, 0 request failures
- `GET /api/health` returned `503` with:
  - `usgs.ok = true`
  - `openmeteo.ok = true`
  - `noaa.ok = false` (`fetch failed`)

Validated earlier in the same broad workstream but not re-run in this turn:

- `statsmodels` and `scikit-learn` install/import checks documented in `2026-04-02-stack-lanes-and-docker-direction.md`
- the narrower dated checkpoints already listed in `docs/handoff/HANDOFF.md`

## Risks / caveats

- The current local runtime is **degraded, not fully green**, because the NOAA health check failed during this pre-push verification.
- The browser smoke flow still passed, so the app remains navigable and the degradation is presently upstream/feed-specific rather than a total local break.
- Plate-motion vectors are still explicitly illustrative/partial until a better public local motion artifact is wired in.
- PB2002 remains a cited structural baseline, not a substitute for a modern motion model.
- This is intentionally a broad bundle; future bisects should use the dated handoff files as sub-checkpoints.

## Immediate next step

Commit and push the current bundle.

After push, the best next engineering step is still:

1. preserve the storm-only baseline,
2. add factor provenance fields,
3. compare baseline vs factor-conditioned models with a scorecard,
4. keep sidereal/synodic analysis optional and research-only,
5. optionally investigate the NOAA-driven `/api/health` degradation as a separate follow-up.