# Space-Weather ↔ Tectonic Activity: Research Findings & Proposed Investigation

**Project**: Space-Earth Monitor (`tectonic-solar`)  
**Date**: March 24, 2026  
**Status**: Exploratory research — no causal relationship between geomagnetic storms and earthquakes has been scientifically established. This document surveys the hypothesis space and proposed methodology for further investigation.

> ⚠️ **Disclaimer**: USGS and the mainstream seismological community state there is **no proven causal link** between space weather and seismicity. Everything below is pattern-based correlation research, not prediction or endorsement of a causal mechanism.

---

## 1. Core Hypothesis

The app is built around one central, contested hypothesis:

> **Geomagnetic storms increase global earthquake probability by approximately 27–28 days after the storm event.**

The lag duration corresponds almost exactly to one **synodic solar rotation period** (~27.27 days), which is the time for the same solar active region to face Earth again. This suggests a repeating solar influence, not a one-time perturbation, is potentially responsible.

The hypothesis is not a fringe claim — it appears in peer-reviewed literature (see §4) — but it remains unconfirmed and is disputed by the mainstream seismological community.

---

## 2. What the App Currently Measures

### 2.1 Space Weather Inputs

| Variable | Source | Physical Significance |
|---|---|---|
| **Bz (southward IMF)** | NOAA DSCOVR magnetometer (1-min) | Drives geomagnetic coupling — negative Bz opens magnetospheric reconnection |
| **Bt (total field)** | NOAA DSCOVR magnetometer (1-min) | Total magnetic field magnitude, proxy for CME passage |
| **Kp index** | NOAA SWPC (1-min + 3-day history) | Proxy for global geomagnetic disturbance (0–9 scale) |
| **Dst index** | NOAA/Kyoto WDC | Ring current strength — best single-number proxy for storm intensity |
| **Solar wind speed** | NOAA DSCOVR plasma (1-min) | Arrival speed of solar wind; high speed = compressed magnetosphere |
| **Solar wind density** | NOAA DSCOVR plasma (1-min) | Dynamic pressure on magnetosphere |
| **X-ray flux (GOES)** | NOAA GOES primary (7-day) | Solar flare proxy; X-class flares precede CME arrivals |
| **Proton flux (GOES)** | NOAA GOES primary (6-hour) | SEP (solar energetic particle) events; radiation storm indicator |

### 2.2 Seismic Inputs

| Variable | Source | Threshold |
|---|---|---|
| Live earthquake feed | USGS M4.5+ past day | Used for map and alerts |
| Weekly earthquake feed | USGS M2.5+ past week | Used for magnitude statistics |
| 7-day M4.5+ feed | USGS M4.5+ past week | Used for correlation analysis |
| Historical window | IndexedDB, 90-day rolling | Pearson r + Fisher p-value computation |

### 2.3 Current Correlation Engine

The app computes, in `correlation.js`:

1. **Correlation window check** — was there a Kp≥5 storm 27–28 days ago? Simple binary flag.
2. **Pearson correlation coefficient (r)** — computed on `(Kp, Magnitude)` pairs where the earthquake occurs within ±3 days of `storm_date + 27.5d`. Uses only matched pairs.
3. **Fisher p-value (two-tailed)** — via z-transform approximation, tests whether r is distinguishable from zero.
4. **Configurable lag window** — default 21–35 days, mid-point 27–28 days. Adjustable in `analyzeCorrelation()`.

**Current limitations of the engine:**
- Correlation is computed on a rolling 30-day window — too short for statistical significance (need 90–365 days minimum).
- The matched-pairs approach (±3 days) is a strong filter that may discard legitimate lag associations.
- Storm threshold is Kp≥5, but Dst-based thresholds are more physically meaningful for storm energy.
- No regional stratification — a global M5+ pool dilutes any regional signal.

---

## 3. Proposed Physical Mechanisms

Several non-exclusive mechanisms have been proposed in the literature. None are confirmed.

