from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / 'scripts'
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from research_stats import compute_bootstrap_null, normalize_storm_catalog, scan_all_lags
import numpy as np

DAY_MS = 86_400_000.0


def test_normalize_storm_catalog_keeps_max_kp_per_three_hour_bucket():
    storms = [
        {'date': 0, 'kp': 5.0},
        {'date': 60 * 60 * 1000, 'kp': 6.0},
        {'date': 4 * 60 * 60 * 1000, 'kp': 4.0},
    ]

    normalized = normalize_storm_catalog(storms)

    assert len(normalized) == 2
    assert normalized[0]['kp'] == 6.0
    assert normalized[1]['kp'] == 4.0


def test_scan_all_lags_finds_implanted_target_window_signal():
    storms = np.array([0.0, 55 * DAY_MS, 115 * DAY_MS, 180 * DAY_MS], dtype=np.float64)
    earthquakes = np.array([27 * DAY_MS, 82 * DAY_MS, 142 * DAY_MS, 207 * DAY_MS], dtype=np.float64)

    scan = scan_all_lags(storms, earthquakes, max_lag=40)
    best_lag = int(np.argmax(scan['event_ratios']))

    assert 24 <= best_lag <= 30
    assert scan['event_ratios'][best_lag] >= 2.0


def test_compute_bootstrap_null_flags_target_peak_above_null():
    storm_days = [0, 41, 97, 154, 223, 301, 384, 470, 559, 651, 746, 844]
    storms = [{'date': day * DAY_MS, 'kp': 6.0} for day in storm_days]
    earthquakes = [
        {'date': day * DAY_MS + 25 * DAY_MS, 'mag': 5.5, 'place': f'event-pre-{index}'}
        for index, day in enumerate(storm_days)
    ]
    earthquakes.extend([
        {'date': day * DAY_MS + 26 * DAY_MS, 'mag': 5.4, 'place': f'event-a-{index}'}
        for index, day in enumerate(storm_days)
    ])
    earthquakes.extend([
        {'date': day * DAY_MS + 28 * DAY_MS, 'mag': 5.3, 'place': f'event-b-{index}'}
        for index, day in enumerate(storm_days)
    ])
    earthquakes.extend([
        {'date': day * DAY_MS + 29 * DAY_MS, 'mag': 5.2, 'place': f'event-post-{index}'}
        for index, day in enumerate(storm_days)
    ])
    earthquakes.extend([
        {'date': day * DAY_MS + 41 * DAY_MS, 'mag': 5.0, 'place': f'control-{index}'}
        for index, day in enumerate(storm_days[:6])
    ])

    result = compute_bootstrap_null(
        storms,
        earthquakes,
        permutations=120,
        max_lag=40,
        target_min_lag=25,
        target_max_lag=30,
        random_seed=7,
        batch_size=25,
    )

    summary = result['summary']

    assert summary['observedTargetPeakLag'] >= 25
    assert summary['observedTargetPeakLag'] <= 30
    assert summary['observedTargetPeakRatio'] >= summary['null95Percentile']
    assert summary['empiricalPValue'] < 0.1
