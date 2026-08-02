import mysql
import mysql.connector as conn
import db_config
from tabulate import tabulate
from time import sleep

# parse command line arguments
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dev', default=False, action='store_true',
    help='Configure the ip address of the backend for development.')
args = parser.parse_args()


def peek_db():
    db = db_config.connect(dev=args.dev, database=db_config.DATABASE)
    
    cursor = db.cursor()

    cursor.execute('SHOW TABLES')
    tables = cursor.fetchall()
    tables = [t[0] for t in tables]

    for t in tables:
        peek_table(cursor, t)
        print()
    
    cursor.close()
    db.close()

def peek_table(cursor, table_name):
    cursor.execute(f'SELECT * FROM {table_name};')
    actions = cursor.fetchall()
    actions = [['...'+col[-20:] if type(col)==str and len(col) > 30 else col for col in action] for action in actions]

    cursor.execute(f'DESCRIBE {table_name};')
    columns = cursor.fetchall()
    columns = [c[0] for c in columns]

    print(table_name)
    print(tabulate(actions, headers=columns))


if __name__ == '__main__':
    peek_db()
    print('done peeking db')
