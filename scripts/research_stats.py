from __future__ import annotations

from datetime import datetime
from math import isfinite
from typing import Any

import numpy as np

DAY_MS = 86_400_000.0
THREE_HOUR_MS = 3 * 60 * 60 * 1000.0
WINDOW_HALF_SPAN_MS = 3 * DAY_MS
BASIC_FLOORS = {
    'storms': 5,
    'earthquakes': 40,
    'span_days': 60,
    'closed_windows': 3,
}
POWER_FLOORS = {
    'storms': 12,
    'earthquakes': 120,
    'span_days': 180,
    'closed_windows': 8,
}


def _coerce_epoch_ms(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if isfinite(parsed) else None

    if isinstance(value, str):
        try:
            normalized = value.replace('Z', '+00:00')
            return datetime.fromisoformat(normalized).timestamp() * 1000.0
        except ValueError:
            return None

    return None


def _coerce_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if isfinite(parsed) else None


def normalize_storm_catalog(storms: list[dict[str, Any]] | None = None) -> list[dict[str, float]]:
    buckets: dict[int, dict[str, float]] = {}

    for storm in storms or []:
        time_ms = _coerce_epoch_ms(storm.get('date'))
        kp = _coerce_float(storm.get('kp'))
        if time_ms is None or kp is None:
            continue

        bucket_start = int(time_ms // THREE_HOUR_MS) * int(THREE_HOUR_MS)
        existing = buckets.get(bucket_start)
        if existing is None or kp > existing['kp']:
            buckets[bucket_start] = {
                'date': float(bucket_start),
                'kp': kp,
            }

    return [buckets[key] for key in sorted(buckets)]


def normalize_earthquake_catalog(earthquakes: list[dict[str, Any]] | None = None) -> list[dict[str, float | str]]:
    unique: dict[str, dict[str, float | str]] = {}

    for earthquake in earthquakes or []:
        time_ms = _coerce_epoch_ms(earthquake.get('date'))
        mag = _coerce_float(earthquake.get('mag'))
        if time_ms is None or mag is None:
            continue

        lat = _coerce_float(earthquake.get('lat'))
        lon = _coerce_float(earthquake.get('lon'))
        place = str(earthquake.get('place') or '')
        key = '|'.join([
            str(int(time_ms)),
            f"{lat:.3f}" if lat is not None else '?',
            f"{lon:.3f}" if lon is not None else '?',
            f"{mag:.1f}",
            place,
        ])

        if key not in unique:
            unique[key] = {
                'date': time_ms,
                'mag': mag,
                'lat': lat if lat is not None else np.nan,
                'lon': lon if lon is not None else np.nan,
                'place': place,
            }

    return [unique[key] for key in sorted(unique, key=lambda item: unique[item]['date'])]


def _count_windows(center_matrix: np.ndarray, earthquake_times: np.ndarray) -> np.ndarray:
    lower_bounds = (center_matrix - WINDOW_HALF_SPAN_MS).reshape(-1)
    upper_bounds = (center_matrix + WINDOW_HALF_SPAN_MS).reshape(-1)
    lower = np.searchsorted(earthquake_times, lower_bounds, side='left')
    upper = np.searchsorted(earthquake_times, upper_bounds, side='right')
    counts = upper - lower
    return counts.reshape(center_matrix.shape).sum(axis=1)


def scan_all_lags(storm_times_ms: np.ndarray, earthquake_times_ms: np.ndarray, max_lag: int = 60) -> dict[str, np.ndarray]:
    lags = np.arange(max_lag + 1, dtype=np.int32)

    if storm_times_ms.size == 0 or earthquake_times_ms.size == 0:
        zero_counts = np.zeros(max_lag + 1, dtype=np.int64)
        return {
            'lags': lags,
            'window_counts': zero_counts,
            'control_counts': zero_counts.copy(),
            'event_ratios': np.ones(max_lag + 1, dtype=np.float64),
        }

    storm_times_ms = np.sort(storm_times_ms.astype(np.float64, copy=False))
    earthquake_times_ms = np.sort(earthquake_times_ms.astype(np.float64, copy=False))

    lag_offsets = lags.astype(np.float64)[:, None] * DAY_MS
    window_centers = storm_times_ms[None, :] + lag_offsets
    control_centers = storm_times_ms[None, :] + (lags.astype(np.float64)[:, None] + 14.0) * DAY_MS

    window_counts = _count_windows(window_centers, earthquake_times_ms)
    control_counts = _count_windows(control_centers, earthquake_times_ms)

    event_ratios = np.ones(max_lag + 1, dtype=np.float64)
    np.divide(
        window_counts,
        control_counts,
        out=event_ratios,
        where=control_counts > 0,
    )
    event_ratios = np.where(
        control_counts > 0,
        event_ratios,
        np.where(window_counts > 0, 2.0, 1.0),
    ).astype(np.float64)

    return {
        'lags': lags,
        'window_counts': window_counts.astype(np.int64),
        'control_counts': control_counts.astype(np.int64),
        'event_ratios': event_ratios,
    }


def _count_closed_windows(storm_times_ms: np.ndarray, reference_end_ms: float) -> int:
    return int(np.count_nonzero((storm_times_ms + 30.0 * DAY_MS) <= reference_end_ms))


def compute_bootstrap_null(
    storms: list[dict[str, Any]] | None,
    earthquakes: list[dict[str, Any]] | None,
    *,
    permutations: int = 1000,
    max_lag: int = 60,
    target_min_lag: int = 25,
    target_max_lag: int = 30,
    random_seed: int = 42,
    batch_size: int = 50,
) -> dict[str, Any]:
    if permutations < 100:
        raise ValueError('permutations must be at least 100')
    if max_lag < 1 or max_lag > 120:
        raise ValueError('max_lag must be between 1 and 120')
    if target_min_lag < 0 or target_max_lag > max_lag or target_min_lag > target_max_lag:
        raise ValueError('target lag window must fall within 0..max_lag')

    normalized_storms = normalize_storm_catalog(storms)
    normalized_earthquakes = normalize_earthquake_catalog(earthquakes)

    if not normalized_storms:
        raise ValueError('at least one valid storm observation is required')
    if not normalized_earthquakes:
        raise ValueError('at least one valid earthquake observation is required')

    storm_times = np.array([storm['date'] for storm in normalized_storms], dtype=np.float64)
    earthquake_times = np.array([earthquake['date'] for earthquake in normalized_earthquakes], dtype=np.float64)

    observed_scan = scan_all_lags(storm_times, earthquake_times, max_lag=max_lag)
    observed_ratios = observed_scan['event_ratios']
    target_slice = slice(target_min_lag, target_max_lag + 1)
    observed_target_ratios = observed_ratios[target_slice]

    observed_target_offset = int(np.argmax(observed_target_ratios))
    observed_target_peak_ratio = float(observed_target_ratios[observed_target_offset])
    observed_target_peak_lag = target_min_lag + observed_target_offset
    observed_global_peak_lag = int(np.argmax(observed_ratios))
    observed_global_peak_ratio = float(observed_ratios[observed_global_peak_lag])

    ranked_lags = np.argsort(-observed_ratios)
    observed_target_rank = int(np.where(ranked_lags == observed_target_peak_lag)[0][0]) + 1

    span_start = float(min(storm_times.min(), earthquake_times.min()))
    span_end = float(max(storm_times.max(), earthquake_times.max()))
    span_ms = max(span_end - span_start, THREE_HOUR_MS)
    data_span_days = int(round(span_ms / DAY_MS))
    closed_windows = _count_closed_windows(storm_times, span_end)

    rng = np.random.default_rng(random_seed)
    null_target_peaks = np.empty(permutations, dtype=np.float64)

    for batch_start in range(0, permutations, batch_size):
        batch_end = min(batch_start + batch_size, permutations)
        shifts = rng.uniform(0.0, span_ms, size=batch_end - batch_start)

        for offset, shift in enumerate(shifts):
            permuted_storm_times = span_start + np.mod(storm_times - span_start + shift, span_ms)
            permuted_scan = scan_all_lags(permuted_storm_times, earthquake_times, max_lag=max_lag)
            null_target_peaks[batch_start + offset] = float(np.max(permuted_scan['event_ratios'][target_slice]))

    exceedances = int(np.count_nonzero(null_target_peaks >= observed_target_peak_ratio))
    empirical_p_value = float((exceedances + 1) / (permutations + 1))
    null_mean = float(np.mean(null_target_peaks))
    null_std = float(np.std(null_target_peaks, ddof=0))
    null_p95 = float(np.percentile(null_target_peaks, 95))
    null_p99 = float(np.percentile(null_target_peaks, 99))

    basic_data = (
        storm_times.size >= BASIC_FLOORS['storms']
        and earthquake_times.size >= BASIC_FLOORS['earthquakes']
        and data_span_days >= BASIC_FLOORS['span_days']
        and closed_windows >= BASIC_FLOORS['closed_windows']
    )
    powered_data = (
        storm_times.size >= POWER_FLOORS['storms']
        and earthquake_times.size >= POWER_FLOORS['earthquakes']
        and data_span_days >= POWER_FLOORS['span_days']
        and closed_windows >= POWER_FLOORS['closed_windows']
    )

    if not basic_data:
        support_level = 'underpowered'
        tone = 'muted'
        verdict = 'Underpowered for null calibration'
        why_text = 'The bootstrap path runs, but the corpus is still too thin for a strong empirical p-value read.'
    elif observed_target_peak_ratio <= null_p95:
        support_level = 'null-consistent'
        tone = 'good'
        verdict = 'Target-window peak sits within the shuffled-storm null range'
        why_text = 'The observed 25–30 day bump does not beat the 95th percentile of the null target-window distribution.'
    elif empirical_p_value <= 0.05:
        support_level = 'candidate-signal' if powered_data else 'exploratory-elevation'
        tone = 'alert' if powered_data else 'warn'
        verdict = 'Target-window peak exceeds the shuffled-storm null range'
        why_text = 'The observed 25–30 day bump is larger than most shuffled-storm target-window peaks.'
    else:
        support_level = 'marginal-elevation'
        tone = 'warn'
        verdict = 'Target-window peak is elevated, but not decisively beyond the null range'
        why_text = 'The observed target-window bump is above the null mean but not strong enough for a clean empirical-p read.'

    return {
        'summary': {
            'stormCount': int(storm_times.size),
            'earthquakeCount': int(earthquake_times.size),
            'dataSpanDays': data_span_days,
            'closedWindows': closed_windows,
            'permutations': int(permutations),
            'randomSeed': int(random_seed),
            'targetWindow': f'{target_min_lag}–{target_max_lag}d',
            'observedTargetPeakLag': int(observed_target_peak_lag),
            'observedTargetPeakRatio': observed_target_peak_ratio,
            'observedTargetRank': int(observed_target_rank),
            'observedGlobalPeakLag': int(observed_global_peak_lag),
            'observedGlobalPeakRatio': observed_global_peak_ratio,
            'nullMean': null_mean,
            'nullStd': null_std,
            'null95Percentile': null_p95,
            'null99Percentile': null_p99,
            'empiricalPValue': empirical_p_value,
            'exceedanceCount': exceedances,
            'supportLevel': support_level,
            'tone': tone,
            'verdict': verdict,
            'whyText': why_text,
            'calibratedSignalThreshold95': null_p95,
            'poweredData': powered_data,
            'basicData': basic_data,
        },
        'scan': {
            'lags': observed_scan['lags'].astype(int).tolist(),
            'eventRatios': observed_ratios.astype(float).tolist(),
        },
    }
