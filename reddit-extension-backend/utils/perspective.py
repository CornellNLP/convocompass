from googleapiclient import discovery
import gevent.exceptions
import data

# Removed the service initialization since we won't use it


def get_tox(text):
    # Return 0 for all toxicity scores since we're not using Perspective API
    return 0
