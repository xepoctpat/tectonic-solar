# 2026-04-02 — Stack Lanes and Docker Direction

## Goal

Adopt the assessed lane-based stack direction before the research workflow sprawls:

- keep the no-build browser + Node proxy runtime intact;
- strengthen the optional Python research environment with interpretable modeling and evaluation tools; and
- record Docker as a future reproducibility/deployment option rather than a change to the current runtime model.

## What changed

1. Updated `requirements.txt`
   - Added `statsmodels==0.14.6`
   - Added `scikit-learn==1.8.0`

2. Updated `README.md`
   - Documented the optional Python research stack more explicitly.
   - Added a note that Docker is future/optional and should not replace the normal local workflow.

3. Updated `docs/development/DEV-QUICK-REFERENCE.md`
   - Expanded the stack summary to include the Python research toolbelt.
   - Added a containerization-direction section with guardrails.

4. Updated `docs/planning/ROADMAP.md`
   - Recorded the Python research stack standardization.
   - Added Docker/Compose as an optional Phase 8 reproducibility lane.

5. Updated `docs/operations/DEPLOYMENT.md`
   - Replaced the stale Docker example that used `python -m http.server` as the public runtime.
   - Reframed Docker as future/optional and aligned the example with the real Node entry point.

6. Updated `.github/agents/space-earth-lab.agent.md`
   - Brought the agent guidance in line with the actual Python packages now present in `requirements.txt`.

## Validation

- Installed the new Python packages inside `solar-env`
- Import/version check succeeded:
  - `statsmodels=0.14.6`
  - `scikit-learn=1.8.0`

## Why this matters

This checkpoint locks in a cleaner architecture boundary:

- **App/runtime lane** → browser ES modules + Node proxy
- **Research lane** → optional Python compute with interpretable statistical tools
- **Packaging lane** → Docker only when it improves reproducibility, not because the project needs another moving part today

## Risks / open points

- Package availability was validated in the current Windows venv, but future CI/container environments still need explicit validation.
- No new research model code was added yet; this checkpoint establishes the toolbelt and the direction.
- If Docker is added later, it should not become mandatory unless the standard local workflow stops being practical.

## Best next step

Use the new Python stack for the first genuinely useful research extension:

1. preserve the storm-only baseline,
2. add factor provenance fields,
3. build a scorecard comparing baseline vs factor-conditioned models,
4. keep any sidereal/synodic experiment explicitly optional and research-only.