### 3.1 Electromagnetic Stress Loading (Electromagnetic Trigger)

**Concept**: Telluric (Earth-induced) currents driven by geomagnetic fluctuations create transient electrical fields in the crust. Conductive fault zones act as waveguides. Piezoelectric and piezomagnetic effects in stressed rock convert the electromagnetic pulse to mechanical stress.

**Evidence for**: 
- Crustal conductivity anomalies along active fault zones are well-documented (MT surveys).
- Laboratory experiments confirm piezoelectric/piezomagnetic coupling in quartz-bearing rocks.

**Evidence against**:
- The energy of telluric currents is many orders of magnitude smaller than tectonic stress accumulation rates.
- The coupling factor required to move a locked fault is implausibly high.

**Testable prediction**: Earthquakes in conductive-crust regions (e.g., sedimentary basins near subduction zones) should show stronger lag correlation than those in resistive cratons.

### 3.2 Atmospheric/Ionospheric Pressure Loading

**Concept**: Geomagnetic storms heat the ionosphere (Joule heating), causing atmospheric expansion. The resulting pressure variation propagates downward, creating loading on the solid Earth. Changes in pore pressure along fault zones can alter effective normal stress.

**Evidence for**:
- Ionospheric Joule heating is a confirmed effect of Kp storms (energy budget ~10^11 W during large storms).
- Pore pressure variations of even tens of kPa can trigger aftershock sequences (Coulomb stress studies).

**Evidence against**:
- Atmospheric pressure changes from geomagnetic storms are estimated at <1 hPa — comparable to weather patterns already present.
- The loading/unloading cycle is diffuse; fault triggering typically requires focused stress.

**Testable prediction**: Shallow earthquakes (depth <20 km) near coastlines (where pore pressure is higher) should show stronger correlation than deep-focus events.

### 3.3 Solid-Earth Tidal Resonance + Geomagnetic Coupling

**Concept**: The 27–28 day lag mirrors the Chandler wobble (~433 days) beat with the 27.27-day synodic solar rotation, producing a quasi-periodic amplification. Geomagnetic storms at a specific rotational phase may excite Schumann resonance modes that couple to the crust near fault frequencies.

**Evidence for**:
- The Chandler wobble is real, well-measured, and is known to modulate local gravity on geological timescales.
- Schumann resonance (7.83 Hz fundamental) is modified by geomagnetic activity; ionospheric perturbations change ELF propagation.

**Evidence against**:
- The energy in Schumann resonances is ~10^9 J globally — negligible against tectonic energy budgets.
- The resonance mechanism connecting ELF to fault mechanics lacks a quantitative physical model.

**Testable prediction**: Correlation should be strongest at specific solar cycle phases when solar rotation is most coherent.

### 3.4 Solar-Cycle Seismicity Modulation (Indirect)

**Concept**: The 11-year solar cycle modulates Earth's surface temperature, atmospheric mass distribution, and ocean loading, causing small but real gravitational loading changes on fault zones. This is separate from individual storm events.

**Evidence for**:
- Several papers (Kasahara 2002, Conti et al. 2021) report weak (~0.1–0.3 r) correlations between solar activity indices and global M6+ seismicity at multi-year timescales.
- Mid-ocean ridge seismicity shows coupling to tidal variations, suggesting loading sensitivity is non-negligible.

**Evidence against**:
- Sample sizes are small (only ~11 solar cycles with complete seismic catalogs).
- Confounding variables (catalog incompleteness before 1960, station network changes) are difficult to control.

**Testable prediction**: The correlation should strengthen approaching solar maximum (Cycle 25 is peaking 2025–2026) — the app is monitoring this in real time.

---

## 4. Key Literature

