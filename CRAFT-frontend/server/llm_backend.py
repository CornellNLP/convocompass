"""llm endpoints that run on jacqueline and call gemini.

zissou's llm blueprint posts to the same /llm/<route> paths here.
secrets stay on jacqueline:
    GEMINI_API_KEY
    LLM_DEMO_TOKEN / LLM_DEMO_TOKENS
"""
import json
import os
import re
import time

from flask import Blueprint, Response, request
from flask_cors import cross_origin
from google import genai
from google.genai import types

from server import assistant_yaml, llm_tokens, prompts_llm as prompts

llm = Blueprint('llm', __name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_MAX_OUTPUT_TOKENS = int(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", "1024"))
GEMINI_THINKING_BUDGET = int(os.environ.get("GEMINI_THINKING_BUDGET", "0"))
# shared secrets so this endpoint isn't a public gemini proxy. the userscript
# sends one as the ordinary study token; must be 33 chars to pass the script's
# client-side format check (e.g. `openssl rand -hex 16` + one extra char).
#
# LLM_DEMO_TOKENS provisions per-tester tokens with per-token daily caps:
#   "token[:label[:cap]],token[:label[:cap]],..."
# e.g. "abc...33:elmo:150,def...33:bert" (cap defaults to LLM_DAILY_CAP).
# LLM_DEMO_TOKEN (single value) still works and is labeled "default".
#
# in addition you can just ignore adding in the name or the llm daily cap and this should still work,
# just with a default that says like token-n
LLM_DEMO_TOKEN = os.environ.get("LLM_DEMO_TOKEN", "")
LLM_DEMO_TOKENS = os.environ.get("LLM_DEMO_TOKENS", "")
LLM_DAILY_CAP = int(os.environ.get("LLM_DAILY_CAP", "1000"))
LLM_GLOBAL_DAILY_CAP = int(os.environ.get("LLM_GLOBAL_DAILY_CAP", "5000"))
LLM_MIN_INTERVAL_S = float(os.environ.get("LLM_MIN_INTERVAL_S", "3"))


def _parse_tokens():
    tokens = {}
    if LLM_DEMO_TOKEN.strip():
        tokens[LLM_DEMO_TOKEN.strip()] = {"label": "default", "cap": LLM_DAILY_CAP}
    for entry in LLM_DEMO_TOKENS.split(","):
        parts = [p.strip() for p in entry.strip().split(":")]
        if not parts or not parts[0]:
            continue
        label = parts[1] if len(parts) > 1 and parts[1] else f"token-{len(tokens)}"
        try:
            cap = int(parts[2]) if len(parts) > 2 else LLM_DAILY_CAP
        except ValueError:
            cap = LLM_DAILY_CAP
        tokens[parts[0]] = {"label": label, "cap": cap}
    return tokens


TOKENS = _parse_tokens()

# in-memory per-token usage. single gevent worker (-w 1) makes this coherent;
# counters reset on pod restart, which fails open and is acceptable here.
_usage = {}


def _check_and_count(token, entry):
    """count one generation round; return none if allowed, else a limit name."""
    now = time.time()
    today = time.strftime("%Y-%m-%d", time.gmtime(now))
    u = _usage.setdefault(token, {"date": today, "calls": 0, "last_ts": 0.0})
    if u["date"] != today:
        u["date"], u["calls"] = today, 0
    if now - u["last_ts"] < LLM_MIN_INTERVAL_S:
        return "interval"
    if u["calls"] >= entry["cap"]:
        print(f"llm limit: {entry['label']} hit daily cap {entry['cap']}")
        return "daily_cap"
    global_calls = sum(v["calls"] for v in _usage.values() if v["date"] == today)
    if global_calls >= LLM_GLOBAL_DAILY_CAP:
        print(f"llm limit: global daily cap {LLM_GLOBAL_DAILY_CAP} reached")
        return "global_cap"
    u["last_ts"] = now
    u["calls"] += 1
    print(f"llm call {entry['label']}: {u['calls']}/{entry['cap']} today")
    return None


MAX_SUMMARY_CHARS, MAX_REASON_CHARS, MAX_LINKS = 600, 300, 3
MAX_UTTERANCES, MAX_UTT_CHARS = 12, 1500
MAX_RESPONSE_CHARS = 2000

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _parse_json(text):
    if not text:
        return None
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _sanitize(raw):
    """whitelist-and-cap everything model-authored. urls only ever come from
    prompts_llm.POLICY_LINKS, never from the model."""
    if not isinstance(raw, dict):
        return None, []
    summary = raw.get("summary")
    summary = summary.strip()[:MAX_SUMMARY_CHARS] if isinstance(summary, str) and summary.strip() else None
    links, seen = [], set()
    for item in raw.get("links") or []:
        if not isinstance(item, dict):
            continue
        shortcut = str(item.get("shortcut", "")).strip().upper()
        reason = item.get("reason")
        if shortcut in seen or shortcut not in prompts.POLICY_LINKS:
            continue
        if not isinstance(reason, str) or not reason.strip():
            continue
        title, url = prompts.POLICY_LINKS[shortcut]
        links.append({"shortcut": shortcut, "title": title, "url": url,
                      "reason": reason.strip()[:MAX_REASON_CHARS]})
        seen.add(shortcut)
        if len(links) >= MAX_LINKS:
            break
    return summary, links


def _clip_utterances(existing):
    utterances = []
    for u in existing or []:
        if not isinstance(u, dict):
            print("llm: skipping non-dict utterance")
            continue
        utterances.append({**u, "text": (u.get("text") or "")[:MAX_UTT_CHARS]})
    if len(utterances) > MAX_UTTERANCES:
        utterances = [utterances[0]] + utterances[-(MAX_UTTERANCES - 1):]
    return utterances


def _generate(existing, draft):
    utterances = _clip_utterances(existing)
    response = _get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompts.build_user_prompt(utterances, draft),
        config=types.GenerateContentConfig(
            system_instruction=prompts.SYSTEM_PROMPT,
            response_mime_type="application/json",
            max_output_tokens=GEMINI_MAX_OUTPUT_TOKENS,
            thinking_config=types.ThinkingConfig(thinking_budget=GEMINI_THINKING_BUDGET),
        ),
    )
    return _sanitize(_parse_json(response.text))


QUIET_MESSAGE = "Nothing further to add at this point in the conversation."


def _should_respond(gate_prompt):
    """cheap gemini call for should_respond_prompt. stay quiet on errors."""
    try:
        response = _get_client().models.generate_content(
            model=GEMINI_MODEL,
            contents=(
                f"{gate_prompt}\n\n"
                'respond with only a json object, no markdown, '
                'in this shape: {"should_respond": true or false}'
            ),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {"should_respond": {"type": "BOOLEAN"}},
                    "required": ["should_respond"],
                },
                temperature=0.0,
                max_output_tokens=256,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        parsed = _parse_json(response.text)
        print(f"_should_respond raw: {response.text!r}")
        if isinstance(parsed, dict) and "should_respond" in parsed:
            return str(parsed["should_respond"]).lower() in ("true", "1", "yes")
        print("_should_respond: no verdict in reply, staying quiet")
    except Exception as e:
        print(f"_should_respond failed, staying quiet: {e}")
    return False


def _generate_from_yaml(compiled):
    """optionally gate, then run the compiled assistant prompt.
    returns (text, persona, should_respond). retries are for json parse misses."""
    should_respond_prompt = compiled.get("should_respond_prompt")
    if should_respond_prompt and not _should_respond(should_respond_prompt):
        print("llm gate: declined round")
        return QUIET_MESSAGE, compiled["persona_name"], False

    field = compiled["message_field"]
    for _ in range(compiled["num_retries"]):
        response = _get_client().models.generate_content(
            model=GEMINI_MODEL,
            contents=compiled["prompt"],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=compiled["temperature"],
                max_output_tokens=GEMINI_MAX_OUTPUT_TOKENS,
                thinking_config=types.ThinkingConfig(thinking_budget=GEMINI_THINKING_BUDGET),
            ),
        )
        parsed = _parse_json(response.text)
        if not isinstance(parsed, dict):
            continue
        text = parsed.get(field)
        if isinstance(text, str) and text.strip():
            return text.strip()[:MAX_RESPONSE_CHARS], compiled["persona_name"], True
    print("llm yaml: no parseable response after retries")
    return None, compiled["persona_name"], True


