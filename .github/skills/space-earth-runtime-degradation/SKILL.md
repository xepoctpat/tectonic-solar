---
name: space-earth-runtime-degradation
description: "Investigate degraded Space-Earth Monitor runtime, health endpoint, or proxy behavior. Use for /api/health 503, startup failures, route-specific breakage, smoke/runtime mismatches, and distinguishing upstream degradation from local regressions."
argument-hint: "Describe the degraded endpoint, startup symptom, or runtime mismatch you want investigated."
---

# Space-Earth Runtime Degradation

## What it does

Runs a focused troubleshooting workflow for Space-Earth Monitor runtime and proxy issues so degraded endpoints, startup failures, and smoke-test mismatches are investigated without casually blaming the most recent visible UI change.

## When to use

- `/api/health` returns `503`
- The app launches but one or more proxy-backed features degrade
- A smoke test fails even though recent UI or data-layer work seemed validated
- A specific route, feed, or sidecar path looks broken and needs isolation
- You need to determine whether the problem is local runtime, upstream instability, proxy contract drift, or a real app regression

## Procedure

1. **Establish the runtime state first**
   - Use the Node proxy runtime, not the Python static server, for real troubleshooting.
   - Confirm whether the local app shell loads at `http://localhost:3000`.
   - Check whether the symptom is:
     - full startup failure
     - route-specific failure
     - degraded upstream status
     - client-side asset or rendering regression

2. **Interpret `/api/health` honestly**
   - A `503` on `/api/health` can mean the local Node server is running while one or more upstream feeds are degraded.
   - Do not equate a `503` health response with total app failure unless the local app shell or static assets also fail.
   - Check the failing upstream category before changing unrelated frontend code.

3. **Isolate the narrowest failing surface**
   - For launch / route issues: inspect `server.js` and the relevant route contract.
   - For browser fetch or contract issues: inspect `public/src/js/config.js`, `utils.js`, and the consuming feature module.
   - For sidecar-related issues: inspect `public/src/js/researchCompute.js` and `scripts/research_sidecar.py`.
   - For NOAA/USGS/Open-Meteo route work, follow [Space-Earth Feed Change](../space-earth-feed-change/SKILL.md).

4. **Preserve honest degradation behavior**
   - NOAA instability is expected in some paths; do not “fix” it by making the app brittle or pretending degraded data is healthy.
   - Prefer explicit degraded states, scoped logging, and targeted retries over global breakage or silent optimism.

5. **Validate proportionally**
   - Re-run the smallest honest check that matches the suspected surface:
     - exact route response
     - targeted tab/runtime path
     - smoke test if the issue crosses multiple surfaces
   - Do not claim a global fix because one unrelated tab still passes.

6. **Record the outcome clearly**
   - State whether the issue was:
     - local runtime failure
     - upstream degradation
     - proxy contract mismatch
     - frontend regression
     - still unresolved
   - If the result creates a meaningful checkpoint, use [Create Space-Earth Micro-Handoff](../../prompts/create-space-earth-micro-handoff.prompt.md) or add a dated handoff file.

## Useful starting points

### Runtime / proxy surface
- [Server](../../../server.js)
- [Config](../../../public/src/js/config.js)
- [Utils](../../../public/src/js/utils.js)
- [Copilot Instructions](../../copilot-instructions.md)

### Feature modules commonly involved
- [Space Weather](../../../public/src/js/spaceWeather.js)
- [Environment](../../../public/src/js/environment.js)
- [Map](../../../public/src/js/map.js)
- [Research Compute](../../../public/src/js/researchCompute.js)

### Validation / debugging context
- [Testing Troubleshoot](../../../docs/testing/TESTING-TROUBLESHOOT.md)
- [Testing Checklist](../../../docs/testing/TESTING-CHECKLIST.md)
- [Space-Earth Safe Change](../space-earth-safe-change/SKILL.md)
- [Space-Earth Change Continuation](../space-earth-change-continuation/SKILL.md)

## Completion checks

- The failure mode is isolated before code changes are proposed.
- `/api/health` is interpreted as a mixed-signal endpoint, not a simplistic binary.
- Upstream degradation is not mislabeled as a frontend regression without evidence.
- Any implemented fix is validated at the narrowest honest layer and escalated only if needed.