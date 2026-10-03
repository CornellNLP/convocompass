import data
import time
from datetime import datetime, timezone, timedelta

def still_active(t):
    now = time.time()
    return now - t < data.SEC_PER_DAY


def format_time(t):
    if type(t) != int and type(t) != float:
        return t
    elif t == -1:
        return "Live"
    else:
        z = timezone(timedelta(hours=-4))
        return datetime.utcfromtimestamp(t).astimezone(z).strftime("%I:%M %p; %b %-d, %Y EST")


def format_duration(t):
    if type(t) != int and type(t) != float:
        return t
    t = int(t)
    s = ''
    if t >= data.SEC_PER_DAY:
        n = t // data.SEC_PER_DAY
        s += f'{n} Day{"s" if n > 1 else ""} '
        t %= data.SEC_PER_DAY

    if t >= data.SEC_PER_HOUR:
        n = t // data.SEC_PER_HOUR
        s += f'{n} Hour{"s" if n > 1 else ""} '
        t %= data.SEC_PER_HOUR

    if t >= 60:
        n = t // 60
        s += f'{n} Minute{"s" if n > 1 else ""}'

    return 'seconds' if s == '' else s


def get_from_time_idx(convo, t):
    for i, c in enumerate(convo):
        if t < c['timestamp']:
            return i-1
    return len(convo)-1

def convo_name_to_thread_num(convo_name):
    s = convo_name.split('~')
    return s[-1] if len(s) > 1 else "Conversation"


def score_to_color(score, threshold=data.REDDIT_THRESH):
    if score < threshold:
        return None

    r = 255
    g = int(150/(threshold-1)*(score-1))
    b = g
    return '#%02x%02x%02x' % (r, g, b)


def latest_activity_to_color(t, now=time.time()):
    if t < now - data.SEC_PER_2DAYS:
        return None

    r = int(200 / data.SEC_PER_2DAYS * (now-t))
    g = 255
    b = r
    return '#%02x%02x%02x' % (r, g, b)


def make_change_arrow(rank):
    parent_score = rank['score'] - rank['delta']
    y = rank['delta'] * max(rank['score'], parent_score)
    y = min(y, 1)
    y = max(y, -1)

    size = 300*abs(y) + 100
    color = 'yellow'
    arrow = '&#10137;'

    if y < 0:
        r = int(255/1.5 * (y+1))
        g = 255
        b = 0
        color = '#%02x%02x%02x' % (r, g, b)
        arrow = '&#10136;'
    elif y > 0:
        r = 255
        g = int(255/1.5*y)
        b = 0
        color = '#%02x%02x%02x' % (r, g, b)
        arrow = '&#10138;'
    return f'<span style="color:{color}; font-size:{size}%">{arrow}</span>'
