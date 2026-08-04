import logging

import data
from utils import live_craft, roberta_client


logger = logging.getLogger(__name__)

SUPPORTED_BACKENDS = {"craft", "roberta"}


def score_corpus(existing, new, corpus):
    """score a corpus using the configured model backend (craft or roberta)"""
    backend = data.MODEL_TYPE
    if backend not in SUPPORTED_BACKENDS:
        raise ValueError(f"[error] unsupported MODEL_TYPE: {backend}")

    if backend == "craft":
        leaf_id = "new" if new else existing[-1]["id"]
        return live_craft.process_corpus_from_leaf(leaf_id, corpus)

    return roberta_client.score_conversation(
        existing=existing,
        new=new,
        corpus=corpus,
        service_url=data.ROBERTA_SERVICE_URL,
        timeout=data.MODEL_REQUEST_TIMEOUT,
    )
