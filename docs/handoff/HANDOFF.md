# Handoff: Security Hardening + Project Restructure + Research Methodology

## Handoff Index + Lineage (2026-04-02)

This file is now the **handoff index + lineage root** for the repository.

Going forward, create **new standalone handoff files** in `docs/handoff/` instead of endlessly appending one monolithic session log. Use the naming convention:

- `YYYY-MM-DD-short-title.md`

Keep this file for:

- the read order / precedence rules
- links to the latest standalone handoffs
- older embedded checkpoints that are still useful as historical context

### Standalone handoffs (newest first)

- [`2026-04-02-frontend-honesty-and-lineage.md`](./2026-04-02-frontend-honesty-and-lineage.md) — current runtime/UI checkpoint covering honest space-weather degradation, plate-study UX, quieter sidecar offline behavior, notification noise reduction, and the shift to standalone handoff files

### Read order / precedence

1. **Latest standalone handoff file(s) in `docs/handoff/`**
  - Treat the newest dated file as the current operational checkpoint.
2. **Checkpoint Addendum — Hypothesis Documentation + Customization Alignment (2026-04-02)**
  - Current checkpoint for how docs, prompts, skills, and instructions map the hypothesis workflow by concern.
3. **Checkpoint Addendum — Python Null Calibration Sidecar + UI Wiring (2026-04-02)**
  - Current checkpoint for the local-only Python sidecar architecture and bootstrap workflow.
4. **Checkpoint Addendum — Map Architecture + Hypothesis Validation + Historical Foundation (2026-04-02)**
  - Current checkpoint for 2D map direction, shared lag-analysis extraction, simulation harness, and archive foundation.
5. **Session Summary / Prior Session Recap / older lower sections**
  - Historical provenance only.
  - Statements like **"clean working tree"** or **"no Python server exists yet"** are preserved for context, but are superseded where newer checkpoints conflict.

When two sections disagree, trust the **newest standalone handoff or addendum above** and then confirm with live validation in the current workspace.

## Checkpoint Addendum — Hypothesis Documentation + Customization Alignment (2026-04-02)

This addendum supersedes the implicit assumption that contributors can infer the full 27–28 day workflow from one file name. The repo docs and workspace customizations now point to the **actual hypothesis implementation surfaces** and separate them by concern.

### What changed in this checkpoint

1. **Contributor docs now map the hypothesis workflow by concern**
  - Updated `README.md` with a concise implementation-surface map.
  - Updated `docs/research/RESEARCH.md` to describe the split between the older `correlation.js` path and the newer `hypothesis-core.mjs` + `prediction.js` workflow.
  - Updated `docs/planning/ROADMAP.md` to keep planning discussions aligned with the actual code ownership split.
  - Updated `docs/testing/TESTING-CHECKLIST.md` and `docs/testing/TESTING-TROUBLESHOOT.md` so validation and debugging now point to the correct file by concern.

2. **Workspace customization files now reference the real hypothesis surfaces**
  - Updated `.github/prompts/docs-sync.prompt.md` to inspect the actual hypothesis files before touching docs.
  - Updated `.github/prompts/hypothesis-evidence-summary.prompt.md` to include the simulation harness and concern-based starting points.
  - Updated `.github/skills/space-earth-hypothesis-check/SKILL.md` so the workflow explicitly names the core, orchestration, legacy/UI, sidecar, and simulation surfaces.

3. **Contributor/AI guidance was tightened**
  - Updated `.github/copilot-instructions.md` so the source layout and hypothesis guidance no longer imply that everything lives in `correlation.js`.

### Validation completed for this checkpoint

- Static error check on the updated markdown files → no reported file errors
- Readback verification confirmed the new concern split appears in the expected docs and customization files

### What remains open / not yet fully closed

- These updates improve navigation and claim discipline, but they do not replace runtime validation when hypothesis code changes.
- The older Pearson/Fisher path in `correlation.js` still exists; the docs now describe that honestly instead of pretending it is the whole engine.
- Future hypothesis-related changes should still update the same docs in the same work session so the concern split stays current.

## Checkpoint Addendum — Python Null Calibration Sidecar + UI Wiring (2026-04-02)

This addendum supersedes the older note that "no Python server exists yet." The project now has a **local-only Python research sidecar** for deterministic null calibration, and the Correlation tab can call it through the existing Node proxy without exposing Python directly to browser clients.

### What changed in this checkpoint