| Reference | Finding | Status |
|---|---|---|
| Odintsov et al. (2006) — *Solar activity and seismicity* | Statistically significant correlation between solar wind speed and M6+ seismicity globally with 27–28d lag | Published; disputed |
| Han et al. (2004) — *Geomagnetic activity and earthquakes* | Weak but positive correlation between Kp and seismicity in East Asia | Published |
| Rabeh et al. (2010) | Correlation between geomagnetic activity and seismicity in the Middle East | Published |
| Varga & Grafarend (2018) | Earth rotation and seismicity coupling via Chandler wobble | Published; focuses on longer timescales |
| Conti et al. (2021) — *Solar influence on seismicity: statistical assessment* | Meta-analysis of 12 published correlations; finds p<0.05 in several, but notes methodological inconsistencies across studies | Published; open access |
| Morozova (2005) | Geomagnetic storm precursors observed before large earthquakes | Published; precursor claims are methodologically weak |
| Hough & Jackson (2020) | No consistent precursory signal found across USGS catalog; critique of correlation methodology | Published USGS/BSSA; strong counter-evidence |
| AGU 2025 poster (cited in app) | Ongoing; specific details not available | Conference |

---

## 5. What the Current App Data Can and Cannot Show

### Can Show

- **Real-time spatial clustering**: Are current earthquakes concentrating near tectonic boundaries coincident with geomagnetic disturbance? (Qualitative)
- **Short-window Pearson r**: Whether, in the current 30-day window, storm intensity correlates with earthquake magnitude at a 27.5-day lag.
- **Binary window activation**: Whether a Kp≥5 event occurred 27–28 days ago — the simplest form of the hypothesis.
- **Trend accumulation**: Over months of use, the IndexedDB 90-day window accumulates enough data to run more meaningful Pearson r calculations.

### Cannot Show (Without Enhancement)

| Missing Capability | Why It Matters |
|---|---|
| Long-term historical data (years) | 30d window is statistically underpowered — need 1,000+ storms for robust p-values |
| Regional stratification | Global pooling dilutes signals confined to specific tectonic regimes |
| Dst vs Kp comparison | Dst is a better proxy for storm energy (ring current intensity) than Kp; both are available in the app |
| Cross-lag scan | Testing all lags from 0–60 days simultaneously to find if 27–28d is actually the peak or an artifact |
| Magnitude-frequency analysis | Gutenberg-Richter b-value stability — does storm activity subtly shift the b-value? |
| False positive rate | What fraction of 27–28d "active windows" have no elevated seismicity? |

---

## 6. Proposed Research Extensions

The following are concrete, implementable extensions to the existing codebase.

### 6.1 Cross-Lag Scan (Priority: High)

**What**: Test correlation (Pearson r or event-count ratio) at all integer lags from 0 to 60 days, not just 27–28. Plot the resulting r(lag) curve.

**Why**: If 27–28 days is genuinely special, it should be a visually clear peak in the r(lag) plot, not matched by random noise lags. This is the single most important test for the hypothesis.

**Implementation**: Extend `analyzeCorrelation()` to iterate over lags. Draw a line chart of r vs lag in the Correlation tab, replacing or augmenting the scatter plot.

**Expected outcome**: If r peaks close to 27–28d and is significantly higher than adjacent lags, it is a genuine signal. If the curve is flat or random, the hypothesis is not supported by current data.

### 6.2 Historical Data Ingestion (Priority: High)

**What**: Add a one-time batch fetch of:
- USGS ComCat API — M5+ earthquakes for past 10–30 years
- NOAA Kp archive — `ftp://ftp.ngdc.noaa.gov/STP/SOLAR_DATA/GEO_MAG_INDICES/KP_AP/`
- NOAA storm event list (Dst < −50 nT threshold from Kyoto WDC archive)

**Why**: The current 90-day IndexedDB window can produce r values but they are not statistically powered. 10 years = ~500 storms and ~5,000 M5+ earthquakes, enough for robust conclusions.

