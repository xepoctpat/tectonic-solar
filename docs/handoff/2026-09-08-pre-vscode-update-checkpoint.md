# Checkpoint: pre–VS Code update (2026-09-08)

**Goal:** Sync security work, keep the SpaceXAI key **out** of this public repo, and freeze a working tree before the next VS Code installer click.

## Current checkpoint

- `main` fast-forwarded to `origin/main` (`b8a174f` and the 8 Dependabot commits that were sitting upstream).
- Local AI Briefing + panel-reorder work is on top of that, **without** committing any API key.
- Briefing default is a **local snapshot writer** in `ai-briefing.js`. Grok is optional and server-only (`.env`, gitignored).
- CodeQL leftovers from open PRs #8 / #9 applied more completely than the autofix branches:
  - SPA fallback is rate-limited and uses Express 5 `/{*splat}` (Dependabot already moved the app to Express 5.2.1).
  - Python sidecar 400/500 responses no longer return `str(exc)` to the client (alerts 8–11).
- `qs` is overridden to **6.16.0** (CVE-2026-82562; Dependabot had only moved us to still-vulnerable 6.15.3).

## Validation already run (this session)

| Check | Result |
|---|---|
| `git pull --ff-only origin main` | Applied; local `main` was 8 commits behind |
| Tab smoke on Express 5 | **8/8** tabs, 0 console errors |
| `GET /ai` SPA fallback | 200, AI tab present |
| `POST /api/ai/briefing` without a key | Live snapshot + full local markdown briefing (`briefing_engine: local`) |
| `npm run test:hypothesis-sim` | 3/3 scenarios passed |
| `pytest tests/test_research_stats.py` | 3 passed |
| `npm install` after qs override | **0 vulnerabilities** |
| Secret scanning | No open alerts |
| Open GitHub issues | None |

GitHub Dependabot alert #10 and CodeQL 7–11 should close after this commit is on `origin/main`.

## Security branches / PRs

| Item | Decision |
|---|---|
| Dependabot PRs #4–#7 (already merged upstream) | Pulled |
| `origin/alert-autofix-7` / PR #9 (SPA rate limit) | Logic landed here; Express 5 path syntax also fixed |
| `origin/alert-autofix-11` / PR #8 (one sidecar `message` field) | Incomplete — all four `str(exc)` returns removed instead |
| Open Dependabot alert #10 (`qs` ≤ 6.15.3) | Override to 6.16.0 |

Do **not** merge the autofix PRs as-is after this: they would conflict and #8 would leave three CodeQL hits.

## Risks / caveats

- **No `XAI_API_KEY` in git, `.env.example`, or `public/`.** Visitors to a public clone get the local briefing. A private host may set the env var; the browser never sees it.
- Express 5 came in via Dependabot. Catch-all `*` is invalid there; if the SPA fallback is wrong, deep links 404.
- NOAA plasma is still degraded (IMAP transition). Briefing states that honestly.
- `.preview-upgrade/` is a scratch download and stays gitignored.

## Immediate next step

1. You can click the VS Code update. This repo checkpoint does not depend on the editor version.
2. After push, close PRs #8 and #9 with a pointer to this commit rather than merging the autofix branches.
3. Re-run `npm run test:tabs` once on Express 5 if you want a post-update smoke.
