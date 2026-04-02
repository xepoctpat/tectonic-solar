# GitHub Copilot Instructions — tectonic-solar

## Project purpose

**Space-Earth Monitor** is a no-build browser dashboard for live space-weather, seismic, and environmental monitoring, plus conservative investigation of a debated **27–28 day lag** between geomagnetic storms and earthquake probability.

- Treat the lag hypothesis as **unproven**.
- Distinguish clearly between **validated by code/tests**, **plausible but untested**, and **speculation**.
- Prefer honest degradation and conservative interpretation over “signal-shaped optimism.”

## Start and validate

Requires **Node ≥ 18**.

```powershell
npm run launch
npm start
npm run test:hypothesis-sim
$env:APP_URL="http://localhost:3000"; node scripts/tab-smoke-test.mjs

solar-env\Scripts\Activate.ps1
python scripts/research_sidecar.py
pytest tests/test_research_stats.py -q
```

- Default local onramp for humans: `npm run launch`.
- Use `npm start` for direct server control or automation.
- **Always activate `solar-env` before any `python`, `pip`, or `pytest` command.** Never use system Python in this repo.
- The Python sidecar is optional research compute, not normal app startup.

## Hard constraints

- **No build step**: no Vite, webpack, Babel, TypeScript, or bundler assumptions.
- **No server-side storage**: no database, ORM, Redis, or silent server cache.
- **No API keys or authenticated upstreams** unless explicitly discussed.
- `public/` is the **only** browser-served web root.
- `server.js` stays **CommonJS**; `public/src/js/**` stays **ES modules**.
- Browser clients must go through the **Node proxy** for NOAA, USGS, Open-Meteo, and research-sidecar routes.
- Keep Python **local-only** and proxied through `server.js`; do not expose Python directly to the browser.
- Route frontend endpoints through `public/src/js/config.js`; keep shared mutable state in `public/src/js/store.js`.
- Keep docs current when runtime behavior, research workflow, security posture, or UX materially changes.

## Use the right repo customization for the job

- **Browser ES modules** → `.github/instructions/space-earth-frontend.instructions.md`
- **`server.js` proxy/runtime work** → `.github/instructions/space-earth-server-proxy.instructions.md`
- **Hypothesis/research work** → `.github/agents/space-earth-lab.agent.md` or `.github/skills/space-earth-hypothesis-check/SKILL.md`
- **Resume from a handoff or partially validated checkpoint** → `.github/skills/space-earth-change-continuation/SKILL.md`
- **Investigate `/api/health`, startup, or degraded runtime behavior** → `.github/skills/space-earth-runtime-degradation/SKILL.md`
- **Feed/proxy additions or changes** → `.github/skills/space-earth-feed-change/SKILL.md`
- **General safe feature/fix work** → `.github/skills/space-earth-safe-change/SKILL.md`
- **Prepare a lightweight continuity checkpoint** → `.github/prompts/create-space-earth-micro-handoff.prompt.md`
- **Doc follow-through after code changes** → `.github/prompts/docs-sync.prompt.md`
- **Conservative evidence summaries** → `.github/prompts/hypothesis-evidence-summary.prompt.md`

Keep this file high-level. Let file-scoped instructions, skills, prompts, and the lab agent carry the detailed workflows.

## Session continuity

- If a long session starts compacting/compressing context, prepare a concise **micro-handoff** before details degrade.
- Do this **no later than the second compaction cycle** in the same thread.
- A micro-handoff should capture the active user goal, files changed, validation already run, current risks/caveats, and the immediate next step.
- Keep using `docs/handoff/` for meaningful milestone recaps; micro-handoffs are the lighter continuity layer that should happen earlier.

## Architecture cues that matter everywhere

- Live data is fetched at runtime from **public, keyless** feeds.
- Client-side persistence only: `IndexedDB` for rolling event history and `localStorage` for settings.
- `map.js` remains the primary **2D Leaflet** research surface; any future 3D work must stay optional and isolated.
- When adding or changing a feed, update the proxy contract in `server.js`, the endpoint wiring in `config.js`, and the relevant docs/tests together.
- When reasoning about system behavior, treat runtime, data, validation, interaction, and continuity flows as **types of feedback loops** rather than as unrelated categories.
- Differentiate loop types by properties such as latency, coupling, damping, and evidentiary strength instead of assuming some parts of the system sit outside the feedback model.

## Hypothesis workflow by concern

Do not flatten the entire research workflow into “`correlation.js` work.”

| Concern | Primary file(s) | Primary validation |
|---|---|---|
| Research narrative / falsification criteria | `docs/research/RESEARCH.md` | Readback for claim discipline |
| Shared lag-analysis core | `public/src/js/hypothesis-core.mjs` | `npm run test:hypothesis-sim` |
| Historical loading + orchestration | `public/src/js/prediction.js` | Simulation + archive workflow check |
| Legacy/basic browser correlation UI | `public/src/js/correlation.js` | UI verification of timeline / Pearson path |
| Optional Python null-calibration bridge | `public/src/js/researchCompute.js` | Sidecar status + bootstrap flow |
| Local Python research compute | `scripts/research_sidecar.py`, `scripts/research_stats.py` | `pytest tests/test_research_stats.py -q` |

## Dev-environment gotchas

- The Python static server is for **static checks only**; use the Node proxy for real feature validation because browser-direct upstream calls hit CORS limits.
- NOAA upstream instability is expected. Existing graceful fallback behavior for non-critical feeds is intentional; do not “fix” it by making the app more brittle.
- Do not hardcode external URLs in feature modules.
- Do not replace resilient fetch helpers with bare `fetch` in browser-facing network flows.
- If a change spans UI, runtime, and research interpretation, validate each concern separately instead of assuming one passing check covers all three.

## Cross-references

- `README.md` — product overview and startup guidance
- `docs/development/DEV-QUICK-REFERENCE.md` — runtime modes and workspace customization inventory
- `docs/testing/TESTING-CHECKLIST.md` — validation matrix by file/concern
- `docs/testing/TESTING-TROUBLESHOOT.md` — debugging guidance
- `docs/research/RESEARCH.md` — methodology, falsification criteria, and evidence discipline
- `docs/planning/ROADMAP.md` — current direction and next steps
- `docs/handoff/HANDOFF.md` — lineage index; add new meaningful recaps as dated handoff files in `docs/handoff/`
