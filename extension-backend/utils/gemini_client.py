"""Client for the gemini-service. Mirrors roberta_client.py's role, with inverted
failure semantics: scoring failures 500 the request, but assistance failures must
never reach the editor mid-typing — every error path here returns None and the
gadget falls back to its placeholder text."""

import logging

import requests

logger = logging.getLogger(__name__)


def get_feedback(existing, new, service_url, timeout):
    """POST the conversation to the gemini-service.

    :param existing: list of {"id", "text"} dicts (the request payload shape)
    :param new: draft reply text or None
    :param service_url: base url of the gemini-service
    :param timeout: seconds; also bounds how stale the panel can feel
    :return: {"summary": str|None, "links": [...], "meta": {...}} or None
    """
    payload = {
        "utterances": [
            {"id": str(u.get("id")), "text": u.get("text", "")} for u in existing
        ]
    }
    if new:
        payload["draft"] = new

    try:
        response = requests.post(
            f"{service_url.rstrip('/')}/feedback", json=payload, timeout=timeout
        )
        response.raise_for_status()
        data = response.json()
    except Exception:
        logger.exception("[warning] gemini-service call failed; no feedback this round")
        return None

    if not isinstance(data, dict):
        return None
    return data
