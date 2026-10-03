from gevent import monkey
monkey.patch_all()

from flask import Flask
from flask_cors import CORS
from gevent import pywsgi

from server.llm_backend import llm

app = Flask(__name__)
CORS(app)
app.register_blueprint(llm)

if __name__ == '__main__':
    # jacqueline serves /llm/* here; zissou proxies to this port
    server = pywsgi.WSGIServer(listener=('0.0.0.0', 8086), application=app)
    print('starting llm backend!')
    server.serve_forever()
