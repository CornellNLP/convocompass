import os
import mysql.connector as conn

# connection settings shared by init_db / drop_db / peek_db / clear_finished_users.
# credentials come from the environment so nothing sensitive lives in the repo.
HOST = os.environ.get("MYSQL_HOST", "mysql_db")
DEV_HOST = os.environ.get("MYSQL_DEV_HOST", "localhost")
USER = os.environ.get("MYSQL_USER", "root")
DATABASE = os.environ.get("MYSQL_DATABASE", "user_study")


def connect(dev=False, database=None):
    """open a connection to the user study database.

    pass database=None to connect without selecting a schema (used by init_db,
    which has to create the schema before it can be selected).
    """
    kwargs = {
        "host": DEV_HOST if dev else HOST,
        "user": USER,
        "passwd": os.environ["MYSQL_PASSWORD"],
    }
    if database is not None:
        kwargs["database"] = database
    return conn.connect(**kwargs)
