import data
from utils import craft

# from convokit.model.forecaster.CRAFTModel import CRAFTModel
# CRAFT_model = CRAFTModel(device_type="cpu", model_path="model_cmv.tar")
import resource
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


def rank_convo(i):
    test_pairs, length = load_convo_pairs(i)
    # print(f'i={i}, length={length}')
    if length < 100:
        forcasts = evaluate_convo(test_pairs)
        # forcasts = CRAFT_model.forecast(test_pairs)
        for idx, utt_id in enumerate(forcasts["id"]):
            data.CORPUS.get_utterance(utt_id).meta["craft_score"] = forcasts["score"][
                idx
            ]
        # print('forcasts added to corpus')
    else:
        # print('convo length too long; not ranking')
        pass


def load_convo_pairs(i):
    # get conversation ending in utterance with id i
    utt = data.CORPUS.get_utterance(i)
    convo = [utt]
    pairs = []
    # pairs = {} # if using convokit craft
    while utt.reply_to is not None:
        utt = data.CORPUS.get_utterance(utt.reply_to)
        convo.append(utt)
    convo = convo[::-1]
    dialog = process_dialog(convo)
    for idx in range(0, len(dialog)):
        if dialog[idx]["scored"]:
            continue
        reply = ["UNK"]
        label = False
        comment_id = dialog[idx]["id"]
        # gather as context all utterances preceding the reply
        context = [u["tokens"][: (craft.MAX_LENGTH - 1)] for u in dialog[: idx + 1]]
        pairs.append((context, reply, label, comment_id))
        # pairs[comment_id] = (context, reply, label) # if using convokit craft
    return pairs, len(dialog)


def process_corpus_from_leaf(leaf_id: str, corpus):
    logger.debug(f"Processing corpus from leaf: {leaf_id}")
    utt = corpus.get_utterance(leaf_id)
    convo = [utt]
    pairs = []

    # Log the initial utterance
    logger.debug(f"Initial utterance - ID: {utt.id}, Text: {utt.text[:50]}...")

    while utt.reply_to is not None:
        utt = corpus.get_utterance(utt.reply_to)
        convo.append(utt)
        logger.debug(f"Added to conversation - ID: {utt.id}, Text: {utt.text[:50]}...")

    convo = convo[::-1]
    logger.debug(f"Conversation length: {len(convo)}")

    # Log the full conversation structure
    logger.debug("Conversation structure:")
    for i, u in enumerate(convo):
        logger.debug(
            f"{i}: ID={u.id}, Reply_to={u.reply_to}, Has_score={'craft_score' in u.meta}"
        )

    dialog = process_dialog(convo)
    for idx in range(0, len(dialog)):
        if dialog[idx]["scored"]:
            logger.debug(f"Skipping scored utterance: {dialog[idx]['id']}")
            continue
        reply = ["UNK"]
        label = False
        comment_id = dialog[idx]["id"]
        context = [u["tokens"][: (craft.MAX_LENGTH - 1)] for u in dialog[: idx + 1]]
        pairs.append((context, reply, label, comment_id))
        logger.debug(
            f"Added pair for evaluation - ID: {comment_id}, Context length: {len(context)}"
        )

    logger.debug(f"Number of pairs to evaluate: {len(pairs)}")
    if len(pairs) > 0:
        logger.debug("Starting CRAFT evaluation...")
        forecasts = evaluate_convo(pairs)

        for idx, utt_id in enumerate(forecasts["id"]):
            score = forecasts["score"][idx]
            logger.debug(f"Utterance {utt_id} - CRAFT Score: {score}")
            corpus.get_utterance(utt_id).meta["craft_score"] = score
    else:
        logger.debug("No new pairs to evaluate - all utterances already scored")

    return corpus


def process_dialog(convo):
    processed = []
    for utterance in convo:
        tokens = craft.tokenize(utterance.text)
        # replace out-of-vocabulary tokens
        for i in range(len(tokens)):
            if tokens[i] not in craft.voc_cmv.word2index:
                tokens[i] = "UNK"
        # Never mark the "new" utterance as scored, so it will always be re-evaluated
        processed.append(
            {
                "tokens": tokens,
                "is_attack": 0,
                "id": utterance.id,
                "scored": "craft_score" in utterance.meta
                and utterance.meta["craft_score"] != 0
                and utterance.id != "new",  # Never mark "new" utterance as scored
            }
        )
    return processed


def evaluate_convo(pairs):
    return craft.evaluateDataset(
        pairs,
        craft.encoder_cmv,
        craft.context_encoder_cmv,
        craft.predictor_cmv,
        craft.voc_cmv,
        craft.batch_size,
        craft.device,
    )
