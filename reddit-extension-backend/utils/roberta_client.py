import logging
from typing import Any, Dict, List, Optional

import requests
from convokit.model import Corpus


logger = logging.getLogger(__name__)


def score_conversation(
    existing: List[Dict[str, Any]],
    new: Optional[str],
    corpus: Corpus,
    service_url: str,
    timeout: float,
) -> Corpus:
    """send a conversation to the roberta service and write scores into the corpus."""
    payload_existing = []
    id_map: Dict[str, Any] = {}

    for idx, utt in enumerate(existing):
        raw_id = utt.get("id")
        request_id = str(raw_id) if raw_id is not None else f"idx_{idx}"
        payload_existing.append({"id": request_id, "text": utt.get("text", "")})
        id_map[request_id] = raw_id

    payload = {"existing": payload_existing}
    if new is not None:
        payload["new"] = new

    url = f"{service_url.rstrip('/')}/score"
    response = requests.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    data = response.json()

    if "scores" not in data:
        raise ValueError("[error] missing 'scores' in roberta response")

    for req_id, score in data["scores"].items():
        if req_id == "new":
            original_id = "new"
        else:
            original_id = id_map.get(req_id, req_id)

        if original_id is None:
            logger.warning("[warning] skipping score for None id (req_id=%s)", req_id)
            continue

        try:
            corpus.get_utterance(original_id).meta["craft_score"] = score
        except KeyError:
            logger.warning("[warning] missing utterance id %s when applying scores", original_id)

    logger.debug("[info] roberta scores applied to corpus for %d items", len(data["scores"]))
    return corpus
