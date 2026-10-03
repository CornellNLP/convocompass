"""proxy /llm/<route> to the same path on jacqueline.

this process does not call gemini. jacqueline's llm_backend blueprint does.
"""
import json

import requests
from flask import Blueprint, Response, request
from flask_cors import cross_origin

import data

llm = Blueprint('llm', __name__)

route_names = ['claim_token', 'start', 'continue', 'submit', 'submit_feedback']


@llm.route("/llm/<route>", methods=['POST', 'OPTIONS'])
@cross_origin()
def forward_llm(route):
    if route not in route_names:
        return Response(json.dumps({'status': 'failure'}))

    try:
        resp = requests.post(
            data.LLM_BACKEND + '/llm/' + route,
            json=request.get_json(silent=True) or {},
            timeout=60,
        )
    except requests.RequestException as e:
        return Response(
            json.dumps({'status': 'error', 'error': str(e)}),
            status=502,
            mimetype='application/json',
        )

    return Response(
        resp.content,
        status=resp.status_code,
        mimetype=resp.headers.get('content-type', 'application/json'),
    )
