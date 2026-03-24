# Handoff: NOAA proxy resilience + frontend error telemetry

## Summary
This handoff captures the stabilization work that removed remaining browser console errors in both runtime modes:
- Proxy/API mode (`server.js` on `:3001` during validation)
- Static mode (`:8000`)

The root issue was an upstream NOAA plasma endpoint failure surfacing as a browser resource error.

## Root Cause
- Browser console error persisted due to `GET /api/noaa/rtsw-plasma` returning `502`.
- Non-critical upstream NOAA failures were not gracefully degraded, causing noisy client-side errors.

## Changes Implemented

### Backend (`server.js`)
- Added `fetchWithRetry(url, maxRetries = 1)` with retry/backoff behavior.
- Extended proxy behavior to support `fallbackOnError` for non-critical upstream failures.
- For selected NOAA endpoints, returns graceful fallback (`200` with `[]`) instead of propagating `502`.
- Added telemetry endpoint:
  - `POST /api/proto-sir/log-event`

### Frontend (`src/js/error-logger.js`, `src/js/main.js`, `src/js/spaceWeather.js`)
- Added new `ErrorLogger` utility with:
  - error classification (`isCritical`)
  - `logError(...)`
  - `fetchWithLogging(...)`
  - global listeners for uncaught errors/rejections
- Bootstrapped logger in `main.js`.
- Integrated non-critical space weather fallback logging in `spaceWeather.js` plasma fetch path.

### Smoke Diagnostics (`scripts/tab-smoke-test.mjs`)
- Enhanced smoke report to capture HTTP error URLs and statuses (`httpErrors`).
- Upgraded console-error capture details for faster root-cause isolation.

### Minor cleanup (`index.html`)
- Removed stray literal text in `<head>` that did not belong in markup.

## Validation Results

### Proxy mode (`APP_URL=http://localhost:3001`)
- Health endpoint: `200` / `ok=true`
- Tabs: 6/6 pass
- Console errors: **0**

### Static mode (`APP_URL=http://localhost:8000`)
- Health endpoint: not applicable (`0` / `ok=false` expected for static)
- Tabs: 6/6 pass
- Console errors: **0**

## Operational Notes
- During this session, an existing `:3000` process could not be cleanly reclaimed from the active shell context.
- A fresh server was run on `:3001` for final verification.
- Generated artifacts (`test-results/`, screenshots/log files) are not required for source commit.

## Recommended Next Steps
1. Keep NOAA fallback list scoped to non-critical feeds only.
2. Route telemetry events into persistent storage/analysis if desired.
3. Optionally add a small dashboard metric for fallback-hit counts by endpoint.
