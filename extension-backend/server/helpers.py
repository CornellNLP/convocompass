from flask import Response
import json
import data

def response(which,
             interaction_id,
             craft_ctx_score=None,
             craft_reply_score=None,
             craft_ctx_reply_score=None,
             toxic_ctx_score=None,
             toxic_reply_score=None,
             llm_summary=None,
             llm_links=None,
             username=None,
             message=None):
    d = {'which': which,
         'interaction_id': interaction_id}

    if username == data.ADMIN_USERNAME:
        d['show_scores'] = 1

    if which[:5] == 'craft':
        d['craft_ctx_score'] = craft_ctx_score
        d['craft_reply_score'] = craft_reply_score
        d['craft_reply_change'] = craft_reply_score - craft_ctx_score \
            if craft_reply_score is not None and craft_ctx_score is not None \
               else None

    if which[:5] == 'toxic':
        d['toxic_ctx_score'] = toxic_ctx_score
        d['toxic_reply_score'] = toxic_reply_score

    if which[:3] == 'llm':
        # newcomer-assistance condition: natural-language summary + whitelisted
        # policy links from the gemini-service. None means "no feedback this
        # round" and the gadget keeps its placeholder text.
        d['llm_summary'] = llm_summary
        d['llm_links'] = llm_links or []

    if message is not None:
        d['message'] = message

    return Response(json.dumps(d))

 