**Implementation**: Add a one-time `loadHistoricalData()` function in `db.js` that fetches and populates IndexedDB from the USGS and NOAA batch endpoints. Only runs once, gated behind a `historicalDataLoaded` flag in `localStorage`.

### 6.3 Regional Stratification (Priority: Medium)

**What**: Rather than computing one global correlation, compute separate r values for:
- Ring of Fire (circum-Pacific seismic zone)
- Mediterranean-Himalayan belt
- Mid-Atlantic Ridge
- Continental interiors (cratons)

**Why**: If a physical mechanism exists, it likely depends on local crustal properties (conductivity, depth to brittle-ductile transition). Regional analysis can either identify where the signal is strongest or confirm it is uniformly absent.

**Implementation**: Add region bounding-box lookup to `correlation.js`; tag each earthquake with a tectonic region from its lat/lon. Show r per region in a table on the Correlation tab.

### 6.4 Dst-Based Storm Definition (Priority: Medium)

**What**: Replace the Kp≥5 storm threshold with a Dst-based threshold (Dst < −50 nT for moderate storms, < −100 nT for intense). Compute correlation separately under both definitions.

**Why**: Dst measures ring current energy, which is more physically relevant to any electromagnetic coupling mechanism. Kp is a 3-hour planetary average that can include non-storm geomagnetic activity (bay events, substorms).

**Implementation**: The Dst feed is already implemented (`/api/noaa/dst`). Parse Dst values in `spaceWeather.js`, store negative-Dst events as an alternative storm class in IndexedDB alongside Kp storms.

### 6.5 CME Tracking Integration (Priority: Medium)

**What**: Integrate the NASA DONKI API to track coronal mass ejections from genesis (solar observation) to Earth arrival (DSCOVR detection), and from Earth arrival to 27–28 days later.

**Why**: CMEs are the physical driver of geomagnetic storms. If the hypothesis is real, the storm → earthquake pathway starts at the CME, not at the Kp peak. Tracking CME properties (speed, magnetic field orientation, estimated geoeffectiveness) provides better input features than Kp alone.

