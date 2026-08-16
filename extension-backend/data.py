import os
from convokit.model import Corpus, Utterance, Speaker
from convokit import download
import praw
import mysql.connector as conn
from time import sleep

##################################################################
# Set these variables to configure the behavior of the application
##################################################################

# model backend selection: "craft" (default) or "roberta"
MODEL_TYPE = os.environ.get("MODEL_TYPE", "craft").lower()

# roberta model service url (used when MODEL_TYPE="roberta")
ROBERTA_SERVICE_URL = os.environ.get("ROBERTA_SERVICE_URL", "http://localhost:8085")

# request timeout in seconds for external model calls
MODEL_REQUEST_TIMEOUT = float(os.environ.get("MODEL_REQUEST_TIMEOUT", "10"))

# assistance backend selection: "none" (default; forecaster-only behavior) or
# "gemini" (skip forecaster scoring, serve newcomer-oriented LLM feedback from
# the gemini-service). independent axis from MODEL_TYPE.
ASSISTANCE_TYPE = os.environ.get("ASSISTANCE_TYPE", "none").lower()

# gemini feedback service url (used when ASSISTANCE_TYPE="gemini")
GEMINI_SERVICE_URL = os.environ.get("GEMINI_SERVICE_URL", "http://localhost:8085")

# request timeout in seconds for gemini-service calls; failures fall back to
# placeholder text in the gadget, so a tight deadline beats a long wait
GEMINI_REQUEST_TIMEOUT = float(os.environ.get("GEMINI_REQUEST_TIMEOUT", "10"))

##############################################################
# constants & data structures needed for application, Do Not Modify
##############################################################
EXTENSION_CACHED_CORPORA = []
EXTENSION_CACHE_SIZE = 30

CRAFT_UPPER_LIMIT = 30

SEC_PER_HOUR = 60 * 60
SEC_PER_DAY = SEC_PER_HOUR * 24

THRESHOLD = 0.548580

POSTS_UNTIL_RANDOMIZATION = 1
BIAS = 0.25

# praw client. nothing in the request path uses this today — it is kept for
# scripts and future use — so it is only constructed when credentials are set.
if os.environ.get("REDDIT_CLIENT_ID") and os.environ.get("REDDIT_CLIENT_SECRET"):
    reddit = praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_CLIENT_SECRET"],
        user_agent=os.environ.get("REDDIT_USER_AGENT", "convocompass"),
    )
else:
    reddit = None

# perspective api key: read from the environment, falling back to a mounted
# secret file for deployments that prefer docker/k8s secrets over env vars
PERSPECTIVE_API_KEY = os.environ.get("PERSPECTIVE_API_KEY")
if not PERSPECTIVE_API_KEY:
    _key_file = os.environ.get("PERSPECTIVE_API_KEY_FILE", "data/perspective-key.txt")
    with open(_key_file) as f:
        PERSPECTIVE_API_KEY = f.read().strip()

# username permitted to call the /add_user and /view_users admin routes
ADMIN_USERNAME = os.environ["ADMIN_USERNAME"]

d1 = 0 * SEC_PER_HOUR
d2 = 15 * SEC_PER_DAY
d3 = 15 * SEC_PER_DAY

# url participants are sent to once their study window closes
EXIT_SURVEY_URL = os.environ.get("EXIT_SURVEY_URL", "")

messages = {
    0: "ConvoCompass is currently calibrating. During the calibration period, ConvoCompass will not provide any feedback; please continue to use Reddit as you would normally.",
    3: f"This study is now over, please <a href={EXIT_SURVEY_URL}>click here</a> to take the exit survey and provide your invaluable feedback. Thank you so much for participating!",
}

# parse command line arguments
import argparse

parser = argparse.ArgumentParser()
parser.add_argument(
    "--dev",
    default=False,
    action="store_true",
    help="Configure the ip address of the backend for development.",
)
args = parser.parse_args()


MYSQL_HOST = os.environ.get("MYSQL_HOST", "mysql_db")
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "user_study")

# seconds to wait before the first connection attempt, so the mysql container
# has time to finish initializing the schema
DB_STARTUP_DELAY = int(os.environ.get("DB_STARTUP_DELAY", "60"))


def connect_to_db(first_time=False):
    if args is not None and args.dev:
        return conn.connect(
            host="localhost",
            user=MYSQL_USER,
            passwd=os.environ["MYSQL_PASSWORD"],
            database=MYSQL_DATABASE,
        )
    else:
        if first_time and DB_STARTUP_DELAY:
            print(
                f"Deploying server in production; waiting {DB_STARTUP_DELAY}s to connect to DB after initilization"
            )
            sleep(DB_STARTUP_DELAY)
        print("Connecting to DB")
        return conn.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            passwd=os.environ["MYSQL_PASSWORD"],
            database=MYSQL_DATABASE,
        )


user_study_db = connect_to_db(first_time=True)

args = None  # will become the command line arguments
