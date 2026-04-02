---
name: space-earth-feed-change
description: "Add or modify public data feeds and proxy routes for Space-Earth Monitor. Use for NOAA, USGS, Open-Meteo, or research-sidecar endpoint work in server.js, config.js, fetchWithRetry integration, query validation, and graceful fallback behavior."
argument-hint: "Describe the feed, endpoint, parser, or proxy change you need."
---

# Space-Earth Feed Change

## What it does

Guides safe addition or modification of live data feeds so new endpoints fit the repo's proxy model, resilience patterns, and scientific guardrails.

## When to use

- Adding a new NOAA, USGS, Open-Meteo, or other public keyless feed
- Updating query validation or response handling in `server.js`
- Wiring a new frontend endpoint into `config.js` and a feature module
- Adding archive parsing helpers for historical research inputs
- Tightening fallback or retry behavior for unstable upstreams

## Procedure

1. **Confirm the source qualifies**
   - Public and keyless only.
   - No server-side database or long-lived cache.
   - Fits the app's live-data model and research scope.

2. **Choose the correct layers**
   - `server.js` for proxy routing, validation, rate limiting, and upstream fetch rules.
   - `public/src/js/config.js` for browser-facing endpoint constants.
   - Feature modules such as `spaceWeather.js`, `seismic.js`, `environment.js`, or `researchCompute.js` for consumption.
   - Small pure helpers (for example archive parsers) when response transformation deserves isolated validation.

3. **Implement the proxy layer first**
   - Validate and sanitize request parameters.
   - Keep Node/Express as the public surface area.
   - Do not expose Python or third-party services directly to the browser.
   - For flaky non-critical feeds, prefer graceful degradation over app-breaking hard failure when that matches existing repo behavior.

4. **Wire the frontend through repo conventions**
   - Add or update the local proxy URL helper in `config.js`.
   - Use `fetchWithRetry()` or `fetchWithTimeout()` instead of hardcoded bare `fetch` calls.
   - Avoid hardcoding upstream vendor URLs in UI modules.
   - Push shared results through `store.js` and existing publish/render flows when appropriate.

5. **Keep failure behavior honest and usable**
   - Log non-critical failures through the repo's error-handling path.
   - Preserve clear empty or degraded states instead of pretending data exists.
   - Only surface user-facing notifications when they help actionability.

6. **Validate the whole path**
   - Check the local proxy response shape.
   - Launch the app and confirm the affected tab, chart, list, or status card renders.
   - Run the nearest smoke/manual test for the changed surface.
   - If archive parsing was added, verify it with a small deterministic sample.

7. **Sync the docs**
   - Update `README.md` or `DEV-QUICK-REFERENCE.md` if the feed materially changes runtime behavior.
   - Update `docs/testing/TESTING-CHECKLIST.md` when new validation steps are needed.
   - Record known upstream weakness or fallbacks rather than hiding them.

## Completion checks

- The upstream source is public, keyless, and appropriate for the repo.
- `server.js` validates inputs and protects the public app surface.
- Frontend code calls the local proxy path through `config.js`.
- Retry/fallback behavior is deliberate and graceful.
- Relevant docs and testing guidance reflect the new endpoint.
