from flask import Flask, request, jsonify
from flask_cors import CORS
import config
import model_loader
import inference
import traceback

app = Flask(__name__)
CORS(app)

print("[startup] initializing roberta model service...")
try:
    model_loader.load_forecaster()
    print("[startup] model service ready")
except Exception as e:
    print(f"[error] failed to initialize model: {e}")
    traceback.print_exc()


@app.route('/health', methods=['GET'])
def health():
    """health check endpoint"""
    if model_loader.is_loaded():
        return jsonify({
            'status': 'healthy',
            'model_loaded': True,
        }), 200
    else:
        return jsonify({
            'status': 'unhealthy',
            'model_loaded': False,
            'error': 'model not loaded'
        }), 503


@app.route('/score', methods=['POST'])
def score():
    """
    score a single conversation

    request body:
    {
        "existing": [{"id": "...", "text": "..."}],
        "new": "optional new text"
    }

    response:
    {
        "scores": {
            "id1": 0.234,
            "id2": 0.567,
            "new": 0.789
        }
    }
    """
    try:
        if not model_loader.is_loaded():
            return jsonify({
                'error': 'model not loaded'
            }), 503

        data = request.get_json()

        if not data or 'existing' not in data:
            return jsonify({
                'error': 'missing required field: existing'
            }), 400

        existing = data['existing']
        new_text = data.get('new', None)

        if not isinstance(existing, list):
            return jsonify({
                'error': 'existing must be a list'
            }), 400

        for utt in existing:
            if not isinstance(utt, dict) or 'id' not in utt or 'text' not in utt:
                return jsonify({
                    'error': 'each utterance must have id and text fields'
                }), 400

        scores = inference.score_conversation(existing, new_text)

        return jsonify({
            'scores': scores
        }), 200

    except Exception as e:
        print(f"[error] exception in /score: {e}")
        traceback.print_exc()
        return jsonify({
            'error': str(e)
        }), 500


@app.route('/score_batch', methods=['POST'])
def score_batch():
    """
    score multiple conversations in batch

    request body:
    {
        "conversations": [
            {
                "existing": [...],
                "new": "..."
            },
            ...
        ]
    }

    response:
    {
        "results": [
            {"scores": {...}},
            ...
        ]
    }
    """
    try:
        if not model_loader.is_loaded():
            return jsonify({
                'error': 'model not loaded'
            }), 503

        data = request.get_json()

        if not data or 'conversations' not in data:
            return jsonify({
                'error': 'missing required field: conversations'
            }), 400

        conversations = data['conversations']

        if not isinstance(conversations, list):
            return jsonify({
                'error': 'conversations must be a list'
            }), 400

        results = inference.score_batch(conversations)

        return jsonify({
            'results': results
        }), 200

    except Exception as e:
        print(f"[error] exception in /score_batch: {e}")
        traceback.print_exc()
        return jsonify({
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print(f"[startup] starting server on {config.HOST}:{config.PORT}")
    app.run(host=config.HOST, port=config.PORT, debug=False)
