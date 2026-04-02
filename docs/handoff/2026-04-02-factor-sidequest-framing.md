# 2026-04-02 — Factor Sidequest Framing

## Goal

Document the research framing that optional factors — including sidereal or synodic phase experiments — are **sidequests** that may extend the main storm-lag hypothesis, but do not replace it by default.

## What changed

1. Updated `docs/research/RESEARCH.md`
   - Added a scope-discipline section distinguishing:
     - the **primary** storm-lag hypothesis
     - **extended** factor-conditioned variants
   - Added guardrails so optional factor models stay research-only until they outperform the simpler baseline.
   - Added a new research-extension subsection for optional factor-model experiments.

2. Updated `docs/planning/ROADMAP.md`
   - Added a near-term planning lane that keeps optional factor models subordinate to the baseline.
   - Added advanced-research roadmap items for:
     - factor-model bakeoffs
     - optional sidereal/synodic sidequests
     - out-of-sample scorecards

3. Updated `docs/handoff/HANDOFF.md`
   - Indexed this checkpoint in the standalone handoff list.

## Why this matters

This reframing keeps the project scientifically cleaner:

- the app still has one central falsifiable question;
- optional factors can be tested without quietly swapping out the main theory; and
- future contributors have a written rule that “interesting periodic factor” does **not** automatically become “default app claim.”

## Validation

- Static markdown/error validation on the updated docs
- Readback confirmation that the reframing and roadmap now exist in the canonical research and planning docs

## Risks / open points

- No factor model is implemented yet; this checkpoint is framing + planning only.
- A future sidereal/synodic experiment still needs preregistered definitions:
  - exact period
  - phase convention
  - binning
  - comparison periods
  - scoring criteria

## Best next step

If and when factor work begins, first add provenance-ready factor fields to the normalized research corpus, then compare:

1. storm-only baseline
2. storm + tectonic-setting factors
3. storm + periodic-factor sidequests

Only promote a factor model if it improves calibrated, out-of-sample behavior instead of merely fitting the retrospective record more attractively.