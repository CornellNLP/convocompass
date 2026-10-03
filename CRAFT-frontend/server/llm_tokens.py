"""mysql roster for llm tester tokens. separate from user_study."""
import os
import sys
import time
import uuid

import mysql.connector as conn
import mysql.connector.errors

MYSQL_HOST = os.environ.get("MYSQL_HOST", "mysql_db")
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASS = os.environ.get("MYSQL_PASSWORD", "rootpassword")
MYSQL_DB = os.environ.get("LLM_MYSQL_DATABASE", "llm_study")
DEFAULT_CAP = int(os.environ.get("LLM_DAILY_CAP", "1000"))

_db = None


def connect():
    print("llm tokens: connecting to db")
    return conn.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        passwd=MYSQL_PASS,
        database=MYSQL_DB,
    )


def get_db():
    global _db
    if _db is None or not _db.is_connected():
        _db = connect()
    return _db


def get_cursor():
    try:
        return get_db().cursor()
    except mysql.connector.errors.Error as e:
        print(f"llm tokens: reconnecting after {e}")
        global _db
        _db = connect()
        return _db.cursor()


def add_user(username, daily_cap=None, label=None):
    """create a 33-char token for username, or return the existing one."""
    username = (username or "").strip()
    if not username:
        print("llm tokens: add_user needs a username")
        return None
    cursor = get_cursor()
    cursor.execute("SELECT token FROM tokens WHERE username=%s", (username,))
    row = cursor.fetchone()
    if row:
        cursor.close()
        return row[0]
    token = uuid.uuid4().hex + "0"
    cap = DEFAULT_CAP if daily_cap is None else int(daily_cap)
    cursor.execute(
        "INSERT INTO tokens(token, username, started, label, daily_cap, enabled) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (token, username, None, label or username, cap, 1),
    )
    get_db().commit()
    cursor.close()
    print(f"llm tokens: added {username}")
    return token


def check_user_study(token, username=None):
    """accept a claimed reddit study token from database user_study."""
    if not isinstance(token, str) or not token:
        return None
    db = conn.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        passwd=MYSQL_PASS,
        database="user_study",
    )
    cursor = db.cursor()
    cursor.execute(
        "SELECT token, username, started FROM tokens WHERE token=%s",
        (token,),
    )
    row = cursor.fetchone()
    cursor.close()
    db.close()
    if row is None:
        return None
    _token, _user, started = row
    if started is None:
        return None
    if username and _user and username != _user:
        return None
    return {"label": _user or "study", "cap": DEFAULT_CAP}


def check(token, username=None):
    """return {label, cap} if the token is enabled. stamps started on first use."""
    if not isinstance(token, str) or not token:
        return None
    cursor = get_cursor()
    # for now match token only; username is stored but not required
    cursor.execute(
        "SELECT token, username, started, label, daily_cap, enabled "
        "FROM tokens WHERE token=%s",
        (token,),
    )
    row = cursor.fetchone()
    if row is None:
        cursor.close()
        return None
    _token, _user, started, label, cap, enabled = row
    if not enabled:
        cursor.close()
        return None
    if started is None:
        cursor.execute(
            "UPDATE tokens SET started=%s WHERE token=%s",
            (int(time.time()), _token),
        )
        get_db().commit()
    cursor.close()
    return {"label": label or _user or "tester", "cap": int(cap or DEFAULT_CAP)}


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] != "add":
        print("usage: python -m server.llm_tokens add <username>")
        sys.exit(1)
    t = add_user(sys.argv[2])
    print(t if t else "failed")
