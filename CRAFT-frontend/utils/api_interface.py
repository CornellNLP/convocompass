import requests
import data
import time
from datetime import datetime
from pprint import pprint
from utils import helpers, mockup_data

def reddit_viewtop(k, t, thresh, sortby):
    r = {'internal_error': True}  # default
    args = {'k': k, 'thresh': thresh, 'sortby': sortby}
    if t is not None:
        args['t'] = t
    try:
        r = requests.post(data.BACKEND+'/viewtop', data=args, timeout=5)
    except Exception as e:
        print(
            f'\nfailed to request {data.BACKEND}/viewtop\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
        return
    return r if type(r) == dict else r.json()


def reddit_viewtimes():
    r = {'internal_error': True}  # default
    try:
        r = requests.post(data.BACKEND+'/viewtimes', timeout=5)
    except Exception as e:
        print(
            f'\nfailed to request {data.BACKEND}/viewtimes\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
    return r if type(r) == dict else r.json()


def reddit_viewconvo(i):
    r = {'internal_error': True}  # default
    args = {'id': i}
    try:
        r = requests.post(data.BACKEND+'/viewconvo', data=args, timeout=5)
    except Exception as e:
        print(
            f'\nfailed to request {data.BACKEND}/viewconvo\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
    return r if type(r) == dict else r.json()


def reddit_comment_feedback(would_remove, cid, ip, time):
    args = {'would_remove': bool(int(would_remove)),
            'cid': cid,
            'ip': ip,
            'time': time
            }
    r = requests.post(data.BACKEND+'/comment_feedback', data=args, timeout=5)

def wiki_viewtop(num_results: int, thresh: float, sortby: str):
    r = {'internal_error': True}  # default
    args = {'num_results': num_results, 'thresh': thresh, 'sortby': sortby}
    try:
        r = requests.post(data.WIKI_BACKEND+'/viewtop', data=args, timeout=5)
    except Exception as e:
        print(f'\nfailed to request {data.WIKI_BACKEND}/viewtop\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
    return r if type(r) == dict else r.json()


def wiki_get_convo(topic, utt_id):
    if utt_id in data.wiki_mockup_convos:
        return mockup_data.wiki_get_convo(topic, utt_id)
    r = {'internal_error': True}  # default
    args = {'topic': topic, 'utt_id': utt_id}
    try:
        r = requests.post(data.WIKI_BACKEND+'/viewconvo', data=args, timeout=5)
    except Exception as e:
        print(
            f'\nfailed to request {data.WIKI_BACKEND}/viewconvo\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
    return r if type(r) == dict else r.json()


def wiki_remove_topic(topic):
    r = {'internal_error': True}  # default
    args = {'topic': topic}
    try:
        r = requests.post(data.WIKI_BACKEND+'/removetopic',
                          data=args, timeout=5)
    except Exception as e:
        print(
            f'\nfailed to request {data.WIKI_BACKEND}/removetopic\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
    return r if type(r) == dict else r.json()


def wiki_add_topic(topic):
    r = {'internal_error': True}  # default
    args = {'topic': topic}
    try:
        r = requests.post(data.WIKI_BACKEND+'/addtopic',
                          data=args, timeout=5)
    except Exception as e:
        print(
            f'\nfailed to request {data.WIKI_BACKEND}/addtopic\tat time {helpers.format_time(time.time())}\n\tgot exception {e}')
    return r if type(r) == dict else r.json()
