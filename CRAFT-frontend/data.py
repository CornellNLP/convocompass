import os
import uuid
##################################################################
# Set these variables to configure the behavior of the application
##################################################################

# BACKEND is the location of the server implementing CRAFT-backend reddit API.
BACKEND = 'http://zissou.infosci.cornell.edu:8080'

WIKI_BACKEND = 'http://zissou.infosci.cornell.edu:8082'

EXTENSION_BACKEND = 'https://craft.infosci.cornell.edu/extension'

WIKI_EXTENSION_BACKEND = 'http://zissou.infosci.cornell.edu:8084'

# jacqueline serves the real /llm/* handlers (gemini).
LLM_BACKEND = 'http://jacqueline.infosci.cornell.edu:8086'

FEEDBACK_f = 'data/feedback.csv'

# k is the default number of ranked conversations to display when front end is first loaded
k = 200

##############################################################
# data & data structures needed for application, Do Not Modify
##############################################################
# args = None # will become the command line arguments

SEC_PER_HOUR = 60 * 60
SEC_PER_DAY = SEC_PER_HOUR * 24
SEC_PER_2DAYS = SEC_PER_DAY * 2

REDDIT_THRESH = 0.548580
WIKI_THRESH = 0.570617

# pins[0] resets /accesspin. empty disables reset. pins[1] is the session pin.
pins = [os.environ.get("ACCESS_PIN", ""), uuid.uuid4().hex]

wiki_mockup_convos = ['convo 1', 'convo 2', 'convo 3']
wiki_mockup_listings = [-1]
