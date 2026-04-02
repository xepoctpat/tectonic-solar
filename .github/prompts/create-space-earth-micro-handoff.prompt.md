---
description: "Create a concise Space-Earth Monitor micro-handoff from the current session or checkpoint. Use for files changed, validation run, risks, and immediate next step."
name: "Create Space-Earth Micro-Handoff"
argument-hint: "Describe the current checkpoint, recent changes, or the session you want summarized."
agent: "agent"
---

Create a concise micro-handoff for the described Space-Earth Monitor checkpoint.

Requirements:
- Reconstruct the checkpoint from the current repo state, changed files, validation notes, and the user-provided recap before writing.
- Treat claimed validation as provisional until you confirm whether it was actually run in this session or is documented elsewhere in the repo.
- Keep the summary short, specific, and continuity-focused.
- Capture all of the following when they apply:
  - active user goal
  - files changed or most relevant files
  - validation already run
  - current risks, caveats, or unresolved degradations
  - immediate next step
- Distinguish clearly between:
  - validated
  - plausible but not yet rechecked
  - still unknown or speculative
- Do not rewrite history as if uncertainties were resolved.
- If the checkpoint is substantial enough to matter beyond the current chat, create a new dated file in `docs/handoff/` using `YYYY-MM-DD-short-title.md` and update [Handoff Index](./docs/handoff/HANDOFF.md).
- If it is only a lightweight continuity note, return the micro-handoff in chat without creating a repo file.

Useful starting points when relevant:

### Continuity / inventory
- [Copilot Instructions](./.github/copilot-instructions.md)
- [Developer Quick Reference](./docs/development/DEV-QUICK-REFERENCE.md)
- [Handoff Index](./docs/handoff/HANDOFF.md)
- [Space-Earth Change Continuation](./.github/skills/space-earth-change-continuation/SKILL.md)

### Validation / troubleshooting
- [Testing Checklist](./docs/testing/TESTING-CHECKLIST.md)
- [Testing Troubleshoot](./docs/testing/TESTING-TROUBLESHOOT.md)

Return concise sections:
1. **Goal**
2. **Current checkpoint**
3. **Validation already run**
4. **Risks / caveats**
5. **Immediate next step**