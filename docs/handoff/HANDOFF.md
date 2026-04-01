# Handoff: Security Hardening + Project Restructure + Research Methodology

## Session Summary

This session resolved all 6 GitHub CodeQL security alerts, restructured the project to isolate the web root under `public/`, organized all documentation into categorized subdirectories, and discussed the scientific research methodology for testing the 27–28 day lag hypothesis. Current HEAD: `9b8bc47` on `main`. Clean working tree — no uncommitted changes.

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
Status:  Clean working tree
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
- **No Python server exists yet** — all serving is Node.js
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
| 4 | No Python server yet | Low | `solar-env/` venv ready (Flask, scipy, pandas) but no `app.py` or routes exist. |

---

## Environment

- **Node.js**: `npm start` → port 3000
- **Python venv**: `solar-env\Scripts\Activate.ps1` — Flask scaffolded but not instantiated
- **Git remote**: `xepoctpat/tectonic-solar`, `main` branch
- **Git email**: `xepoctpat@users.noreply.github.com`
- **No API keys** anywhere in the codebase