1. **A local Python research sidecar now exists**
  - Added `scripts/research_sidecar.py`.
  - Added `scripts/research_stats.py` with pure NumPy helpers.
  - Binds to `127.0.0.1:5051` only.
  - Scope is intentionally narrow: deterministic bootstrap/shuffled-storm null calibration.

2. **Node now proxies the sidecar instead of exposing it**
  - Added `GET /api/research/status`
  - Added `POST /api/research/bootstrap`
  - Payloads are validated and size-limited before forwarding.
  - Browser clients never talk to Python directly.

3. **The Correlation tab can run null calibration from the interface**
  - Added a **Bootstrap Null Calibration** panel.
  - Added a **Run Bootstrap Null Test** button.
  - The UI now shows:
    - sidecar online/offline state
    - permutations used
    - observed target-window peak
    - null 95th percentile
    - empirical p-value
    - conservative verdict text

4. **Workflow status got more honest**
  - The existing research-workflow panel now reports Python sidecar availability.
  - The null-calibration row can now say whether calibration is pending, unavailable, or completed.
  - The "next step" messaging now changes depending on whether the sidecar is online and whether calibration has already run.

5. **A targeted Python test file was added**
  - Added `tests/test_research_stats.py`.
  - Covers bucket normalization, an implanted target-window signal, and a deterministic bootstrap null check.

### Validation completed for this checkpoint

- Static error check on edited browser files → no reported file errors
- `pytest tests/test_research_stats.py -q` → **3 passed**
- `npm run test:hypothesis-sim` → passes
- `GET /api/research/status` through Node proxy → reports sidecar online
- `POST /api/research/bootstrap` through Node proxy → returns deterministic null-calibration summary
- Browser smoke test → **6/6 tabs pass**, **0 console errors**, **0 page errors**, **0 request failures**

### What remains open / not yet fully closed

- The Python sidecar still has to be started manually after activating `solar-env`.
- No regional stratification yet.
- No Dst-vs-Kp comparative null calibration yet.
- The current null calibration uses a shuffled/circularly shifted storm catalog; it is a meaningful null calibration step, but not yet a full regional or storm-definition control suite.

### Session-end continuation roadmap

#### Immediate restart checklist

1. Start the Node app with `npm run launch` (or `npm start` if direct server control is preferred).
2. If null calibration is needed, activate `solar-env` and run `python scripts/research_sidecar.py`.
3. Open the Correlation tab and confirm:
   - historical foundation state
   - Python sidecar status
   - bootstrap panel visibility
4. Re-run:
   - `pytest tests/test_research_stats.py -q`
   - `npm run test:hypothesis-sim`
   - `$env:APP_URL="http://localhost:3000"; node scripts/tab-smoke-test.mjs`

#### Next recommended implementation steps

1. **Reduce startup friction**
  - Decide whether `scripts/launch.js` should optionally auto-start the Python sidecar for research sessions.
  - If not, add clearer in-app guidance or a helper task for launching it.

2. **Improve null quality**
  - Add alternative null families beyond circular storm shifts.
  - Add Bonferroni-aware or multiple-comparison-aware framing for lag-peak interpretation.

3. **Add stronger controls**
  - Regional stratification
  - Dst-vs-Kp comparative storm definitions
  - Provenance text showing which archive paths fed the current corpus

4. **Tighten user-facing interpretation**
  - Ensure bootstrap verdicts and browser lag-scan verdicts remain aligned but clearly distinct.
  - Keep the probability card subordinate to null calibration and corpus quality.

5. **Keep the security posture intact**
  - Do not expose Python directly to the browser.
  - Do not add server-side persistence for research outputs.
  - Keep model/LLM integration, if any, advisory-only and downstream of deterministic compute.

## Checkpoint Addendum — Map Architecture + Hypothesis Validation + Historical Foundation (2026-04-02)

This addendum supersedes the older “clean working tree” snapshot below. Since that earlier checkpoint, the project has gained a more explicit research workflow, a cleaner map architecture boundary, and a stronger historical-data foundation for testing the 27–28 day lag idea without overstating the evidence.

### What changed in this checkpoint

1. **Map direction was decided instead of left fuzzy**
  - Kept the existing **2D Leaflet map as the primary research surface**.
  - Added `public/src/js/mapViewport.js` so tab/layout code no longer depends directly on Leaflet.
  - Future 3D work is now intentionally **optional and isolated**, not part of the default boot path.