def _authorized(j):
    """return {label, cap} or none. db first, then env roster."""
    token = j.get('token')
    if not isinstance(token, str):
        return None
    username = j.get('username') if isinstance(j.get('username'), str) else None
    try:
        row = llm_tokens.check(token, username)
        if row:
            return row
    except Exception as e:
        print(f"llm tokens: db check failed: {e}")
    try:
        row = llm_tokens.check_user_study(token, username)
        if row:
            return row
    except Exception as e:
        print(f"llm tokens: user_study check failed: {e}")
    if TOKENS:
        return TOKENS.get(token)
    return None


@llm.route("/llm/claim_token", methods=['POST', 'OPTIONS'])
@cross_origin()
def llm_claim_token():
    j = request.get_json(silent=True) or {}
    return Response(json.dumps({'valid': _authorized(j) is not None}))


@llm.route("/llm/start", methods=['POST', 'OPTIONS'])
@llm.route("/llm/continue", methods=['POST', 'OPTIONS'])
@cross_origin()
def llm_feedback():
    j = request.get_json(silent=True) or {}
    entry = _authorized(j)
    if entry is None:
        return Response(json.dumps({'error': 'Invalid Token'}),
                        status=403, mimetype='application/json')
    existing = j.get('existing') or []
    if not isinstance(existing, list):
        existing = []
    draft = (j.get('new') or '').strip() or None
    yaml_text = j.get('assistant_yaml')
    if isinstance(yaml_text, str) and yaml_text.strip():
        compiled = assistant_yaml.compile_assistant(
            yaml_text,
            username=j.get('username') or '',
            topic_name=j.get('topic_name') or '',
            utterances=_clip_utterances(existing),
            draft=draft,
            article_page=j.get('article_page') if isinstance(j.get('article_page'), str) else None,
            post_title=j.get('post_title') if isinstance(j.get('post_title'), str) else None,
            post_description=j.get('post_description') if isinstance(j.get('post_description'), str) else None,
            participant_role=j.get('participant_role') if isinstance(j.get('participant_role'), str) else None,
        )
        text, persona, limit = None, None, None
        should_respond = True
        if compiled and GEMINI_API_KEY:
            # rate limits degrade to the no-feedback placeholder shape, never an
            # error: the gadget keeps its placeholder and the round is quiet.
            limit = _check_and_count(j.get('token'), entry)
            if not limit:
                try:
                    text, persona, should_respond = _generate_from_yaml(compiled)
                except Exception as e:
                    # gadget keeps placeholder if this round fails
                    print(f"llm yaml generate failed: {e}")
            else:
                persona = compiled["persona_name"]
        elif compiled:
            persona = compiled["persona_name"]
        return Response(json.dumps({
            'which': 'llm_assistant',
            'interaction_id': j.get('interaction_id') or int(time.time()),
            'llm_response': text if should_respond else (text or QUIET_MESSAGE),
            'llm_persona_name': persona,
            'should_respond': should_respond,
            'limit': limit,
        }), mimetype='application/json')

    summary, links, limit = None, [], None
    if existing and GEMINI_API_KEY:
        limit = _check_and_count(j.get('token'), entry)
        if not limit:
            try:
                summary, links = _generate(existing, draft)
            except Exception as e:
                # gadget keeps placeholder if this round fails
                print(f"llm generate failed: {e}")
    return Response(json.dumps({
        'which': 'llm_newcomer',
        'interaction_id': j.get('interaction_id') or int(time.time()),
        'llm_summary': summary,
        'llm_links': links,
        'limit': limit,
    }), mimetype='application/json')


@llm.route("/llm/submit", methods=['POST', 'OPTIONS'])
@llm.route("/llm/submit_feedback", methods=['POST', 'OPTIONS'])
@cross_origin()
def llm_submit():
    return Response(json.dumps({'status': 'success'}))
