'use strict';

const fs = require('fs');
const path = require('path');

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_MODEL = 'grok-4.5';
const PROTON_ENERGY_CHANNEL = '>=10 MeV';
const PROTON_S1_FLUX = 10;
const XRAY_FLARE_CHANNEL = '0.1-0.8';
const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY = 20;
const STREAM_TIMEOUT_MS = 90_000;

function loadLocalEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asArray(data) {
  return Array.isArray(data) ? data : [];
}

function xrayClassFromFlux(flux) {
  if (!Number.isFinite(flux) || flux <= 0) return null;
  if (flux >= 1e-4) return `X${(flux / 1e-4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux / 1e-5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux / 1e-7).toFixed(1)}`;
  return `A${(flux / 1e-8).toFixed(1)}`;
}

function kpStatus(kp) {
  if (!Number.isFinite(kp)) return 'unknown';
  if (kp < 4) return 'quiet';
  if (kp < 5) return 'active / unsettled';
  if (kp < 6) return 'G1 minor storm';
  if (kp < 7) return 'G2 moderate storm';
  if (kp < 8) return 'G3 strong storm';
  if (kp < 9) return 'G4 severe storm';
  return 'G5 extreme storm';
}

function dstLevel(nT) {
  if (!Number.isFinite(nT)) return 'unknown';
  if (nT <= -100) return 'intense';
  if (nT <= -50) return 'moderate';
  if (nT <= -20) return 'unsettled';
  return 'quiet';
}

function latestByTime(rows, getTime) {
  let best = null;
  let bestTime = -Infinity;
  for (const row of rows) {
    const time = getTime(row);
    if (!Number.isFinite(time) || time < bestTime) continue;
    best = row;
    bestTime = time;
  }
  return best;
}

function parseDstRows(data) {
  const records = [];
  for (const row of asArray(data)) {
    if (Array.isArray(row)) {
      if (String(row[0]).toLowerCase() === 'time_tag') continue;
      const time = Date.parse(row[0]);
      const dst = parseNumber(row[1]);
      if (Number.isFinite(time) && dst != null) {
        records.push({ time, dst, timeTag: String(row[0]) });
      }
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const timeTag = row.time_tag || row.time;
    const time = Date.parse(timeTag);
    const dst = parseNumber(row.dst);
    if (Number.isFinite(time) && dst != null) {
      records.push({ time, dst, timeTag: String(timeTag) });
    }
  }
  records.sort((a, b) => a.time - b.time);
  return records;
}

async function fetchJsonFeed(url, fetchWithTimeout) {
  try {
    const result = await fetchWithTimeout(url);
    if (!result.ok) {
      return { ok: false, status: result.status, data: null };
    }
    return { ok: true, status: result.status, data: parseJsonSafe(result.body) };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error?.message || 'fetch failed' };
  }
}

