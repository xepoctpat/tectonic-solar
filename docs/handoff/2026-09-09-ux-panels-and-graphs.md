# Handoff: UX panels, graphs, and motion bugs

**Date:** 2026-09-09  
**Focus:** Dashboard cards, Chart.js graphs, and interaction bugs that still frames hide (clipping, re-animate on resize, toasts over the map).  
**Also in this wrap-up commit:** the still-uncommitted 2026-09-08 ranked-feed checkpoint (RTSW wind successor, GFZ GEOFON, GFZ Kp, map volcanoes).

## What was wrong

1. **Panels clipped their own charts.** `.data-card { overflow: hidden }` won over `.resizable-panel { overflow: auto }` by source order. Stored panel heights from ResizeObserver then froze the squeeze. Solar wind, Kp, Dst, magnitude, AQI, and lag-scan canvases sat below the fold with no inner scroll.
2. **Correlation timeline Y-scale was meaningless.** Storms were plotted at `100 + Kp×10` (≈150–190). With no M5+ quakes the axis auto-ranged to 152–172. The caption promised green 27–28 day lag lines that were never drawn.
3. **Layout changes destroyed every chart.** Splitter drag, panel resize, and tab switches called `redrawCachedCharts()`, which destroyed Chart.js instances and replayed the 700 ms animation. That is the flicker stills miss.
4. **Toasts covered map style buttons.** `#toast-container` sat at `top: 80px`. First load also toasted “Correlation Data Updated” on the Map tab.
5. **Research workflow selects overflowed** (`min-width: 200px` inside a tight grid cell). Hover-lift on resizable cards made the HUD jump.
6. **Narrow screens stacked with overlap.** The 60% split was applied as pane *height* in the column breakpoint, so Space Weather cards painted on top of each other.
7. **Filled-line holes looked like a layout bug.** Chart.js leaves a gap at `null` (`spanGaps: false`). Two mapper bugs made that louder than the live feed: `Number(dst) || null` treated quiet **Dst = 0 nT** as missing; NOAA RTSW arrays are newest-first, so `.slice(-120)` plotted the *oldest* two hours.

## What changed

| Surface | Change |
|---|---|
| `public/src/css/panels.css` | Panel overflow/flex wins; `.chart-box` gives every canvas a real height; no hover-lift on resizable cards; mobile panes size to content |
| `public/index.html` | Wrap all eight canvases; solar-wind chart sits after Bt/Bz instead of under seven metrics |
| `public/src/js/charts.js` | `upsertChart` + `resizeOpenCharts`; two-lane timeline + lag-pair lines; Kp 5 threshold line; lag-scan Y suggested 0–2; `finiteOrNull` + `latestChronological` |
| `public/src/js/layout.js` | Ignore cramped stored heights; never persist height while a panel is collapsed |
| `public/src/js/main.js` | Layout/tab changes resize charts; dark mode still recolors via `redrawCachedCharts` |
| `public/src/js/correlation.js` | Auto refresh is quiet; manual Refresh still toasts |
| `public/src/js/spaceWeather.js` | Composite solar-wind history sorted oldest→newest before the newest-240 slice |
| `public/src/css/notifications.css` | Toasts dock bottom-right, above the footer |
| `public/sw.js` | Cache **`v19`** |
| `scripts/ux-interaction-test.mjs` | Playwright interaction pass with `.webm` + overflow diagnostics (`npm run test:ux`) |

## Validation this session

| Check | Result |
|---|---|
| `npm run test:ux` | 0 failures, 0 page errors (desktop hover tooltip, collapse, splitter, mobile no-overlap) |
| `npm run test:tabs` | **8/8** tabs; 0 console / page errors; upstream NOAA was `degraded`, Node stayed up |
| `npm run test:solar-metrics` | Passed, including Dst `0` kept and newest-first window not taking the oldest tail |

Artifacts: `test-results/ux-interaction/` (video + per-tab PNGs + `report.json`), refreshed `test-results/tab-smoke/`.

Hard-refresh once after pull so service-worker cache `v19` takes over. A remaining **thin** break in solar wind is a real unmatched mag/wind minute, not a clip.

## Shutdown

Local wrap-up stopped:

- Node HUD `server.js` on **:3000**
- Python research sidecar on **:5051**

VS Code language servers were left running. Start again with `npm run launch` (sidecar still optional: `python scripts/research_sidecar.py`).

## How to watch motion (not just screenshots)

```powershell
npm run test:ux
```

Drop a screen recording in chat if hover, drag, collapse, or tab-switch still feels wrong.

## Not in this pass

- Outbound alerts (Web Push / email / WhatsApp)
- New science charts (Bt/Bz series as its own canvas, NOAA Dst-vs-Kp overlay)
- Rewriting the Research Lab information density

## Ranked-feed checkpoint also landing in this wrap-up

These 2026-09-08 standalone handoffs were local-only until this commit:

- [`2026-09-08-rtsw-wind-successor.md`](./2026-09-08-rtsw-wind-successor.md)
- [`2026-09-08-geofon-ranked-seismic.md`](./2026-09-08-geofon-ranked-seismic.md)
- [`2026-09-08-gfz-kp-ranked.md`](./2026-09-08-gfz-kp-ranked.md)
- [`2026-09-08-map-volcanoes.md`](./2026-09-08-map-volcanoes.md)
- Plan: [`../planning/2026-09-08-always-on-feeds-and-outbound-alerts.md`](../planning/2026-09-08-always-on-feeds-and-outbound-alerts.md)
