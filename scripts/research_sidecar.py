from __future__ import annotations

from flask import Flask, jsonify, request
import numpy as np

from research_stats import compute_bootstrap_null

HOST = '127.0.0.1'
PORT = 5051
MAX_BODY_BYTES = 512 * 1024

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_BODY_BYTES


@app.get('/health')
def health() -> tuple:
    return jsonify({
        'ok': True,
        'service': 'python-research-sidecar',
        'host': HOST,
        'port': PORT,
        'numpy': np.__version__,
        'maxBodyBytes': MAX_BODY_BYTES,
        'capabilities': ['bootstrap-null'],
    }), 200


@app.post('/bootstrap-null')
def bootstrap_null() -> tuple:
    payload = request.get_json(silent=True) or {}

    try:
        result = compute_bootstrap_null(
            payload.get('storms'),
            payload.get('earthquakes'),
            permutations=int(payload.get('permutations', 1000)),
            max_lag=int(payload.get('maxLag', 60)),
            target_min_lag=int(payload.get('targetMinLag', 25)),
            target_max_lag=int(payload.get('targetMaxLag', 30)),
            random_seed=int(payload.get('randomSeed', 42)),
            batch_size=int(payload.get('batchSize', 50)),
        )
    except ValueError as exc:
        return jsonify({
            'ok': False,
            'error': str(exc),
        }), 400
    except Exception as exc:  # pragma: no cover - defensive server boundary
        app.logger.exception('bootstrap-null failed')
        return jsonify({
            'ok': False,
            'error': 'bootstrap-null failed',
            'message': str(exc),
        }), 500

    return jsonify({
        'ok': True,
        **result,
    }), 200


if __name__ == '__main__':
    print(f'[tectonic-solar] Python research sidecar listening on http://{HOST}:{PORT}')
    app.run(host=HOST, port=PORT)
