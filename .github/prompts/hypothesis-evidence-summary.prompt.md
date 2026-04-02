---
description: "Summarize evidence quality for the 27–28 day lag hypothesis or a related analysis change in Space-Earth Monitor. Use for conservative support/null/off-target interpretation."
name: "Summarize Hypothesis Evidence"
argument-hint: "Describe the claim, lag window, module change, or result you want assessed."
agent: "Space-Earth Lab"
---

Summarize the current evidence quality for the described lag/correlation claim or analysis change.

Requirements:
- Inspect the closest relevant code and docs before concluding.
- State what would count as support, null-consistent behavior, off-target behavior, or falsification.
- Separate findings into:
  - proven by code/tests
  - plausible but not well-supported yet
  - speculation or method-limited claims
- If no validation was actually run, say so plainly.
- Do not upgrade correlation into causation or predictive certainty.

Useful starting points when relevant:

### Shared analysis / orchestration
- [Hypothesis Core](./public/src/js/hypothesis-core.mjs)
- [Prediction Module](./public/src/js/prediction.js)

### Legacy/basic browser correlation UI
- [Correlation Module](./public/src/js/correlation.js)

### Optional Python compute bridge
- [Research Compute](./public/src/js/researchCompute.js)

### Validation / method context
- [Hypothesis Simulation](./scripts/hypothesis-sim.mjs)
- [Research Notes](./docs/research/RESEARCH.md)
- [Roadmap](./docs/planning/ROADMAP.md)
- [Testing Checklist](./docs/testing/TESTING-CHECKLIST.md)

Keep these concerns separate in the summary. Do not imply that a UI regression, a lag-scan math change, and a sidecar issue are the same kind of evidence problem.

Return concise sections:
1. **Question**
2. **Evidence**
3. **Changes**
4. **Validation**
5. **Risks / Next checks**
