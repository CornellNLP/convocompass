import mysql
import mysql.connector as conn
import db_config

# parse command line arguments
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dev', default=False, action='store_true',
    help='Configure the ip address of the backend for development.')
args = parser.parse_args()

# hardcoded, update before each run
FINISHED_USERS = {"puja_puja", "adtag4"}

def clear_finished_users(finished_users):
    # print('Trying to drop database user_study, are you sure you want to proceed? [y/n]')
    # if (False or input() != 'y'):
    #     print('aborting')
    #     exit()

    db = db_config.connect(dev=args.dev, database=db_config.DATABASE)

    cursor = db.cursor()
    for user in finished_users:
        cursor.execute("DELETE FROM tokens WHERE username = \"%s\"" % user)
    db.commit()
    cursor.close()
    db.close()

    print("Cleared the following users from database:", finished_users)

if __name__ == "__main__":
    clear_finished_users(FINISHED_USERS)
