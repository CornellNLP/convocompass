import model_loader
from convokit.model import Utterance, Corpus, Speaker


def _build_corpus(existing, new_text=None):
    """build a convokit corpus from the existing utterances and optional new text.
    mirrors the corpus construction in extension.py's crafted() function."""
    utterances = [
        Utterance(
            id=existing[0]["id"],
            conversation_id=existing[0]["id"],
            speaker=Speaker(id="unknown"),
            text=existing[0]["text"],
            timestamp=0,
        )
    ]
    for i in range(1, len(existing)):
        utterances.append(
            Utterance(
                id=existing[i]["id"],
                conversation_id=existing[0]["id"],
                reply_to=existing[i - 1]["id"],
                speaker=Speaker(id="unknown"),
                text=existing[i]["text"],
                timestamp=i,
            )
        )

    if new_text:
        utterances.append(
            Utterance(
                id="new",
                conversation_id=existing[0]["id"],
                reply_to=existing[-1]["id"],
                speaker=Speaker(id="unknown"),
                text=new_text,
                timestamp=len(existing),
            )
        )

    return Corpus(utterances=utterances)


def score_conversation(existing, new_text=None):
    """score a conversation using the forecaster-wrapped transformer encoder model.

    builds a corpus, runs forecaster.transform() to annotate each utterance
    with forecast_prob, and returns a dict of {utt_id: score}.
    """
    corpus = _build_corpus(existing, new_text)
    forecaster = model_loader.get_forecaster()
    corpus = forecaster.transform(corpus)

    scores = {}
    for utt in corpus.iter_utterances():
        prob = utt.meta.get("forecast_prob")
        if prob is not None:
            scores[utt.id] = prob

    return scores


def score_batch(conversations):
    """score multiple conversations in batch."""
    results = []
    for conv in conversations:
        existing = conv.get("existing", [])
        new_text = conv.get("new", None)
        scores = score_conversation(existing, new_text)
        results.append(scores)
    return results
