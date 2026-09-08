# Handoff: AI Situation Briefing + panel reorder (Emergent preview port)

**Date:** 2026-09-08  
**Source preview:** https://bold-zhukovsky-6.preview.emergentagent.com/  
**Goal:** Adapt that upgrade onto the current local `tectonic-solar` tree without overwriting later science work.

## What the preview added (and local already had)

The preview is the same no-build TECTONIC-SOLAR HUD, not a rewrite. Local was already ahead on research math, EMSC merge, coupling metrics, and PB2002 vectors. The preview’s extra UX was:

1. **AI Situation Briefing** tab — SSE chat / full briefing / UTC-day digest, live NOAA+USGS context chips, saved questions.
2. **Panel reorder + collapse** — toolbar on every `data-panel-id` card, persisted order, Settings → Reset Layout.
3. Service-worker cache list / version bump, and a one-shot reload when a new worker takes control.

The preview backend used **Claude**. Local default is a **keyless snapshot writer**. Optional Grok is server-only (`XAI_API_KEY` in gitignored `.env`). The public repo and the browser never get a key.

## What landed locally

| Surface | Change |
|---|---|
| `public/index.html` | AI tab between Correlation and Research Lab; Reset Layout; Grok copy; feature bullets |
| `public/src/js/ai.js`, `public/src/css/ai.css` | Briefing UI + SSE client |
| `public/src/js/panels.js`, `public/src/css/panels.css` | Reorder / collapse / drag |
| `public/src/js/layout.js`, `main.js`, `tabs.js`, `config.js`, `sw.js` | Wiring; SW cache `v12` |
| `ai-briefing.js` + `server.js` | `POST /api/ai/briefing` SSE; shared `loadGlobalSeismic()`; 8 req/min limiter |
| `.env.example` | `XAI_API_KEY` / optional `XAI_MODEL` |

Without a key, **Generate Briefing** still writes a full local briefing from the live snapshot. With a private host key, Grok is grounded in that snapshot and is instructed not to predict earthquakes.

## Do not put a key in this public repo

The briefing tab does not need SpaceXAI. If a private deployment wants Grok, set `XAI_API_KEY` in a gitignored `.env` on that host only.

## Validation intended this session

- Tab smoke includes the new `ai` tab (`#ai-conversation`).
- `POST /api/ai/briefing` returns `text/event-stream` with a `context` event even when `XAI_API_KEY` is unset.
- Existing science modules were not replaced from the preview dump.

## Not ported / still true

- Preview science files that were smaller than local were **not** copied over.
- `.preview-upgrade/` is a scratch download and is gitignored.
- The briefing is **not** a research-lab statistic and must not be treated as lag-scan evidence.
