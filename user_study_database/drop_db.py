import mysql
import mysql.connector as conn
import db_config

# parse command line arguments
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dev', default=False, action='store_true',
    help='Configure the ip address of the backend for development.')
args = parser.parse_args()

def drop_db():
    # print('Trying to drop database user_study, are you sure you want to proceed? [y/n]')
    # if (False or input() != 'y'):
    #     print('aborting')
    #     exit()

    db = db_config.connect(dev=args.dev, database=db_config.DATABASE)

    cursor = db.cursor()

    cursor.execute('DROP DATABASE user_study')
    db.commit()
    
    cursor.close()
    db.close()
    print('dropped database user_study')

if __name__ == '__main__':
    drop_db()
