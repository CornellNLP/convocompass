from flask import Blueprint, request, Response, render_template, make_response, redirect, url_for
from flask_cors import cross_origin
import data, requests, json, time, os
from utils import helpers

extension = Blueprint('extension', __name__)


route_names = ['start', 'continue', 'submit','claim_token', 'submit_feedback']

@extension.route("/api/<route>", methods=['POST', 'OPTIONS'])
@extension.route("/extension/<route>", methods=['POST', 'OPTIONS'])
@cross_origin()
def forward_extension(route):
    """
    """
    if route not in route_names:
        return Response(json.dumps({'status': 'failure'}))
    
    try:
        craft_response = requests.post(
            data.EXTENSION_BACKEND+'/'+route,
            json=request.get_json(),
            timeout=30,
        )
    except requests.RequestException as e:
        return Response(
            json.dumps({'status': 'error', 'error': str(e)}),
            status=502,
            mimetype='application/json',
        )

    return Response(
        craft_response.content,
        status=craft_response.status_code,
        mimetype=craft_response.headers.get('content-type', 'application/json'),
    )

@extension.route("/extension/manage", methods=['GET'])
@cross_origin()
def manage():
    """
    """
    if 'pin' not in request.cookies or request.cookies['pin'] not in data.pins:
        return render_template('shared/signin.html',
                            return_url=request.path)

    resp = requests.post(data.EXTENSION_BACKEND+'/view_users')
    users = resp.json()['data'][::-1]

    return render_template('extension/manage.html',
                           users=users)

@extension.route("/extension/add_user", methods=['POST'])
@cross_origin()
def add_user():
    """
    """
    j = {'username': request.values['username']}
    resp = requests.post(data.EXTENSION_BACKEND+'/add_user', json=j)
    return make_response(redirect(url_for('extension.manage')))

@extension.route("/extension/add_user_selfserve", methods=['POST'])
@cross_origin()
def add_user_selfserve():
    """
    """
    j = request.get_json()
    resp = requests.post(data.EXTENSION_BACKEND+'/add_user', json=j)
    return Response(json.dumps(resp.json()))

@extension.context_processor
def base_data():
    return dict(format_time=helpers.format_time,
                format_duration=helpers.format_duration,
                still_active=helpers.still_active,
                now=time.time(),
                derail=" become toxic",
                convo_name_to_thread_num=helpers.convo_name_to_thread_num,
                score_to_color=helpers.score_to_color,
                latest_activity_to_color=helpers.latest_activity_to_color,
                make_change_arrow=helpers.make_change_arrow
                )

