import mysql
import mysql.connector as conn
import db_config
from time import sleep

# parse command line arguments
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dev', default=False, action='store_true',
    help='Configure the ip address of the backend for development.')
args = parser.parse_args()

def init_db():
    db = db_config.connect(dev=args.dev)

    
    cursor = db.cursor()

    cursor.execute("CREATE DATABASE IF NOT EXISTS user_study")
    cursor.execute("USE user_study")

    cursor.execute(("CREATE TABLE IF NOT EXISTS actions("
                    "row_id INT AUTO_INCREMENT PRIMARY KEY,"
                    "interaction_id INT,"
                    "token CHAR(33),"
                    "is_passive BOOL,"
                    "action INT,"
                    "time INT,"
                    "craft FLOAT,"
                    "toxicity FLOAT,"
                    "context_craft FLOAT,"
                    "context_toxicity FLOAT,"
                    "url VARCHAR(512),"
                    "reply_to VARCHAR(512),"
                    "comment_id VARCHAR(512),"
                    "text VARCHAR(4096));"))

    cursor.execute(("CREATE TABLE IF NOT EXISTS tokens("
                    "row_id INT AUTO_INCREMENT PRIMARY KEY,"
                    "token CHAR(33),"
                    "username VARCHAR(100),"
                    "started INT,"
                    "message_state INT,"
                    "messages_remaining INT,"
                    "last_post_id VARCHAR(512),"
                    "posts_since_refresh INT,"
                    "mode INT,"
                    "duration INT"
                    ");"))

    db.commit()
    cursor.close()
    db.close()

if __name__ == '__main__':
    init_db()
    print('database initalized')

