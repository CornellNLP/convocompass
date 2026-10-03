"""compile a mediator-toolkit-style assistant.yaml into one gemini prompt.

slots we honor: TEXT, PARTICIPANT_INFO, CONTEXT, PARTICIPANT_CHAT_INPUT,
ARTICLE_PAGE, POST_TITLE, POST_DESCRIPTION, PARTICIPANT_ROLE, RULE.
everything else is ignored. used for both `prompt` and `should_respond_prompt`.
the api key and model name stay on the toolforge env; yaml cannot override them.
"""
import yaml

MAX_YAML_CHARS = 32768
MAX_ARTICLE_CHARS = 16384
ALLOWED_TYPES = {
    "TEXT",
    "PARTICIPANT_INFO",
    "CONTEXT",
    "PARTICIPANT_CHAT_INPUT",
    "ARTICLE_PAGE",
    "POST_TITLE",
    "POST_DESCRIPTION",
    "PARTICIPANT_ROLE",
    "RULE",
}

# copied from mediator-toolkit app/assistant-reddit/topics.ts CMV_RULES
CMV_RULES = [
    {
        "rule": "A",
        "title": "Rule A - Doesn't Explain View",
        "description": "Explain the reasoning behind your view, not just what that view is (500+ human-generated characters required).",
    },
    {
        "rule": "B",
        "title": "Rule B - 3rd Party/Devils Advocate/Soapboxing",
        "description": "You must personally hold the view and demonstrate that you are open to it changing. A post cannot be on behalf of others, playing devil's advocate, as any entity other than yourself, or 'soapboxing'. Posts by throwaway accounts must be approved through modmail.",
    },
    {
        "rule": "C",
        "title": "Rule C - Unclear/Improper Title",
        "description": 'Submission titles must adequately sum up your view and include "CMV:" at the beginning. Posts with misleading/overly-simplistic titles or titles that contain spoilers may be removed.',
    },
    {
        "rule": "D",
        "title": "Rule D - Neutral/Transgender/Harm a specific person/Promo/Meta",
        "description": "Posts cannot express a neutral stance, a stance regarding transgender topics, suggest harm against a specific person, be self-promotional, or discuss this subreddit (visit r/ideasforcmv instead).",
    },
    {
        "rule": "E",
        "title": "Rule E - No/Minimal Replies from OP in 2 hours",
        "description": "Only post if you are willing to have a conversation with those who reply to you, and are available to do so within 2 hours of your post going live. If you haven't replied during this time, your post will be removed.",
    },
    {
        "rule": "1",
        "title": "Rule 1 - Doesn't Challenge OP (top-level only)",
        "description": "Direct responses to a CMV post must challenge at least one aspect of OP's stated view (however minor), unless they are asking a clarifying question.",
    },
    {
        "rule": "2",
        "title": "Rule 2 - Rude/Hostile Comment",
        "description": "Don't be rude or hostile to other users. Your comment will be removed even if the rest of it is solid. 'They started it' is not an excuse. You should report it, not respond to it.",
    },
    {
        "rule": "3",
        "title": "Rule 3 - Bad Faith Accusation",
        "description": "Refrain from accusing OP or anyone else of being unwilling to change their view, of using AI to generate their post or comment, of lying, or of arguing in bad faith. If you are unsure whether someone is genuine, ask clarifying questions (see: socratic method). If you think they are still exhibiting ill behaviour, please message us.",
    },
    {
        "rule": "4",
        "title": "Rule 4 - Delta Abuse/Misuse or Should Award Delta",
        "description": "Award a delta if you've acknowledged a change in your view. Do not use deltas for any other purpose. You must include an explanation of the change along with the delta so we know it's genuine. Delta abuse includes sarcastic deltas, joke deltas, super-upvote deltas, etc.",
    },
    {
        "rule": "5",
        "title": "Rule 5 - Doesn't Contribute Meaningfully",
        "description": 'Comments must contain human-generated content and contribute meaningfully to the conversation. Comments that are only links, jokes, or "written upvotes" will be removed. Humor and affirmations of agreement can be contained within more substantial comments.',
    },
]


def _rule_text(item):
    """toolkit: Rule Title / Rule Description, or empty if the id is unknown."""
    rid = item.get("rule")
    if rid is None:
        return ""
    rid = str(rid)
    for rule in CMV_RULES:
        if rule["rule"] == rid:
            return f"Rule Title: {rule['title']}\nRule Description: {rule['description']}"
    return ""


