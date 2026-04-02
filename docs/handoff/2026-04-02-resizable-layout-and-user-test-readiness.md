# 2026-04-02 — Resizable layout + user-test readiness checkpoint

## Goal

Make the non-map UI easier to test with humans by introducing resizable split workspaces, reducing `Correlation` tab overload, and preserving the map as the dominant primary research surface.

## Current checkpoint

This checkpoint adds a **7-tab** app structure with a clearer separation between quick-readout correlation UX and deeper research workflow UX.

### Main behavior changes

- The `Map` tab remains the primary 2D research surface and was not converted into a resizable split workspace.
- `Space Weather`, `Seismic`, `Environment`, and `Settings` now use a reusable split layout with:
  - draggable vertical splitter
  - vertically resizable cards/panels
  - persisted layout state in `localStorage`
  - responsive collapse on narrow screens
- `Correlation` is now the quick summary surface:
  - research background
  - active 27–28 day window state
  - descriptive probability card
  - 30-day timeline
  - summary stats
- A new `Research Lab` tab now owns the heavier research workflow:
  - full research foundation load
  - historical EQ archive load
  - NOAA storm archive load
  - workflow state panel
  - bootstrap null calibration
  - 0–60 day lag scan

### Most relevant files changed

- UI structure / behavior:
  - `public/index.html`
  - `public/src/js/layout.js`
  - `public/src/js/main.js`
  - `public/src/js/tabs.js`
  - `public/src/css/components.css`
- Smoke coverage / docs:
  - `scripts/tab-smoke-test.mjs`
  - `README.md`
  - `docs/development/DEV-QUICK-REFERENCE.md`
  - `docs/testing/TESTING-CHECKLIST.md`
  - `docs/testing/TESTING-TROUBLESHOOT.md`
- Validation artifacts refreshed:
  - `test-results/tab-smoke/`

## User-test readiness recommendation

**Yes — good enough for a focused user test.**

That recommendation is for a **guided usability / workflow test**, not for claiming the app is fully hardened.

What is strong enough now:

- the app renders cleanly across all current tabs
- the new `Correlation` vs `Research Lab` split is implemented and documented
- non-map panels are resizable without changing the no-build architecture
- the latest smoke run passed with live runtime health green

What is still not fully closed:

- manual drag/resizer ergonomics were not deeply tested across browsers and touch devices in this session
- upstream live-data reliability can still vary even when local UI is healthy
- this remains an exploratory research dashboard, not a validated earthquake-prediction product

Best use of the next user test:

1. Check whether users understand the new tab split.
2. Observe whether the resizers are discoverable and feel useful.
3. Watch whether people can tell the difference between quick correlation summary and deeper research tooling.
4. Confirm the map still feels like the main surface rather than a peer among equals.

## Validation completed in this checkpoint

Validated in this session:

- `npm run test:hypothesis-sim` → passed
- `$env:APP_URL='http://localhost:3000'; node scripts/tab-smoke-test.mjs` → **7/7 tabs passed**
  - `map`
  - `space`
  - `seismic`
  - `env`
  - `correlation`
  - `research`
  - `settings`
- Browser smoke reported:
  - `health.status = 200`
  - `health.ok = true`
  - `0 console errors`
  - `0 page errors`
  - `0 request failures`
- Editor/static error checks on changed UI/docs files → no reported file errors

Operational note:

- Attempting `npm start` in a new terminal returned `EADDRINUSE` on port `3000`, which indicated an existing local app instance was already running. The smoke test then succeeded against that running instance.

## Risks / caveats

- This is ready for **limited user testing**, not a broad “done” declaration.
- Splitter and resize behavior still deserve a short manual pass at desktop/tablet/mobile breakpoints.
- Live upstreams remain a separate source of variability; a clean local UI does not guarantee all remote feeds stay healthy.
- The research interpretation remains explicitly conservative:
  - descriptive probability is not proof
  - lag-scan diagnostics remain exploratory
  - bootstrap/null logic still depends on the optional local Python sidecar for heavier calibration
- This checkpoint has **not** yet been committed/pushed.

## Immediate next step

If resuming tomorrow, the safest next action is:

1. run one short manual usability pass on splitter/resizer behavior at `375px`, `768px`, and `1440px`
2. gather user feedback specifically on the `Correlation` vs `Research Lab` separation
3. decide whether any quick polish is needed before commit/push

If no material usability issues appear, the next repo action can simply be:

- commit the layout/docs/test updates
- refresh the handoff if the user test reveals anything surprising
