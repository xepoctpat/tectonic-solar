---
name: space-earth-hypothesis-check
description: "Conservatively validate 27–28 day lag and correlation claims in Space-Earth Monitor. Use for hypothesis-core.mjs, correlation.js, prediction.js, NOAA dayind archive work, bootstrap null tests, interpretation copy, and research-method documentation."
argument-hint: "Describe the hypothesis question, lag-analysis change, or evidence check you want to run."
---

# Space-Earth Hypothesis Check

## What it does

Applies a conservative scientific workflow to changes or claims involving the space-weather to seismic lag hypothesis so the project distinguishes null-consistent results from actual candidate evidence.

## When to use

- Editing `hypothesis-core.mjs`, `correlation.js`, `prediction.js`, or `researchCompute.js`
- Changing interpretation text, confidence labels, or research UI states
- Working with NOAA/NCEI storm archive loading or historical ComCat backfill
- Running or reviewing simulation, bootstrap, or null-calibration behavior
- Updating research documentation about what the app can and cannot claim

## Procedure

1. **State the research question before touching the result**
   - What is being tested?
   - What would the null expectation look like?
   - What outcome would count as off-target, weak, or genuinely worth further follow-up?

2. **Load the relevant evidence context**
   - Read `README.md`, `docs/research/RESEARCH.md`, `docs/planning/ROADMAP.md`, and `docs/testing/TESTING-CHECKLIST.md`.
   - Inspect the closest code modules involved in the claim or workflow:
     - `public/src/js/hypothesis-core.mjs` for shared lag-analysis logic and interpretation states
     - `public/src/js/prediction.js` for historical loading and full-analysis orchestration
     - `public/src/js/correlation.js` for the older/basic window + Pearson UI path
     - `public/src/js/researchCompute.js` for the optional Python null-calibration bridge
     - `scripts/hypothesis-sim.mjs` for deterministic regression checks

3. **Separate the type of change**
   - Core analysis math (`hypothesis-core.mjs`)
   - Archive/data-loading path (`prediction.js`, `stormArchive.mjs`)
   - Interpretation or UX messaging (`prediction.js`, `correlation.js`, UI copy)
   - Optional Python research compute (`researchCompute.js`, sidecar code)
   - Deterministic validation harness (`scripts/hypothesis-sim.mjs`)

4. **Validate with escalating evidence**
   - Run the deterministic hypothesis simulation first.
   - For browser-side historical work, launch the app and use the full research-foundation workflow.
   - If null calibration or heavier statistics are required, activate `solar-env` first and use the local Python sidecar or targeted tests.
   - Keep Python local-only and proxied through Node rather than exposing it directly to the browser.

5. **Interpret outputs conservatively**
   Use explicit buckets such as:
   - insufficient data
   - null-consistent
   - off-target peak
   - weak 25–30 day bump
   - candidate signal worth more checking

   Do **not** convert these into causal claims or prediction certainty.

6. **Write down what is actually known**
   - Proven by code/tests
   - Plausible but not yet well-supported
   - Still speculative or method-limited

7. **Update docs with the same honesty**
   - Sync research-method changes to the relevant docs.
   - Keep runtime setup, statistical method, troubleshooting, and planning docs separated by concern.
   - Record weaknesses, assumptions, and next checks instead of only optimistic outcomes.

## Completion checks

- The null framing was stated explicitly.
- A simulation, targeted app check, or statistical validation was actually run.
- Results are classified conservatively rather than oversold.
- Research docs reflect both support and uncertainty.
