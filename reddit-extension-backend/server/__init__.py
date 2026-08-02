import os

from server.extension import extension_routes
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
app.config['DEBUG'] = os.environ.get('FLASK_DEBUG', '0') == '1'

# comma separated list of origins allowed to call the api. defaults to reddit,
# which is where the extension's content script runs.
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        'CORS_ORIGINS', 'https://www.reddit.com,https://old.reddit.com'
    ).split(',')
    if o.strip()
]
CORS(app, origins=CORS_ORIGINS)

app.register_blueprint(extension_routes)
