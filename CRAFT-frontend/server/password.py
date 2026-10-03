from flask import Blueprint, request, render_template, abort, make_response, redirect, url_for
import time, json, os, uuid
import data
from utils import api_interface, helpers
from pprint import pprint

password = Blueprint('password', __name__)

@password.route("/accesspin", methods=['GET','POST'])
def accesspin():
    """
    Set/reset the server password.
    """
    if 'pin' not in request.cookies or request.cookies['pin'] not in data.pins:
        return render_template('shared/signin.html',
                               return_url=request.path)
    
    elif data.pins[0] and 'master' in request.values and request.values['master'] == data.pins[0]:
        new = uuid.uuid4().hex
        data.pins[1] = uuid.uuid4().hex
        print('resetting password')
    return render_template('shared/accesspin.html', current=data.pins[1])

@password.route("/login", methods=['POST'])
def login():
    if 'pin' in request.values:
        resp = make_response(redirect(request.values['return_url']))
        resp.set_cookie('pin', request.values['pin'])
        return resp
        

@password.context_processor
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