**API**: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/CMEAnalysis?startDate=...` — free, no key required.

**Implementation**: Add `DONKI_API` to `config.js`. Create `cme.js` module fetching and displaying current CME events, estimated Earth arrival times, and expected Kp levels.

### 6.6 Gutenberg-Richter b-Value Tracker (Priority: Low)

**What**: Compute the Gutenberg-Richter b-value (the slope of magnitude-frequency distribution $ \log_{10}(N) = a - bM $) in two regimes:
- b-value during geomagnetically quiet periods (Kp < 3)
- b-value during and after geomagnetic storms (Kp ≥ 5 and 27–28d after)

**Why**: If geomagnetic activity shifts the magnitude-frequency relationship even slightly, it implies systematic stress loading — a more powerful statistical argument than individual event correlation. A b-value decrease implies a shift toward larger-relative-to-small earthquake ratios, consistent with increased tectonic stress.

**Implementation**: Extend the magnitude distribution chart in `charts.js` to fit and display a GR regression line. Separate the bins by geomagnetic regime. Display b-values for each regime with uncertainty estimates.

### 6.7 Precursor Signal Analysis (Priority: Research-Grade)

**What**: For large (M6.5+) earthquakes in the catalog, look backwards 120 days at space weather variables (Kp, Dst, Bz, solar wind speed) and compute their lagged cross-correlations with the event time.

**Why**: Several papers claim precursory anomalies in Bz or ionospheric TEC 1–7 days before major earthquakes. This is highly controversial, but the app collects the data needed to test it.

**Implementation**: Add a "Pre-Event Analysis" panel to the Correlation tab that, when a M6.5+ earthquake is selected from the list, fetches or queries recent space weather from IndexedDB and plots a 30-day pre-event timeline.

---

## 7. Statistical Methodology Notes

### Current Approach (Pearson r on matched pairs)

The current `calculatePearsonCorrelation()` function in `correlation.js` finds (storm, earthquake) pairs where the earthquake falls within ±3 days of `storm_date + 27.5d`, then computes r on the (Kp, magnitude) values of matched pairs.

**Problems with this approach**:
1. **Selection bias**: Only matched pairs enter the calculation. Unmatched storms (no earthquake) and unmatched earthquakes (no preceding storm) are discarded, inflating r by design.
2. **±3 day window is arbitrary**: There is no physical reason to use ±3 rather than ±7 or ±1.
3. **Sample size is systematically small**: In a 30-day window at Kp≥5, there are typically 0–3 storms and ~10–20 M5+ earthquakes globally. Pearson r on 3–5 matched pairs is meaningless.

### Recommended Approach (Event Count Ratio)

A more robust test:

1. **Define storms**: Kp≥5 events, separated by >48h (so one storm event, not many 3-hour intervals).
2. **Define the "window"**: Days 25–30 after each storm (the hypothesized lag window).
3. **Define the "control"**: Days 5–10 after each storm (similar temporal proximity but outside the lag window).
4. **Measure**: Count M5+ earthquakes in the window vs control for each storm event.
5. **Test**: Wilcoxon signed-rank test on (window_count − control_count) across all storm events.

This tests precisely whether the hypothesized window has statistically more seismicity than a matched control, without selection bias.

### The Multiple Comparisons Problem

If you scan lags from 0–60 days (§6.1), you will almost certainly find a lag with p<0.05 by chance alone (Bonferroni correction: significance threshold becomes p < 0.05/60 ≈ 0.0008 for 60 lag bins). The r(lag) curve needs to show a **physically plausible**, **isolated** peak at 27–28d with p < 0.001 after correction — not a weakly elevated plateau across many lags.

---

## 8. What Would Falsify the Hypothesis

For scientific rigor, the hypothesis should be stated in falsifiable form:

**Strong form** (testable now):
> *Global M5+ earthquake rates in the 25–30 day window following Kp≥5 storms are not statistically different from global M5+ rates in matched control windows.*

This is falsified if a sufficiently powered test (n > 200 storms) finds no significant rate elevation at the expected lag.

**Weak form** (currently consistent with app data):
> *A statistically significant positive correlation exists between storm Kp and earthquake rate at a 27–28 day lag, in at least one tectonic region.*

This is falsified if the cross-lag scan (§6.1) shows the 27–28 day r is not distinguishable from the r at random lags.

---

## 9. Current Data Quality Assessment

| Data Stream | Quality | Limitation |
|---|---|---|
| NOAA Kp (real-time) | ✅ High | 3-hour averages, not continuous |
| NOAA DSCOVR Bz/Bt | ✅ High | 1-minute, but DSCOVR hardware aging (launched 2015) |
| NOAA Dst | ✅ High | Kyoto-provisional has ~24h delay; real-time WDC is preliminary |
| USGS M4.5+ past day | ✅ High | Completeness ≥M4.5 globally since ~1970s |
| USGS M2.5+ past week | ⚠️ Regional | M2.5 is complete only in well-instrumented regions (USA, Japan) |
| IndexedDB 90-day window | ⚠️ Limited | Powered by current browser session; not a research archive |
| App correlation window | ❌ Underpowered | 30 days provides ~2–5 storm events maximum |

---

## 10. Roadmap Alignment

The following items in the project [ROADMAP.md](ROADMAP.md) directly advance this research:

| Roadmap Item | Research Value | Phase |
|---|---|---|
| **Improved correlation engine** — configurable lag window, stats table | Cross-lag scan (§6.1) | Phase 3 |
| **NOAA Dst historical chart** | Dst-based storm definition (§6.4) | Phase 3 |
| **CME tracking (DONKI API)** | CME upstream analysis (§6.5) | Phase 3 |
| **Statistical correlation calculator** — chi-square, p-value | Correct methodology (§7) | Phase 6 |
| **Configurable lag window** — UI slider | Cross-lag scan visualization | Phase 6 |
| **Multi-year historical data** — NOAA Kp archive + USGS ComCat | Historical ingestion (§6.2) | Phase 6 |
| **Machine learning experiment** — logistic regression | Input feature engineering from §3 | Phase 6 |
| **Paper citation panel** | Literature review (§4) | Phase 6 |

---

## 11. Summary

The app is instrumenting the right data streams to investigate this hypothesis. The key gaps are:

1. **Time depth** — 30 days of data is not enough. Historical ingestion (§6.2) is the highest priority scientific enhancement.
2. **Methodology** — the current Pearson r on matched pairs is biased. The event-count ratio approach (§7) is statistically sound.
3. **Cross-lag validation** — testing all lags to confirm 27–28d is genuinely special, not just selected (§6.1).
4. **Natural null hypothesis** — USGS maintains that no such correlation exists. The app should be able to *reproduce the USGS null result* on a 90-day window before claiming to find any signal in a longer window.

The most likely scientific outcome, based on existing literature, is a **very weak, possibly real, regionally heterogeneous correlation** — not strong enough to predict individual earthquakes but potentially informative about seismic hazard modulation over multi-week windows. That is still scientifically interesting.

The app is well-positioned to be a live, open-source demonstration of citizen-science methodology on this hypothesis — which is its most defensible scientific role.

---

## 12. Stepwise Validation Ladder (Live + Sim)

To keep the project honest, the hypothesis should be tested in increasing levels of realism rather than by jumping straight from live noise to a grand conclusion.

### Step 1 — Deterministic simulation sanity check

Run:

```powershell
npm run test:hypothesis-sim
```

This uses the same pure lag-analysis core as the browser app and checks three cases:

1. **Null independence** — storm timing and earthquake timing are unrelated; 27–28d should not be specially favored.
2. **Positive control** — an artificial 27-day lag signal is injected; the lag scan should peak near 25–30d.
3. **Off-target control** — a signal is injected at a different lag; the engine should not hallucinate that as 27–28d support.

If this step fails, the analysis engine is not trustworthy enough for real-data interpretation.

### Step 2 — Short-window live-data null reproduction

Use the live app without historical backfill and verify that short windows often look **underpowered**, **null-like**, or occasionally **off-target** rather than automatically “supportive.” This matters because a tool that always “finds a signal” in sparse live data is not measuring the hypothesis; it is overfitting noise.

### Step 3 — Historical backfill

Load validated historical USGS ComCat data and the official NOAA/NCEI `dayind` storm archive, then rerun the lag scan. This is the minimum path to getting enough trials for a meaningful conditional-rate estimate. Relying on the tiny embedded SC25 seed alone is useful as a fallback, but it is not enough for a strong real-data read.

### Step 4 — Regional and storm-definition controls

### Step 3.5 — Bootstrap null calibration

Once the historical corpus is loaded, run the Correlation tab's **Run Bootstrap Null Test** control.

- The browser sends the current normalized storm and earthquake catalogs through the Node proxy.
- A local Python sidecar builds a shuffled-storm target-window null distribution.
- The current implementation uses **circular shifts of the storm catalog** to preserve storm spacing while breaking the claimed storm → lag relationship.

This helps answer a narrower and more defensible question:

> Is the best 25–30 day bump larger than what we usually get when the same storm catalog is shifted away from the observed timing relationship?

That is still **not** evidence of causation. It is calibration against a null, which is exactly what the live browser path needed.

Only after the basic engine behaves under steps 1–3 should the project branch into:

- regional stratification
- Kp vs Dst storm definitions
- bootstrap / permutation null distributions
- optional Python sidecar analytics

### Step 5 — Claim discipline

Even if a 27–28d peak appears, the app should distinguish between:

- **engine passed its sanity checks**
- **real-world data shows a repeatable correlation**
- **a causal mechanism exists**

Those are not the same claim.
