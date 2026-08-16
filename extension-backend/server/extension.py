from flask import Blueprint, request, Response, make_response
from flask_cors import cross_origin
import time, json, data, re
from datetime import datetime
from pprint import pprint
from convokit.model import Utterance, Corpus, Speaker
from utils import model_scorer, user_study, perspective, gemini_client
import praw
from server import helpers

timestamp_P = re.compile(r"\(UTC\)")
template_P = re.compile(r"\{\{(.*)\}\}")


extension_routes = Blueprint("extension_routes", __name__)


@extension_routes.route("/claim_token", methods=["POST", "OPTIONS"])
@cross_origin()
def claim_token():
    request_data = request.get_json()
    # pprint(request_data)
    token = request_data["token"]
    username = request_data["username"]
    valid = user_study.claim_token(token, username)
    return Response(json.dumps({"valid": valid}))


@extension_routes.route("/add_user", methods=["POST"])
@cross_origin()
def add_user():
    request_data = request.get_json()
    # pprint(request_data)
    username = request_data["username"]
    duration = request_data.get("duration", "30d")
    added = user_study.add_user(username, duration)
    return Response(json.dumps({"added": added}))


@extension_routes.route("/view_users", methods=["POST"])
@cross_origin()
def view_users():
    return Response(json.dumps({"data": user_study.view_users()}))


@extension_routes.route("/start", methods=["POST", "OPTIONS"])
@cross_origin()
def start():
    """Route to handle chrome extension asking for a reddit thread to be processed by CRAFT"""
    t = int(time.time())
    request_data = request.get_json()
    # pprint(request_data)
    token = request_data["token"]
    username = request_data["username"]
    url = request_data["url"]
    try:
        post_id = url.split("comments/")[1][:6]
    except IndexError:
        return Response(
            json.dumps({"error": "Unrecognized URL format"}),
            status=403,
            mimetype="application/json",
        )
    response_type = user_study.check_token(token, username, post_id)
    if response_type is None:
        return Response(
            json.dumps({"error": "Invalid Token"}),
            status=403,
            mimetype="application/json",
        )

    if "existing" in request_data:  # reddit
        existing = request_data["existing"]
        reply_id = request_data["reply_id"]
        reply_id = (
            reply_id.split("_")[1]
            if type(reply_id) == str and "_" in reply_id
            else reply_id
        )

    else:  # wikipedia
        assert "context" in request_data
        context = template_P.sub("", request_data["context"])
        context = timestamp_P.split(context)
        existing = [{"id": None, "text": c} for c in context]
        reply_id = None

    if data.ASSISTANCE_TYPE == "gemini":
        # newcomer-assistance mode: no forecaster scoring; the gemini-service
        # supplies a discussion summary + policy links. Failures yield None and
        # the gadget keeps its placeholder text.
        feedback = gemini_client.get_feedback(
            existing, None, data.GEMINI_SERVICE_URL, data.GEMINI_REQUEST_TIMEOUT
        ) or {}
        interaction_id = user_study.log_action(
            user_study.Action.START,
            t,
            token=token,
            is_passive=False,
            url=url,
            reply_to=reply_id,
        )
        return helpers.response(
            "llm_newcomer",
            interaction_id,
            llm_summary=feedback.get("summary"),
            llm_links=feedback.get("links"),
            username=username,
            message=user_study.get_message(token),
        )

    if response_type[:5] != "toxic":
        corpus = crafted(existing, None)
        craft_ctx_score = corpus.get_utterance(existing[-1]["id"]).meta["craft_score"]
    else:
        craft_ctx_score = None

    toxic_ctx_score = (
        perspective.get_tox(existing[-1]["text"])
        if response_type[:5] == "toxic"
        else None
    )

    interaction_id = user_study.log_action(
        user_study.Action.START,
        t,
        token=token,
        is_passive=(response_type == "control"),
        url=url,
        reply_to=reply_id,
        context_toxicity=toxic_ctx_score,
        context_craft=craft_ctx_score,
    )

    message = user_study.get_message(token)

    return helpers.response(
        response_type,
        interaction_id,
        craft_ctx_score=craft_ctx_score,
        toxic_ctx_score=toxic_ctx_score,
        username=username,
        message=message,
    )


