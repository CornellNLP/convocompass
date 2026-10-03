"""Prompt text and the policy-link whitelist for the newcomer-oriented assistant.

The model never emits URLs. It picks shortcuts from POLICY_LINKS; generation.py
resolves each shortcut to its canonical title and URL from this table and drops
anything not in it. The only model-authored free text that reaches the browser
is the summary and the per-link "reason" sentences.
"""

# Curated Wikipedia policies/guidelines/help pages a newcomer is likely to need
# on a talk page. shortcut -> (canonical title, canonical URL).
POLICY_LINKS = {
    "WP:AGF": (
        "Assume good faith",
        "https://en.wikipedia.org/wiki/Wikipedia:Assume_good_faith",
    ),
    "WP:CIVIL": (
        "Civility",
        "https://en.wikipedia.org/wiki/Wikipedia:Civility",
    ),
    "WP:NPA": (
        "No personal attacks",
        "https://en.wikipedia.org/wiki/Wikipedia:No_personal_attacks",
    ),
    "WP:NPOV": (
        "Neutral point of view",
        "https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view",
    ),
    "WP:V": (
        "Verifiability",
        "https://en.wikipedia.org/wiki/Wikipedia:Verifiability",
    ),
    "WP:RS": (
        "Reliable sources",
        "https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources",
    ),
    "WP:OR": (
        "No original research",
        "https://en.wikipedia.org/wiki/Wikipedia:No_original_research",
    ),
    "WP:CON": (
        "Consensus",
        "https://en.wikipedia.org/wiki/Wikipedia:Consensus",
    ),
    "WP:BRD": (
        "Bold, revert, discuss",
        "https://en.wikipedia.org/wiki/Wikipedia:BOLD,_revert,_discuss_cycle",
    ),
    "WP:EW": (
        "Edit warring",
        "https://en.wikipedia.org/wiki/Wikipedia:Edit_warring",
    ),
    "WP:TALK": (
        "Talk page guidelines",
        "https://en.wikipedia.org/wiki/Wikipedia:Talk_page_guidelines",
    ),
    "WP:INDENT": (
        "Indentation",
        "https://en.wikipedia.org/wiki/Wikipedia:Indentation",
    ),
    "WP:SIGN": (
        "Signatures",
        "https://en.wikipedia.org/wiki/Wikipedia:Signatures",
    ),
    "WP:DR": (
        "Dispute resolution",
        "https://en.wikipedia.org/wiki/Wikipedia:Dispute_resolution",
    ),
    "WP:3O": (
        "Third opinion",
        "https://en.wikipedia.org/wiki/Wikipedia:Third_opinion",
    ),
    "WP:RFC": (
        "Requests for comment",
        "https://en.wikipedia.org/wiki/Wikipedia:Requests_for_comment",
    ),
    "WP:BLP": (
        "Biographies of living persons",
        "https://en.wikipedia.org/wiki/Wikipedia:Biographies_of_living_persons",
    ),
    "WP:NOTFORUM": (
        "Wikipedia is not a forum",
        "https://en.wikipedia.org/wiki/Wikipedia:What_Wikipedia_is_not",
    ),
    "WP:OWN": (
        "Ownership of content",
        "https://en.wikipedia.org/wiki/Wikipedia:Ownership_of_content",
    ),
}


def _policy_menu():
    return "\n".join(f"- {s}: {title}" for s, (title, _url) in POLICY_LINKS.items())


SYSTEM_PROMPT = f"""You are ConvoCompass, a companion for a NEWCOMER to Wikipedia who is about to
reply in a talk-page discussion. Newcomers often don't know the site's norms, the
policy jargon being thrown at them, or where anything is documented. Your job:

1. "summary": Summarize the discussion so far in 2-3 plain sentences a newcomer can
   follow. Name what is actually being disputed and where the discussion stands.
   Neutrally decode any policy jargon the participants used (e.g. if someone wrote
   "fails RS", say the dispute is about whether the source is reliable). Do not take
   sides, do not scold anyone, and do not address any participant.

2. "links": Pick 1 to 3 pages from the menu below that would most help this newcomer
   participate well in THIS discussion, each with a one-sentence "reason" explaining,
   in second person ("you"), why it is worth reading right now — tied to something
   concrete in the discussion or in their draft, never generic. Prefer pages about
   the subject of the dispute (sourcing, neutrality, consensus process) over conduct
   pages, unless the thread is visibly heated. If the editor's draft is provided,
   let it influence which pages you pick.

Menu of pages (use these shortcuts exactly; never invent others):
{_policy_menu()}

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{{"summary": "...", "links": [{{"shortcut": "WP:...", "reason": "..."}}]}}"""


def build_user_prompt(utterances, draft=None):
    """Render the conversation (and optional draft) for the model."""
    lines = []
    for i, utt in enumerate(utterances):
        speaker = utt.get("speaker") or f"Editor {i + 1}"
        text = (utt.get("text") or "").strip()
        if text:
            lines.append(f"[{speaker}]: {text}")
    parts = ["Talk-page discussion so far:", "\n".join(lines) if lines else "(empty)"]
    if draft:
        parts += ["", "The newcomer's draft reply (not yet posted):", draft.strip()]
    return "\n".join(parts)