def _render_blocks(blocks, username, topic, utterances, draft, article_page, scaffold,
                   post_title=None, post_description=None, participant_role=None):
    """render one prompt-block list into text parts."""
    items = sorted(blocks, key=lambda p: p.get("id", 0) if isinstance(p, dict) else 0)
    # if the template places the draft itself (PARTICIPANT_CHAT_INPUT), the
    # CONTEXT block should not also append it; older yamls without the block
    # keep the draft-inside-context behavior.
    has_chat_input = any(isinstance(p, dict) and p.get("type") == "PARTICIPANT_CHAT_INPUT"
                         for p in items)

    parts = []
    for item in items:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind not in ALLOWED_TYPES:
            print(f"assistant yaml: skipping prompt type {kind}")
            continue
        if kind == "TEXT":
            text = item.get("text") or ""
            parts.append(str(text).replace("{topic_name}", topic).strip())
        elif kind == "PARTICIPANT_CHAT_INPUT":
            body = (draft or "(no draft yet)").strip()
            parts.append(f"[draft]\n{body}" if scaffold else body)
        elif kind == "ARTICLE_PAGE":
            body = (article_page or "").strip()[:MAX_ARTICLE_CHARS] or "(article unavailable)"
            parts.append(f"[article]\n{body}" if scaffold else body)
        elif kind == "PARTICIPANT_INFO":
            body = (username or "anonymous").strip()
            parts.append(f"[participant]\n{body}" if scaffold else body)
        elif kind == "POST_TITLE":
            parts.append(f"Title: {post_title or ''}")
        elif kind == "POST_DESCRIPTION":
            parts.append(f"Description: {post_description or ''}")
        elif kind == "PARTICIPANT_ROLE":
            parts.append(f"Role: {participant_role or ''}")
        elif kind == "RULE":
            parts.append(_rule_text(item))
        elif kind == "CONTEXT":
            lines = []
            for i, utt in enumerate(utterances or []):
                text = ((utt.get("text") if isinstance(utt, dict) else "") or "").strip()
                if not text:
                    continue
                speaker = (utt.get("speaker") if isinstance(utt, dict) else None) or f"editor {i + 1}"
                lines.append(f"[{speaker}]: {text}")
            body = "\n".join(lines) if lines else "(empty discussion)"
            if draft and not has_chat_input:
                body = f"{body}\n\n[draft]\n{draft}" if scaffold else f"{body}\n\n{draft}"
            parts.append(f"[discussion]\n{body}" if scaffold else body)
    return parts


def compile_assistant(yaml_text, username, topic_name, utterances, draft, article_page=None,
                      post_title=None, post_description=None, participant_role=None):
    """return {prompt, persona_name, temperature, num_retries, message_field} or none."""
    if not isinstance(yaml_text, str) or not yaml_text.strip():
        print("assistant yaml: empty")
        return None
    if len(yaml_text) > MAX_YAML_CHARS:
        print("assistant yaml: too long")
        return None

    try:
        tpl = yaml.safe_load(yaml_text)
    except yaml.YAMLError as e:
        print(f"assistant yaml: parse failed: {e}")
        return None
    if not isinstance(tpl, dict):
        print("assistant yaml: not a mapping")
        return None

    prompts = tpl.get("prompt")
    if not isinstance(prompts, list) or not prompts:
        print("assistant yaml: missing prompt list")
        return None

    scaffold = bool(tpl.get("include_scaffolding_in_prompt"))
    topic = topic_name or "this discussion"
    render_args = (username, topic, utterances, draft, article_page, scaffold)
    render_kwargs = {
        "post_title": post_title,
        "post_description": post_description,
        "participant_role": participant_role,
    }
    parts = _render_blocks(prompts, *render_args, **render_kwargs)
    prompt = "\n\n".join(p for p in parts if p)
    if not prompt:
        print("assistant yaml: compiled prompt was empty")
        return None

    # optional gate: same block renderer, same live data. llm_backend appends
    # the {"should_respond": true/false} shape and makes the gate call.
    should_respond_prompt = None
    srp = tpl.get("should_respond_prompt")
    if isinstance(srp, list) and srp:
        sr_parts = _render_blocks(srp, *render_args, **render_kwargs)
        should_respond_prompt = "\n\n".join(p for p in sr_parts if p) or None

    so = tpl.get("structured_output") if isinstance(tpl.get("structured_output"), dict) else {}
    message_field = so.get("message_field") or "response"
    schema = so.get("schema") if isinstance(so.get("schema"), dict) else {message_field: {"type": "STRING"}}
    keys = ", ".join(f'"{k}": string' for k in schema)
    prompt = f"{prompt}\n\nrespond with only a json object, no markdown, in this shape: {{{keys}}}"

    persona = tpl.get("persona") if isinstance(tpl.get("persona"), dict) else {}
    persona_name = str(persona.get("name") or "ConvoCompass").strip()[:80]

    generation = tpl.get("generation") if isinstance(tpl.get("generation"), dict) else {}
    try:
        temperature = float(generation.get("temperature", 0.7))
    except (TypeError, ValueError):
        temperature = 0.7
    temperature = max(0.0, min(2.0, temperature))

    try:
        num_retries = int(tpl.get("num_retries", 2))
    except (TypeError, ValueError):
        num_retries = 2
    num_retries = max(1, min(5, num_retries))

    return {
        "should_respond_prompt": should_respond_prompt,
        "prompt": prompt,
        "persona_name": persona_name,
        "temperature": temperature,
        "num_retries": num_retries,
        "message_field": str(message_field),
    }
