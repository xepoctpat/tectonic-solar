---
name: space-earth-change-continuation
description: "Resume a Space-Earth Monitor change from a handoff, recap, or partially validated checkpoint. Use for continuation planning, preserving validated PB2002/UI/runtime work, separating unrelated regressions, and choosing the next safe step."
argument-hint: "Paste the handoff, recap, or current checkpoint and describe what should happen next."
---

# Space-Earth Change Continuation

## What it does

Runs a continuity-first workflow for resuming in-progress Space-Earth Monitor work from a handoff, recap, or partially validated checkpoint without discarding validated results or blurring unrelated issues together.

## When to use

- Picking up work from a dated handoff in `docs/handoff/`
- Continuing a partially validated frontend, map, runtime, or research change
- Deciding whether the next step should be investigation, implementation, validation, or docs follow-through
- Resuming PB2002 tectonic baseline work while preserving the cited local artifacts and honest fallback attribution
- Checking whether a new degraded endpoint or runtime symptom is actually related to the most recent change

## Procedure

1. **Reconstruct the current baseline**
   - Read the latest relevant handoff, recap, and closest docs before changing code.
   - Treat the recap as a claim set, not proof.
   - Confirm which validations were actually run and which were only proposed.

2. **Preserve what is already validated**
   - Keep already validated outcomes unless the current repo state or fresh checks contradict them.
   - If tectonic work is involved, keep the cited local PB2002 artifacts as the default tectonic study baseline when they are already wired and validated.
   - Preserve honest fallback attribution wherever the app still has a degraded or sketch fallback.

3. **Split concerns before acting**
   - Separate:
     - validated baseline to preserve
     - possible regression or degraded endpoint to investigate
     - optional polish or research follow-up
   - Do not flatten unrelated issues together. For example, `/api/health` returning `503` is not automatically evidence of a frontend or tectonic regression.

4. **Choose the smallest next step with the highest payoff**
   - Rank plausible next actions by risk reduction and likely information gain.
   - Prefer the next step that reduces uncertainty fastest.
   - If the work becomes implementation-heavy, follow [Space-Earth Safe Change](../space-earth-safe-change/SKILL.md).
   - If the next concern is runtime or health degradation, follow [Space-Earth Runtime Degradation](../space-earth-runtime-degradation/SKILL.md).
   - If the issue turns out to be feed or proxy related, follow [Space-Earth Feed Change](../space-earth-feed-change/SKILL.md).

5. **Validate proportionally**
   - Re-run the closest honest checks for the surface you touched.
   - Preserve previous validation results when they still apply, but do not pretend an old smoke test covers a newly suspected server/runtime failure.
   - Keep conclusions separated into validated, plausible-but-untested, and speculative.

6. **Sync continuity docs when needed**
   - If the session materially changes behavior, workflow, or interpretation, update the closest docs in the same stretch of work.
   - If the session creates a meaningful new checkpoint, add a dated handoff file and keep `docs/handoff/HANDOFF.md` current.
   - For lighter continuity snapshots, use [Create Space-Earth Micro-Handoff](../../prompts/create-space-earth-micro-handoff.prompt.md).

## Useful starting points

### Runtime / continuity
- [Copilot Instructions](../../copilot-instructions.md)
- [Developer Quick Reference](../../../docs/development/DEV-QUICK-REFERENCE.md)
- [Handoff Index](../../../docs/handoff/HANDOFF.md)

### Tectonic baseline / map surface
- [Tectonic Build Script](../../../scripts/build-pb2002-boundaries.mjs)
- [Config](../../../public/src/js/config.js)
- [Map](../../../public/src/js/map.js)
- [Main](../../../public/src/js/main.js)
- [Index](../../../public/index.html)
- [Service Worker](../../../public/sw.js)
- [PB2002 Boundaries](../../../public/data/tectonics/pb2002-boundaries.geojson)
- [PB2002 Plates](../../../public/data/tectonics/pb2002-plates.geojson)

### No-build UI layer
- [Design Tokens](../../../public/src/css/variables.css)
- [Base CSS](../../../public/src/css/base.css)
- [Components CSS](../../../public/src/css/components.css)
- [Map CSS](../../../public/src/css/map.css)

### Validation / follow-through
- [Testing Checklist](../../../docs/testing/TESTING-CHECKLIST.md)
- [Update Space-Earth Docs](../../prompts/docs-sync.prompt.md)

## Completion checks

- The current baseline is restated accurately instead of guessed.
- Already validated outcomes are preserved unless contradicted by fresh evidence.
- The chosen next step is justified by risk reduction or information gain.
- Unrelated failures are not blamed on the latest visible UI change without evidence.
- Relevant docs or handoff notes are updated when the session meaningfully changes the project state.