2. **Lag-analysis logic was extracted into a shared pure core**
  - Added `public/src/js/hypothesis-core.mjs`.
  - Shared functions now cover:
    - lag scanning
    - lag assessment
    - conditional probability computation
    - conservative evidence interpretation
    - storm and earthquake catalog normalization
  - `prediction.js` now uses this shared core instead of carrying its own duplicated analysis logic.

3. **A deterministic simulation harness now exists**
  - Added `scripts/hypothesis-sim.mjs` and `npm run test:hypothesis-sim`.
  - The sim checks three cases with the same analysis core used by the browser:
    - null independence
    - positive-control 27-day signal
    - off-target 12-day signal
  - This creates a basic falsification/sanity layer before trusting real-data interpretation.

4. **Live UI interpretation was made more conservative**
  - The Correlation tab now separates:
    - insufficient data
    - null-consistent
    - off-target peak
    - weak 25–30d bump
    - candidate 25–30d signal
  - The probability card is now explicitly treated as **descriptive**, not automatically evidentiary.
  - Added richer interpretation UI fields in `public/index.html` + `public/src/css/components.css`.

5. **Historical storm depth was upgraded using an official NOAA source**
  - Added validated proxy route: `/api/noaa/dayind?date=YYYY-MM-DD`
  - Added pure parser/helper module: `public/src/js/stormArchive.mjs`
  - `prediction.js` can now load ~2 years of NOAA/NCEI `dayind` daily geomagnetic indices and normalize Kp≥5 storm intervals into the local browser corpus.

6. **Historical research workflow was simplified**
  - Added separate buttons for:
    - USGS earthquake archive
    - NOAA storm archive
    - **Load Full Research Foundation**
  - The combined workflow loads NOAA storms first, then USGS earthquake history, then reruns analysis.
  - The UI now exposes foundation readiness so the app can say “seed/live only” or “partial archive” instead of pretending all corpora are equally meaningful.

7. **A server regression was found and fixed during validation**
  - The global rate limiter was unintentionally throttling static JS modules, causing smoke-test failures with `429` responses on asset requests.
  - Fix: scope rate limiting to `/api` only.
  - This is a useful reminder that validation caught a real problem, not cosmetic noise.

8. **Documentation was updated across the actual project surface**
  - `README.md`
  - `docs/planning/ROADMAP.md`
  - `docs/development/DEV-QUICK-REFERENCE.md`
  - `docs/research/RESEARCH.md`
  - `docs/testing/TESTING-CHECKLIST.md`
  - `.github/copilot-instructions.md`

### Validation completed for this checkpoint

- `npm run test:hypothesis-sim` → passes
- Browser smoke test → **6/6 tabs pass**, **0 console errors**, **0 page errors**, **0 request failures**
- Historical NOAA proxy validated with `2024-05-10` dayind file → route responded successfully and parsed storm intervals
- Focused browser DOM check confirmed the new research-foundation controls render correctly

### What remains open / not yet fully closed

- The new combined **full research foundation** workflow was validated structurally and via smoke testing, but a full in-session end-to-end 2-year archive load was not yet observed all the way to completion.
- Regional stratification is still pending.
- Dst-vs-Kp comparative storm definitions are still pending.
- `scripts/test-automation.js` still appears stale relative to the current research workflow.

### Practical next step after this checkpoint

Run the full research-foundation load once in the live app, confirm the resulting storm + earthquake corpus counts, and then inspect whether the lag interpretation remains null-like, off-target, weak, or candidate-level on the enlarged historical base.

## Session Summary (historical baseline — later addenda above take precedence)

At the time of this historical checkpoint, the session resolved all 6 GitHub CodeQL security alerts, restructured the project to isolate the web root under `public/`, organized all documentation into categorized subdirectories, and discussed the scientific research methodology for testing the 27–28 day lag hypothesis. Checkpoint HEAD: `9b8bc47` on `main`. Clean working tree at that checkpoint.

---

## Prior Session Recap (for continuity)

The previous session (`Statistical Prediction Engine + Hypothesis Test`) delivered:
- `.github/copilot-instructions.md` — auto-loaded project context for Copilot
- `prediction.js` — Bayesian prediction engine with USGS ComCat loader, event-rate ratio lag scan (0–60d), cold-start with 7 SC25 storms
- Lag scan chart in `charts.js`, correlation tab UI rebuild in `index.html`
- `RESEARCH.md` — 325-line scientific hypothesis analysis with falsification criteria
- HEAD was `78fd97e`

