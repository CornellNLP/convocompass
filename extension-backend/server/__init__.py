import os

from server.extension import extension_routes
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
app.config['DEBUG'] = os.environ.get('FLASK_DEBUG', '0') == '1'

# comma separated list of origins allowed to call the api. the gadget runs as page
# javascript on wikipedia, so these are real cross-origin requests and this list has
# to include every wiki the gadget is deployed on.
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        'CORS_ORIGINS', 'https://*.wikipedia.org,http://*.wikipedia.org'
    ).split(',')
    if o.strip()
]
CORS(app, origins=CORS_ORIGINS)

app.register_blueprint(extension_routes)