function buildLiveContext({ mag, plasma, kp, xrays, dst, protons, seismic }) {
  const magRows = asArray(mag.data);
  const plasmaRows = asArray(plasma.data);
  const latestMag = latestByTime(magRows, row => Date.parse(row?.time_tag));
  const latestPlasma = latestByTime(plasmaRows, row => Date.parse(row?.time_tag));
  const bt = parseNumber(latestMag?.bt);
  const bz = parseNumber(latestMag?.bz_gsm);
  const speed = parseNumber(latestPlasma?.speed);
  const density = parseNumber(latestPlasma?.density);

  const solarWind = {};
  if (bt != null) solarWind.bt_nT = bt;
  if (bz != null) solarWind.bz_nT = bz;
  if (latestMag?.time_tag) solarWind.mag_time = latestMag.time_tag;
  if (speed != null) solarWind.speed_kms = speed;
  if (density != null) solarWind.density_pcc = density;
  if (latestPlasma?.time_tag) solarWind.plasma_time = latestPlasma.time_tag;
  if (!latestPlasma) {
    solarWind.plasma_note = 'plasma feed unavailable (IMAP transition)';
  }

  const kpRows = asArray(kp.data);
  const latestKp = latestByTime(kpRows, row => Date.parse(row?.time_tag));
  const kpValue = parseNumber(latestKp?.kp_index ?? latestKp?.kp);

  const xrayRows = asArray(xrays.data).filter(row => {
    if (!row || typeof row !== 'object') return false;
    if (!row.energy) return true;
    return String(row.energy).includes(XRAY_FLARE_CHANNEL);
  });
  const latestXray = latestByTime(xrayRows, row => Date.parse(row?.time_tag));
  const currentFlux = parseNumber(latestXray?.flux);
  let peakClass = null;
  let peakFlux = -Infinity;
  for (const row of xrayRows) {
    const flux = parseNumber(row.flux);
    if (flux != null && flux > peakFlux) {
      peakFlux = flux;
      peakClass = xrayClassFromFlux(flux);
    }
  }

  const dstRecords = parseDstRows(dst.data);
  const latestDst = dstRecords[dstRecords.length - 1] || null;

  const protonRows = asArray(protons.data).filter(row => !row?.energy || row.energy === PROTON_ENERGY_CHANNEL);
  const latestProton = latestByTime(protonRows, row => Date.parse(row?.time_tag));
  const protonFlux = parseNumber(latestProton?.flux);

  const features = asArray(seismic?.features);
  let largest = null;
  for (const feature of features) {
    const magValue = parseNumber(feature?.properties?.mag);
    if (magValue == null) continue;
    if (!largest || magValue > largest.mag) {
      largest = { mag: magValue, place: String(feature.properties.place || 'Unknown location') };
    }
  }

  const recentEvents = features.slice(0, 8).map(feature => ({
    mag: parseNumber(feature?.properties?.mag),
    place: String(feature?.properties?.place || 'Unknown location'),
    depth_km: parseNumber(feature?.geometry?.coordinates?.[2]),
  }));

  return {
    generated_at: new Date().toISOString(),
    geomagnetic: kpValue == null ? null : {
      kp_index: kpValue,
      status: kpStatus(kpValue),
      time: latestKp?.time_tag || null,
    },
    solar_wind: Object.keys(solarWind).length ? solarWind : null,
    solar_flares: {
      current_flux_wm2: currentFlux,
      current_class: xrayClassFromFlux(currentFlux),
      peak_class_7d: peakClass,
    },
    proton_flux: {
      pfu_ge10MeV: protonFlux,
      radiation_storm: protonFlux != null ? protonFlux >= PROTON_S1_FLUX : false,
    },
    dst_index: latestDst ? {
      nT: latestDst.dst,
      time: new Date(latestDst.time).toISOString(),
      level: dstLevel(latestDst.dst),
    } : null,
    seismic: {
      window: 'past 24h, M4.5+',
      count: features.length,
      source: seismic?.metadata?.sourceLabel || 'seismic merge unavailable',
      largest,
      recent_events: recentEvents,
    },
  };
}

function systemPrompt(mode) {
  const shared = [
    'You are the TECTONIC-SOLAR situation briefing assistant.',
    'You explain live NOAA space-weather and USGS/EMSC seismic monitoring data in plain language.',
    'Ground every factual claim in the provided LIVE SNAPSHOT JSON. If a field is missing, say so; do not invent numbers.',
    'USGS and most seismologists find no proven causal link between space weather and earthquakes. Never predict an earthquake. Never imply a forecast, warning, or all-clear for people.',
    'The 27–28 day storm-lag idea is an unproven research hypothesis under test in this app. Describe it only as a hypothesis, and do not treat the live snapshot as confirmation or falsification of that hypothesis.',
    'Prefer conservative wording: quiet vs unsettled vs storming, observed counts, largest event, data gaps (especially NOAA plasma during the IMAP transition).',
    'Use markdown with short headings and bullets. Do not wrap the whole answer in a code fence.',
  ];

  if (mode === 'digest') {
    shared.push(
      'Write a compact daily digest: a few bullets for space weather, a few for notable M4.5+ quakes, and one closing reminder that this is monitoring not prediction. Keep it to one screen.',
    );
  } else {
    shared.push(
      'For a full briefing, use sections such as Space Weather, Geomagnetic Activity, Seismic Snapshot, and What this does not mean. For a user question, answer the question first, then add only the context that helps.',
    );
  }

  return shared.join(' ');
}

function userPrompt(mode, question, context) {
  const snapshot = JSON.stringify(context, null, 2);
  if (mode === 'digest') {
    return `LIVE SNAPSHOT (JSON):\n${snapshot}\n\nWrite today's one-screen daily digest of notable storms and quakes from this snapshot.`;
  }
  if (question) {
    return `LIVE SNAPSHOT (JSON):\n${snapshot}\n\nQuestion: ${question}`;
  }
  return `LIVE SNAPSHOT (JSON):\n${snapshot}\n\nWrite a full live situation briefing for TECTONIC-SOLAR from this snapshot.`;
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_HISTORY).map((item) => {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(item?.content || '').slice(0, MAX_QUESTION_CHARS).trim();
    return { role, content };
  }).filter(item => item.content);
}