---

## This Session: What Was Done

### 1. Resolved all 6 CodeQL security alerts

| # | Alert | Severity | Fix |
|---|---|---|---|
| 1–3 | Incomplete URL substring sanitization (`sw.js`) | High | Replaced `url.includes('noaa.gov')` with `new URL(url).hostname` parsing + `.endsWith()` checks |
| 4 | Missing rate limiting (`server.js:279`) | High | Added `express-rate-limit` at 100 req/min/IP with `standardHeaders: true` |
| 5 | Exposure of private files (`server.js:17`) | Medium | Added `dotfiles: 'deny'` to `express.static()` options |
| 6 | Exposure of private files (re-flagged after #5) | Medium | **Major restructure** — moved all web assets into `public/` directory; `express.static` now serves only `public/`, making `server.js`, `package.json`, `.env`, etc. completely inaccessible |

### 2. Project restructure — `public/` web root

All browser-served files moved from project root into `public/`:
```
public/
  index.html
  sw.js
  manifest.json
  src/
    css/  (5 files: variables, base, components, map, notifications)
    js/   (16 modules: main, store, config, utils, charts, tabs, map,
           spaceWeather, seismic, correlation, prediction, environment,
           db, settings, notifications, error-logger)
```

`server.js` updated: `PUBLIC_DIR = path.join(__dirname, 'public')` — no project root files are web-accessible.

### 3. Documentation organized into categories

```
docs/
  handoff/         HANDOFF.md (this file)
  research/        RESEARCH.md
  planning/        PROJECT-STATUS.md, ROADMAP.md, SPRINT-1-DELIVERY.md
  operations/      DEPLOYMENT.md
  development/     DEV-QUICK-REFERENCE.md, VISUAL-FIXES-SUMMARY.md
  testing/         TESTING-CHECKLIST.md, TESTING-TROUBLESHOOT.md
```

### 4. Dev scripts consolidated

```
scripts/
  tab-smoke-test.mjs        Playwright 6-tab smoke test
  restart-server.js          Server restart utility
  verify-visuals.js          Visual verification
  lighthouse-automation.js   Lighthouse audit runner
  test-automation.js         Test automation runner
```

### 5. Additional security hardening

- `app.disable('x-powered-by')` — removes Express fingerprint header
- `X-Content-Type-Options: nosniff` + `Referrer-Policy: no-referrer-when-downgrade` on all responses
- `express.json({ limit: '16kb' })` — body size limit
- SPA catch-all rejects paths with file extensions or dotfile patterns (returns 404 instead of `index.html`)
- `npm audit fix` — resolved `path-to-regexp` ReDoS vulnerability; `npm audit` now shows 0 vulnerabilities
- `sw.js` STATIC_ASSETS gap fixed — added missing `error-logger.js` and `prediction.js`

### 6. `.github/copilot-instructions.md` updated

- New source layout reflecting `public/`, `docs/`, `scripts/` structure
- Python venv enforcement rule added
- Runtime deps updated to include `express-rate-limit ^7`
- Test command paths updated for `scripts/` directory

---

## Validation Results

| Test | Result |
|---|---|
| Security tests (15 checks) | 15/15 PASS |
| Smoke test (6 tabs) | 6/6 PASS |
| Console errors | 0 |
| HTTP errors | 0 |
| `npm audit` | 0 vulnerabilities |

---

## Git State

```
HEAD:    9b8bc47  refactor: restructure project for security and organization
Branch:  main (up to date with origin/main)
Remote:  https://github.com/xepoctpat/tectonic-solar.git
Status:  Clean working tree at that historical checkpoint
```

Recent commit history:
```
9b8bc47 refactor: restructure project for security and organization
6781016 Add CodeQL analysis workflow configuration
1ace43f fix: resolve 5 CodeQL security alerts
e1ac88a Merge pull request #2 (dependabot/pip)
0d3fe6b Merge pull request #3 (dependabot/npm_and_yarn)
c96fde3 Bump path-to-regexp in the npm_and_yarn group
ba75ef2 Update HANDOFF.md with full session recap
78fd97e Add statistical prediction engine and cross-lag hypothesis test
28db01c Add RESEARCH.md: space-weather ↔ tectonic activity hypothesis analysis
```

---

## Known State / Behaviors

- **NOAA plasma 404**: `[proxy] rtsw_plasma_1m.json fell back to default (status 404)` in server logs is **expected**. NOAA DSCOVR endpoint is intermittently unavailable. `fallbackOnError: true` returns `200 []` so the client degrades gracefully.
- **CodeQL workflow**: `.github/workflows/codeql.yml` runs on push to main. All 6 alerts should show as closed after the restructure push. Check at: `https://github.com/xepoctpat/tectonic-solar/security/code-scanning`
- **Service worker cache**: `tectonic-solar-v2` / `tectonic-solar-api-v2` — bump to `v3` if making breaking changes to static assets.

---

## Research Discussion Context

The last topic before this handoff was **how to effectively conduct serious research and test the 27–28 day hypothesis**. Key points from `docs/research/RESEARCH.md` and the discussion:

### Current engine capabilities
- `prediction.js`: Event-rate ratio lag scan (0–60d), Bayesian P(M5+ | storm), USGS ComCat 2-year loader
- `correlation.js`: Pearson r on matched pairs (has selection bias — documented in RESEARCH.md §7)

### Top research priorities (from RESEARCH.md + discussion)
1. **Bootstrap null distribution** — Permute storm dates 1000×, build empirical p-value for the 1.15× threshold. Currently the threshold is ad-hoc.
2. **Historical data depth** — 2 years (ComCat) is better than 90 days but still underpowered. NOAA Kp archive + USGS ComCat can go back 30+ years for robust n>200 storm tests.
3. **Cross-lag validation** — Already implemented (scanAllLags), but needs Bonferroni correction (p < 0.05/60 ≈ 0.0008) to avoid multiple comparison artifacts.
4. **Regional stratification** — Ring of Fire vs Mediterranean-Himalayan vs Craton. Global pooling likely dilutes any real signal.
5. **Dst-based storm threshold** — Dst is a better proxy for storm energy than Kp. Feed is already available.
6. **Reproduce the null first** — USGS maintains no correlation exists. The app should reproduce the null result on a 90-day window before claiming to find signal in larger windows.

### Python venv readiness
- `solar-env/` has Python 3.13 with scipy, pandas, numpy, Flask — scaffolded for a compute service
- **Historical note at that checkpoint:** no Python server existed yet. This is superseded above; the current repo now has the local-only `scripts/research_sidecar.py` sidecar behind the Node proxy.
- Bootstrap permutation testing (1000× permutations) and regional b-value analysis are natural candidates for a Python compute service via Flask, since browser JS is CPU-limited for large permutation workloads

---

## Recommended Next Steps

1. **Start server** → `npm start` → verify `http://localhost:3000` renders all 6 tabs
2. **Confirm CodeQL** — check that alert #6 is now closed at GitHub security tab
3. **Bootstrap null distribution** — implement 1000× permutation test (Python or JS) to calibrate the 1.15× threshold with empirical p-values
4. **Regional stratification** — add region bounding-box lookup to `correlation.js`, show r per tectonic region
5. **Extended historical data** — NOAA Kp archive (decades), USGS ComCat (10-30 years) for n>200 storms
6. **CME/DONKI integration** — NASA DONKI API for upstream CME tracking (ROADMAP Phase 3)
7. **Python compute service** — Flask endpoint for heavy statistical computation (bootstrap, GR b-value)

---

## Known Gaps / Open Issues

| # | Issue | Severity | Notes |
|---|---|---|---|
| 1 | USGS ComCat pagination | Medium | `loadHistoricalUSGS()` fetches up to 5000 events in one call. If 2-year M5+ exceeds 5000, add `offset` loop. |
| 2 | `correlation.js` Pearson bias | Low | Old matched-pairs approach remains live alongside new engine. Not broken, just imprecise. |
| 3 | Hypothesis verdict threshold (1.15×) | Low | Not calibrated against null distribution. Needs bootstrap permutation testing. |
| 4 | Historical gap — no Python server yet | Low | Superseded by newer addenda above. The current repo now has a local-only Python research sidecar instead of this earlier no-server state. |

---

## Environment

- **Node.js**: `npm start` → port 3000
- **Python venv**: `solar-env\Scripts\Activate.ps1` — Flask scaffolded but not instantiated
- **Git remote**: `xepoctpat/tectonic-solar`, `main` branch
- **Git email**: `xepoctpat@users.noreply.github.com`
- **No API keys** anywhere in the codebase
