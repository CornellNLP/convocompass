from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
app.config['DEBUG'] = True

from server.extension import extension
from server.password import password
from server.llm import llm

app.register_blueprint(extension)
app.register_blueprint(password)
app.register_blueprint(llm)