@extension_routes.route("/continue", methods=["POST", "OPTIONS"])
@cross_origin()
def continue_():
    """Route to handle chrome extension asking for a reddit thread to be processed by CRAFT"""
    t = int(time.time())
    request_data = request.get_json()
    print(request_data)
    # pprint(request_data)
    token = request_data["token"]
    username = request_data["username"]
    response_type = user_study.check_token(token, username)
    if response_type is None:
        return Response(
            json.dumps({"error": "Invalid Token"}),
            status=403,
            mimetype="application/json",
        )
    if "existing" in request_data:  # reddit
        existing = request_data["existing"]

    else:  # wikipedia
        assert "context" in request_data
        context = template_P.sub("", request_data["context"])
        context = timestamp_P.split(context)
        existing = [{"id": None, "text": c} for c in context]

    new = request_data["new"]
    interaction_id = request_data["interaction_id"]
    if interaction_id is None:
        print("found interaction_id=None; aborting logging")
        return Response(json.dumps({"status": "error"}))

    if data.ASSISTANCE_TYPE == "gemini":
        feedback = gemini_client.get_feedback(
            existing, new, data.GEMINI_SERVICE_URL, data.GEMINI_REQUEST_TIMEOUT
        ) or {}
        user_study.log_action(
            user_study.Action.CONTINUE,
            t,
            interaction_id=interaction_id,
            text=new,
        )
        return helpers.response(
            "llm_newcomer",
            interaction_id,
            llm_summary=feedback.get("summary"),
            llm_links=feedback.get("links"),
            username=username,
        )

    if response_type[:5] != "toxic":
        corpus = crafted(existing, new)
        craft_reply_score = (
            corpus.get_utterance("new").meta["craft_score"] if new else None
        )
        craft_ctx_score = corpus.get_utterance(existing[-1]["id"]).meta["craft_score"]

        # Debug logging for CRAFT scores
        print("\n=== CRAFT Score Debug Info ===")
        print(f"New utterance text: {new}")
        print(f"New utterance CRAFT score: {craft_reply_score}")
        print(f"Context CRAFT score: {craft_ctx_score}")
        if craft_reply_score is not None and craft_ctx_score is not None:
            print(f"Score delta: {craft_reply_score - craft_ctx_score}")
        print("===========================\n")
    else:
        craft_reply_score = None
        craft_ctx_score = None

    toxic_reply_score = (
        perspective.get_tox(new) if response_type[:5] == "toxic" else None
    )

    user_study.log_action(
        user_study.Action.CONTINUE,
        t,
        interaction_id=interaction_id,
        craft=craft_reply_score,
        toxicity=toxic_reply_score,
        text=new,
    )

    return helpers.response(
        response_type,
        interaction_id,
        craft_ctx_score=craft_ctx_score,
        craft_reply_score=craft_reply_score,
        toxic_reply_score=toxic_reply_score,
        username=username,
    )


@extension_routes.route("/submit", methods=["POST", "OPTIONS"])
@cross_origin()
def submit():
    t = (
        int(time.time()) - 2
    )  # -2 because of the 2 second client-side delay on this request
    request_data = request.get_json()
    # pprint(request_data)
    token = request_data["token"]
    username = request_data["username"]
    response_type = user_study.check_token(token, username)
    if response_type is None:
        return Response(
            json.dumps({"error": "Invalid Token"}),
            status=403,
            mimetype="application/json",
        )
    existing = request_data["existing"]
    new = request_data["new"]
    interaction_id = request_data["interaction_id"]

    if interaction_id is None:
        print("found interaction_id=None; aborting logging")
        return Response(json.dumps({"status": "error"}))

    submitted_id = request_data["submitted_id"]
    submitted_id = (
        submitted_id.split("_t1_")[1]
        if type(submitted_id) == str and "_t1_" in submitted_id
        else None
    )

    if data.ASSISTANCE_TYPE == "gemini":
        user_study.log_action(
            user_study.Action.SUBMIT,
            t,
            interaction_id=interaction_id,
            text=new,
            comment_id=submitted_id,
        )
        return Response(json.dumps({"status": "success"}))

    corpus = crafted(existing, new)
    toxic_reply_score = perspective.get_tox(request_data["new"])
    craft_reply_score = corpus.get_utterance("new").meta["craft_score"] if new else -1

    user_study.log_action(
        user_study.Action.SUBMIT,
        t,
        interaction_id=interaction_id,
        craft=craft_reply_score,
        toxicity=toxic_reply_score,
        text=new,
        comment_id=submitted_id,
    )

    return Response(json.dumps({"status": "success"}))


