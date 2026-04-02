---
description: "Update the right existing docs after a Space-Earth Monitor code, runtime, research, or workflow change."
name: "Update Space-Earth Docs"
argument-hint: "Describe the change or point to the files/feature that need documentation updates."
agent: "agent"
---

Update documentation for the described change in this repository.

Requirements:
- Inspect the changed files and the closest relevant existing docs before editing.
- If the change touches the 27–28 day lag workflow, inspect the actual hypothesis implementation surfaces before editing docs:
  - [Hypothesis Core](./public/src/js/hypothesis-core.mjs)
  - [Correlation Module](./public/src/js/correlation.js)
  - [Prediction Module](./public/src/js/prediction.js)
  - [Research Compute](./public/src/js/researchCompute.js)
  - [Hypothesis Simulation](./scripts/hypothesis-sim.mjs)
- Prefer updating existing docs over creating new markdown files.
- Choose the smallest set of docs that keeps future developers from being confused.
- Record all of the following when applicable:
  - what changed
  - why it changed
  - what was validated
  - what still looks weak, risky, misleading, or incomplete
- Do not rewrite historical docs as if they always said the new thing; annotate as superseded when needed.

Start with these likely targets and use only the ones that fit:

### Runtime / developer workflow
- [README](./README.md)
- [Developer Quick Reference](./docs/development/DEV-QUICK-REFERENCE.md)
- [Copilot Instructions](./.github/copilot-instructions.md)

### Hypothesis method / evidence / planning
- [Research Notes](./docs/research/RESEARCH.md)
- [Roadmap](./docs/planning/ROADMAP.md)

### Validation / troubleshooting
- [Testing Checklist](./docs/testing/TESTING-CHECKLIST.md)
- [Testing Troubleshoot](./docs/testing/TESTING-TROUBLESHOOT.md)

### Session recap / historical context
- [Handoff Index](./docs/handoff/HANDOFF.md)

If the session produced meaningful validated outcomes, create a new dated handoff file in `docs/handoff/` (`YYYY-MM-DD-short-title.md`) and keep the handoff index current.

When the change is hypothesis-related, keep documentation separated by concern rather than mixing runtime setup, statistical method, validation, and planning into a single catch-all edit.

Return:
1. which docs were updated and why
2. what validation was captured
3. what still needs follow-up