function sanitizeQuestion(raw) {
  return String(raw || '').slice(0, MAX_QUESTION_CHARS).trim();
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function streamGrok({ apiKey, model, messages, onDelta, signal }) {
  const response = await fetch(XAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    const err = new Error(detail || `SpaceXAI request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      const parsed = parseJsonSafe(data);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
    }
  }
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function magLabel(value) {
  return Number.isFinite(value) ? `M${Number(value).toFixed(1)}` : 'M—';
}

function depthLabel(value) {
  if (!Number.isFinite(value) || value < 0) return 'depth unreported';
  return `${Math.round(value)} km`;
}

function utcStamp(iso) {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'time unknown';
  return `${new Date(parsed).toISOString().replace('.000Z', 'Z')}`;
}

function notableQuakes(seismic, minMag = 5) {
  return asArray(seismic?.recent_events).filter(event => Number.isFinite(event?.mag) && event.mag >= minMag);
}

function kpMeaning(kp) {
  if (!Number.isFinite(kp)) return 'The Kp feed missed this cycle, so geomagnetic storm state is unknown here.';
  if (kp < 4) return 'Quiet. Storming on this scale starts at Kp 5 (G1).';
  if (kp < 5) return 'Unsettled / active, still below minor-storm threshold (Kp 5).';
  if (kp < 6) return 'G1 minor storm. High-latitude auroras are possible. This is geomagnetic activity, not an earthquake warning.';
  if (kp < 7) return 'G2 moderate storm. This is space-weather activity only.';
  if (kp < 8) return 'G3 strong storm. Still not an earthquake forecast.';
  return 'G4+ severe/extreme storm on the NOAA Kp scale. Still not an earthquake forecast.';
}

function bzMeaning(bz) {
  if (!Number.isFinite(bz)) return 'Bz is missing from the magnetometer sample.';
  if (bz <= -5) return 'southward and more geoeffective (energy couples more easily into the magnetosphere)';
  if (bz < 0) return 'mildly southward';
  return 'northward / less geoeffective';
}

function dstMeaning(level, nT) {
  if (!Number.isFinite(nT)) return 'Dst is missing.';
  if (level === 'intense') return `Intense storm territory (Dst ${Math.round(nT)} nT; intense is ≤ −100 nT).`;
  if (level === 'moderate') return `Moderate storm territory (Dst ${Math.round(nT)} nT; moderate is ≤ −50 nT).`;
  if (level === 'unsettled') return `A bit disturbed (Dst ${Math.round(nT)} nT), not a moderate storm (that starts at −50 nT).`;
  return `Quiet ring current (Dst ${Math.round(nT)} nT).`;
}

function spaceWeatherSection(context) {
  const geo = context.geomagnetic || {};
  const wind = context.solar_wind || {};
  const flares = context.solar_flares || {};
  const protons = context.proton_flux || {};
  const dst = context.dst_index || {};
  const lines = [
    '## Space weather',
    `- **Kp ${fmt(geo.kp_index)} — ${geo.status || 'unknown'}.** ${kpMeaning(geo.kp_index)}`,
  ];

  if (wind.bt_nT != null || wind.bz_nT != null) {
    lines.push(
      `- **IMF Bt ${fmt(wind.bt_nT)} nT, Bz ${fmt(wind.bz_nT)} nT** (${bzMeaning(wind.bz_nT)}).`
      + (wind.mag_time ? ` Magnetometer sample ${utcStamp(wind.mag_time)}.` : ''),
    );
  } else {
    lines.push('- **Solar-wind magnetometer:** not in this snapshot.');
  }

  if (wind.speed_kms != null) {
    lines.push(`- **Solar-wind speed** ${Math.round(wind.speed_kms)} km/s`
      + (wind.density_pcc != null ? `, density ${fmt(wind.density_pcc, 1)} p/cm³.` : '.'));
  } else if (wind.plasma_note) {
    lines.push(`- **Plasma (speed/density/pressure):** ${wind.plasma_note}. Bt/Bz above still come from the magnetometer.`);
  }

  lines.push(`- **Dst:** ${dstMeaning(dst.level, dst.nT)}`);

  const flareNow = flares.current_class || 'unreported';
  const flarePeak = flares.peak_class_7d || 'unreported';
  lines.push(`- **GOES X-ray now ${flareNow}** (7-day peak ${flarePeak}). C starts at 10⁻⁶ W/m², M at 10⁻⁵, X at 10⁻⁴.`);

  if (protons.radiation_storm) {
    lines.push(`- **Proton flux ≥10 MeV:** ${fmt(protons.pfu_ge10MeV, 2)} pfu — NOAA S1 radiation-storm threshold (10 pfu) is crossed.`);
  } else if (protons.pfu_ge10MeV != null) {
    lines.push(`- **Proton flux ≥10 MeV:** ${fmt(protons.pfu_ge10MeV, 2)} pfu — below S1 (10 pfu).`);
  } else {
    lines.push('- **Proton flux:** not in this snapshot.');
  }

  return lines.join('\n');
}

function seismicSection(context) {
  const seis = context.seismic || {};
  const lines = [
    '## Seismic snapshot',
    `- **${seis.count ?? 0} events M4.5+** in the past 24 h (${seis.source || 'source unknown'}).`,
  ];
  if (seis.largest) {
    lines.push(`- **Largest:** ${magLabel(seis.largest.mag)} at ${seis.largest.place}.`);
  }
  const notable = notableQuakes(seis, 5);
  if (notable.length) {
    lines.push('- **M5.0+ in this snapshot:**');
    notable.forEach((event) => {
      lines.push(`  - ${magLabel(event.mag)} — ${event.place} (${depthLabel(event.depth_km)})`);
    });
  } else {
    lines.push('- No M5.0+ events are in the short recent list.');
  }
  return lines.join('\n');
}

function closingSection() {
  return [
    '## What this does not mean',
    '- USGS and most seismologists find **no proven causal link** between space weather and earthquakes.',
    '- The 27–28 day lag idea is an **unproven hypothesis under test** in Research Lab. This snapshot cannot confirm or falsify it.',
    '- This is a monitor readout, not a forecast, warning, or all-clear.',
  ].join('\n');
}

function classifyQuestion(question) {
  const text = String(question || '').toLowerCase();
  if (/27|28|lag|hypothes|correlat/.test(text)) return 'hypothesis';
  if (/worr|scared|danger|safe|predict|should i/.test(text)) return 'worry';
  if (/quake|seismic|earthquake|magnitud/.test(text)) return 'seismic';
  if (/space weather|solar|kp\b|dst\b|flare|wind|bz\b|geomag/.test(text)) return 'space';
  return 'general';
}

function composeLocalBriefing(context, { mode = 'briefing', question = '' } = {}) {
  const when = utcStamp(context.generated_at);
  const engineNote = '*Written on this machine from the live NOAA / USGS snapshot. Optional Grok is not required.*';

  if (mode === 'digest') {
    const geo = context.geomagnetic || {};
    const seis = context.seismic || {};
    const flares = context.solar_flares || {};
    const dst = context.dst_index || {};
    const notable = notableQuakes(seis, 5);
    const quakeLines = notable.length
      ? notable.slice(0, 5).map(event => `- ${magLabel(event.mag)} — ${event.place}`)
      : ['- No M5.0+ events in the recent list.'];
    return [
      `## Daily digest · ${when}`,
      engineNote,
      '',
      '**Space weather**',
      `- Kp ${fmt(geo.kp_index)} (${geo.status || 'unknown'}) — ${kpMeaning(geo.kp_index)}`,
      `- Dst ${dst.nT != null ? `${Math.round(dst.nT)} nT (${dst.level})` : 'missing'}`,
      `- X-ray now ${flares.current_class || 'unreported'}; 7-day peak ${flares.peak_class_7d || 'unreported'}`,
      '',
      `**Seismic (24 h, M4.5+): ${seis.count ?? 0} events**`,
      ...quakeLines,
      '',
      'Monitoring only — not an earthquake prediction.',
    ].join('\n');
  }

  if (question) {
    const intent = classifyQuestion(question);
    const header = [
      `## Answer · ${when}`,
      engineNote,
      '',
      `**You asked:** ${question}`,
      '',
    ];

    if (intent === 'hypothesis') {
      return [
        ...header,
        'The **27–28 day lag** is a published but **unproven** idea: some papers report extra M5+ seismicity about one synodic solar rotation after a geomagnetic storm. USGS and most seismologists do **not** accept a causal space-weather → earthquake link.',
        '',
        'This live snapshot (Kp, Dst, today\'s quakes) **cannot** support or falsify that hypothesis. That test lives in **Research Lab**: load the archives, run the lag scan, then the bootstrap null. Until those say otherwise, treat any percentage card as descriptive only.',
        '',
        closingSection(),
      ].join('\n');
    }

    if (intent === 'worry') {
      const geo = context.geomagnetic || {};
      const storming = Number.isFinite(geo.kp_index) && geo.kp_index >= 5;
      return [
        ...header,
        storming
          ? `Kp is ${fmt(geo.kp_index)} (${geo.status}), which is storm-level on the NOAA G-scale. That is a **space-weather** condition. It is not an earthquake warning.`
          : `Kp is ${fmt(geo.kp_index)} (${geo.status || 'unknown'}). That is **below** minor-storm threshold (Kp 5). Nothing in this snapshot is an earthquake warning.`,
        '',
        `${context.seismic?.count ?? 0} M4.5+ quakes in 24 h is ordinary global catalog traffic. Largest here: ${
          context.seismic?.largest
            ? `${magLabel(context.seismic.largest.mag)} at ${context.seismic.largest.place}`
            : 'not listed'
        }.`,
        '',
        closingSection(),
      ].join('\n');
    }

    if (intent === 'seismic') {
      return [...header, seismicSection(context), '', closingSection()].join('\n');
    }

    if (intent === 'space') {
      return [...header, spaceWeatherSection(context), '', closingSection()].join('\n');
    }

    return [
      ...header,
      'I can only restate the **live monitors** (NOAA space weather + USGS/EMSC M4.5+). I cannot predict, and I cannot use a language model unless a server-side Grok key is set.',
      '',
      spaceWeatherSection(context),
      '',
      seismicSection(context),
      '',
      closingSection(),
    ].join('\n');
  }

  return [
    `## TECTONIC-SOLAR · Live situation briefing`,
    `**Timestamp:** ${when}`,
    engineNote,
    '',
    spaceWeatherSection(context),
    '',
    seismicSection(context),
    '',
    closingSection(),
  ].join('\n');
}

function streamLocalBriefing(res, context, { mode, question }) {
  const text = composeLocalBriefing(context, { mode, question });
  const chunks = text.split(/(?<=\n\n)/);
  for (const chunk of chunks) {
    if (chunk) writeSse(res, { delta: chunk });
  }
}

function createAiBriefingHandler({ fetchWithTimeout, loadGlobalSeismic, upstream }) {
  return async function handleAiBriefing(req, res) {
    const mode = req.body?.mode === 'digest' ? 'digest' : 'briefing';
    const question = sanitizeQuestion(req.body?.question);
    const history = sanitizeHistory(req.body?.history);
    const apiKey = process.env.XAI_API_KEY;
    const model = process.env.XAI_MODEL || DEFAULT_MODEL;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, must-revalidate, no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.setTimeout(STREAM_TIMEOUT_MS);

    const controller = new AbortController();
    const onClose = () => controller.abort();
    req.on('close', onClose);

    try {
      const [mag, plasma, kp, xrays, dst, protons, seismic] = await Promise.all([
        fetchJsonFeed(upstream.noaa.rtswMag, fetchWithTimeout),
        fetchJsonFeed(upstream.noaa.rtswPlasma, fetchWithTimeout),
        fetchJsonFeed(upstream.noaa.kp1m, fetchWithTimeout),
        fetchJsonFeed(upstream.noaa.xray7d, fetchWithTimeout),
        fetchJsonFeed(upstream.noaa.dst, fetchWithTimeout),
        fetchJsonFeed(upstream.noaa.proton6h, fetchWithTimeout),
        loadGlobalSeismic().catch(() => ({ features: [], metadata: { sourceLabel: 'seismic merge unavailable' } })),
      ]);

      const context = buildLiveContext({ mag, plasma, kp, xrays, dst, protons, seismic });
      context.briefing_engine = apiKey ? 'grok' : 'local';
      writeSse(res, { context });

      if (!apiKey) {
        streamLocalBriefing(res, context, { mode, question });
        res.end();
        return;
      }

      const messages = [
        { role: 'system', content: systemPrompt(mode) },
        ...history,
        { role: 'user', content: userPrompt(mode, question, context) },
      ];

      try {
        await streamGrok({
          apiKey,
          model,
          messages,
          signal: controller.signal,
          onDelta: (delta) => writeSse(res, { delta }),
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        writeSse(res, {
          delta: '\n\n*Grok was unavailable; falling back to the local snapshot briefing.*\n\n',
        });
        context.briefing_engine = 'local';
        streamLocalBriefing(res, context, { mode, question });
      }
      res.end();
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (!res.writableEnded) res.end();
        return;
      }
      const message = error?.message || 'Briefing request failed';
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: message });
        return;
      }
      writeSse(res, { error: message });
      if (!res.writableEnded) res.end();
    } finally {
      req.off('close', onClose);
    }
  };
}

module.exports = {
  loadLocalEnv,
  createAiBriefingHandler,
  composeLocalBriefing,
};
