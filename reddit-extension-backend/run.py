from gevent import monkey
monkey.patch_all()

from server import app
from gevent import pywsgi

if __name__ == '__main__':    
    server = pywsgi.WSGIServer(listener=('0.0.0.0', 8083), application=app)
    print('Starting the server!')
    server.serve_forever()
