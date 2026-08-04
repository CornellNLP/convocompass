import data, convokit, json, mysql, os, random, uuid, random, time
from datetime import datetime
import mysql.connector as conn
from enum import IntEnum
import mysql.connector.errors


class Action(IntEnum):
   START = 0
   CONTINUE = 1
   SUBMIT = 2
   CANCEL = 3
   SUBMIT_FEEDBACK = 4

# Implements a failsafe method of getting the database cursor in case the database is unresponsive, to avoid 
# crashing the entire backend when the database is temporarially unavaliable. 
def get_cursor():
    tries = 10
    cursor = None
    while tries > 0:
        try:
            cursor = data.user_study_db.cursor()
            break
        except mysql.connector.errors.OperationalError as E:
            print(f'got error {E} connecting to db, trying to reconnect...')
            data.user_study_db = data.connect_to_db()
            tries -= 1
    if cursor == None:
        print('Failed to get cursor from DB, aborting without logging')
        raise mysql.connector.errors.OperationalError
    return cursor


def log_action(action: Action,
               t:int,
               craft:float = None,
               context_craft:float = None,
               toxicity:float = None,
               context_toxicity:float = None,
               interaction_id: int = None,
               url:str = None,
               token:int = None,
               reply_to:str = None,
               comment_id:str = None,
               text:str = None,
               is_passive:bool = None):
    cursor = get_cursor()
    if action == Action.START:
        cursor.execute(('SELECT row_id '
                        'FROM actions '
                        'ORDER BY row_id DESC '
                        'LIMIT 1;'))
        result = cursor.fetchone()
        result = 0 if result is None else result[0]
        interaction_id = result + 1
        
    assert interaction_id is not None

    s = ('INSERT INTO actions(interaction_id, token, is_passive, action, time,'
         'craft, toxicity, context_craft, context_toxicity,'
         'url, reply_to, comment_id, text)' 
         'VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);')
    v = (interaction_id, token, is_passive, int(action), t,
         craft,toxicity,context_craft,context_toxicity,
         url, reply_to, comment_id, text)
    
    cursor.execute(s,v)
    
    data.user_study_db.commit()
    cursor.close()
    return interaction_id

lastchar_to_responsetype = {
   '0': 'craft_normal',
   '1': 'craft_normal',
   #'2': 'craft_ctx_reply',
   '3': 'craft_control',
   '4': 'craft_control',
   '-1': 'control'
}
groups = list(lastchar_to_responsetype.keys())
groups.remove('-1')

def get_stage(started, duration):
    t = time.time()
    duration *= data.SEC_PER_DAY # convert participation duration from days to seconds
    if started + data.d1 > t:
       return 0
    elif started + data.d1 + duration > t:
       return 1
    else:
       return 3

def check_token(token,username,post_id=None):
    cursor = get_cursor()
    cursor.execute(("SELECT started,last_post_id,posts_since_refresh,mode,duration FROM tokens WHERE token=%s AND username=%s"),(token,username))
    result = cursor.fetchone()
    if result == None or result[0] == None:
        cursor.close()
        return None
    
    started, last_post_id, posts_since_refresh, mode, duration = result
    stage = get_stage(started, duration)
    if stage == 1:
        response = lastchar_to_responsetype['0']
    else:
        response = lastchar_to_responsetype['-1']

    # if the post ID has changed, we are onto a new post and need to update the count, and possibly rerandomize
    # otherwise, we simply maintain the current mode
    if post_id is not None and last_post_id != post_id:
        last_post_id = post_id
        posts_since_refresh += 1
        if posts_since_refresh >= data.POSTS_UNTIL_RANDOMIZATION:
            # randomly decide whether we should switch the mode or not (biased in favor of switching)
            switch_mode = random.random() < 0.5 + data.BIAS
            mode = abs(mode - int(switch_mode))
            # reset counter of how many posts it's been since last rerandomization
            posts_since_refresh = 0
        cursor.execute(("UPDATE tokens SET last_post_id=%s,posts_since_refresh=%s,mode=%s WHERE token=%s"),
                       (last_post_id, posts_since_refresh, mode, token))
        data.user_study_db.commit()

    # passive mode (coded as 0) forces the "control" response type
    if mode == 0:
        response = lastchar_to_responsetype['-1']
    cursor.close()
    return 'craft_normal' # TODO FORCES CRAFT RESPONSE
    return response

def claim_token(token,username):
    cursor = get_cursor()
    
    cursor.execute(("SELECT started FROM tokens WHERE token=%s AND username=%s"),(token,username,))
    result = cursor.fetchone()
    if result == None:
       cursor.close()
       return False
    else:
       if result[0] == None:
              cursor.execute(("UPDATE tokens SET started=%s WHERE token=%s AND username=%s;"),
                             (int(time.time()), token, username))
              data.user_study_db.commit()
       cursor.close()
       return True
        
    # cursor.execute(("SELECT started FROM tokens WHERE token=%s"),(token,))
    # result = cursor.fetchone()
    # if result == None:
    #    cursor.close()
    #    return False
    # else:
    #    if result[0] == None:
    #           cursor.execute(("UPDATE tokens SET started=%s WHERE token=%s;"),
    #                          (int(time.time()), token, username))
    #           data.user_study_db.commit()
    #    cursor.close()
    #    return True

    
def add_user(username, duration):
    cursor = get_cursor()
    
    cursor.execute(("SELECT token FROM tokens WHERE username=%s"),(username,))
    result = cursor.fetchone()
    # print(result)
    if result != None: # Username already registered
       cursor.close()
       return result

    token = uuid.uuid4().hex
    group = random.choice(groups)
    token += group
        
    cursor.execute(("INSERT INTO tokens(username,token, message_state, messages_remaining, last_post_id, posts_since_refresh, mode, duration) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)"),
                   (username,token,0,0,"DUMMY",-1,1,int(duration[:-1])))
    data.user_study_db.commit()
    cursor.close()
    return token

def get_message(token):
    message = None
    
    cursor = get_cursor()
    cursor.execute(("SELECT started,duration FROM tokens WHERE token=%s"),(token,))
    result = cursor.fetchone()
    if result == None: # False token
       cursor.close()
       return None

    started, duration = result
    print(started, duration)
    stage = get_stage(started, duration)

    if stage in data.messages:
       message = data.messages[stage]
    
    cursor.close()
    return message

def view_users():
    # print('view_users')
    cursor = get_cursor()
    cursor.execute(("SELECT username,token,started FROM tokens"))
    result = cursor.fetchall()
    cursor.close()
    # result = [(u,str(t)[-1]) for (u,t) in result] # map token -> group
    return result