@extension_routes.route("/submit_feedback", methods=["POST", "OPTIONS"])
@cross_origin()
def submit_feedback():
    t = int(time.time())
    request_data = request.get_json()
    # pprint(request_data)
    token = request_data["token"]
    username = request_data["username"]
    text = request_data["text"]
    interaction_id = request_data["interaction_id"]

    if interaction_id is None:
        print("found interaction_id=None; aborting logging")
        return Response(json.dumps({"status": "error"}))

    user_study.log_action(
        user_study.Action.SUBMIT_FEEDBACK, t, interaction_id=interaction_id, text=text
    )

    return Response(json.dumps({"status": "success"}))


@extension_routes.route("/debug_scores", methods=["POST", "OPTIONS"])
@cross_origin()
def debug_scores():
    """Debug endpoint to view CRAFT scores for a conversation"""
    request_data = request.get_json()
    existing = request_data["existing"]

    # Process the conversation
    corpus = crafted(existing, None)

    # Collect scores
    scores = []
    for utt in existing:
        utt_id = utt["id"]
        score = corpus.get_utterance(utt_id).meta.get("craft_score", None)
        scores.append({"id": utt_id, "text": utt["text"], "craft_score": score})

    return Response(
        json.dumps({"scores": scores, "conversation_length": len(existing)})
    )


def crafted(existing, new):
    it = 0
    corpus = None

    while it < len(data.EXTENSION_CACHED_CORPORA):
        last_comment_id, cached_corpus = data.EXTENSION_CACHED_CORPORA[it]
        if last_comment_id == existing[-1]["id"]:
            corpus = cached_corpus
            break
        it += 1

    if it < len(data.EXTENSION_CACHED_CORPORA):
        # was cached, so move this to top of cache
        if len(data.EXTENSION_CACHED_CORPORA) < data.EXTENSION_CACHE_SIZE:
            data.EXTENSION_CACHED_CORPORA.append((last_comment_id, corpus))
        else:
            to_reinsert = data.EXTENSION_CACHED_CORPORA.pop(it)
            data.EXTENSION_CACHED_CORPORA.insert(0, to_reinsert)
    else:
        # was not cached, so generate corpus from scratch
        print(f"Generating new corpus from scratch")
        utterances = [
            Utterance(
                id=existing[0]["id"],
                conversation_id=existing[0]["id"],
                speaker=Speaker(),
                text=existing[0]["text"],
            )
        ]
        for i in range(1, len(existing)):
            utterances.append(
                Utterance(
                    conversation_id=existing[0]["id"],
                    reply_to=utterances[-1].id,
                    id=existing[i]["id"],
                    speaker=Speaker(),
                    text=existing[i]["text"],
                )
            )

        corpus = Corpus(utterances=utterances)

        if len(data.EXTENSION_CACHED_CORPORA) < data.EXTENSION_CACHE_SIZE:
            data.EXTENSION_CACHED_CORPORA.append((existing[-1]["id"], corpus))
        else:
            data.EXTENSION_CACHED_CORPORA.pop()
            data.EXTENSION_CACHED_CORPORA.insert(0, (existing[-1]["id"], corpus))

    if new:
        if "new" in corpus.utterances:
            # Update the existing utterance's text
            utterance = corpus.get_utterance("new")
            utterance.text = new
            # Clear only the "new" utterance's CRAFT score for recalculation
            try:
                if 'craft_score' in utterance.meta:
                    utterance.meta['craft_score'] = 0
            except:
                print(f"Could not clear CRAFT score for 'new' utterance")
            print(f"Updated existing 'new' utterance with text: {new[:30]}...")
        else:
            print(f"Adding new utterance with ID 'new' to corpus")
            corpus = corpus.add_utterances(
                [
                    Utterance(
                        conversation_id=existing[0]["id"],
                        reply_to=existing[-1]["id"],
                        id="new",
                        speaker=Speaker(),
                        text=new,
                    )
                ]
            )

    # score using selected model backend (craft or roberta)
    corpus = model_scorer.score_corpus(existing, new, corpus)

    return corpus
