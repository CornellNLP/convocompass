import os
import config
from convokit.forecaster.TransformerEncoderModel import TransformerEncoderModel
from convokit.forecaster.TransformerForecasterConfig import TransformerForecasterConfig
from convokit.forecaster.forecaster import Forecaster


OUTPUT_DIR = os.environ.get("FORECASTER_OUTPUT_DIR", "/tmp/roberta-output")

forecaster_instance = None


def _resolve_model_path(base_path):
    """resolve checkpoint directory if base path is a container directory"""
    expected_files = {"config.json", "tokenizer.json", "vocab.json"}
    model_files = {"model.safetensors", "pytorch_model.bin"}

    if _is_checkpoint_dir(base_path, expected_files, model_files):
        return base_path

    candidates = []
    for root, _, files in os.walk(base_path):
        file_set = set(files)
        if _is_checkpoint_dir(root, expected_files, model_files, file_set):
            candidates.append(root)

    if not candidates:
        return base_path

    candidates.sort(key=_checkpoint_sort_key, reverse=True)
    return candidates[0]


def _is_checkpoint_dir(path, expected_files, model_files, file_set=None):
    if file_set is None:
        try:
            file_set = set(os.listdir(path))
        except FileNotFoundError:
            return False
    has_config = "config.json" in file_set
    has_tokenizer = bool({"tokenizer.json", "vocab.json"} & file_set)
    has_model = bool(model_files & file_set)
    return has_config and has_tokenizer and has_model


def _checkpoint_sort_key(path):
    for part in reversed(path.split(os.sep)):
        if part.startswith("checkpoint-"):
            try:
                return int(part.split("-", 1)[1])
            except ValueError:
                return -1
    return -1


def load_forecaster():
    """load a TransformerEncoderModel from checkpoint and wrap it in a Forecaster"""
    global forecaster_instance

    model_path = config.MODEL_PATH
    print(f"[info] using device: {config.DEVICE}")

    if os.path.exists(model_path):
        print(f"[info] loading transformer encoder model from {model_path}")
        resolved_path = _resolve_model_path(model_path)
        if resolved_path != model_path:
            print(f"[info] resolved model checkpoint at {resolved_path}")
    else:
        # not on disk — fall back to the hugging face hub. transformers resolves
        # and caches the repo id itself, so we can hand it through untouched.
        resolved_path = config.HF_REPO_ID or model_path
        if not resolved_path or os.sep in resolved_path:
            raise FileNotFoundError(
                f"model checkpoint not found at {model_path} and no hub repo configured. "
                f"either mount a checkpoint at MODEL_PATH or set HF_REPO_ID."
            )
        print(f"[info] loading transformer encoder model from hugging face hub: {resolved_path}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    cfg = TransformerForecasterConfig(
        output_dir=OUTPUT_DIR,
        device=config.DEVICE,
    )

    encoder_model = TransformerEncoderModel(resolved_path, config=cfg)
    print(f"[info] transformer encoder model loaded successfully")

    # dummy labeler — required by _context_to_bert_data but unused at inference
    forecaster_instance = Forecaster(
        forecaster_model=encoder_model,
        labeler=lambda convo: 0,
        forecast_attribute_name="forecast",
        forecast_prob_attribute_name="forecast_prob",
    )
    print(f"[info] forecaster ready")


def get_forecaster():
    if forecaster_instance is None:
        raise RuntimeError("forecaster not loaded. call load_forecaster() first.")
    return forecaster_instance


def is_loaded():
    return forecaster_instance is not None
