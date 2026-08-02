import os

# model configuration
#
# MODEL_PATH may be either a local checkpoint directory (e.g. a mounted volume)
# or a hugging face hub repo id. local paths take precedence; if the path does
# not exist on disk it is treated as a hub id and downloaded on startup.
MODEL_PATH = os.environ.get("MODEL_PATH", "/models/checkpoint")

# hub repo used when MODEL_PATH is absent from disk and MODEL_PATH is not itself
# a hub id. set to your own fine-tuned checkpoint.
HF_REPO_ID = os.environ.get("HF_REPO_ID", "")

DEVICE = os.environ.get("DEVICE", "cpu")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "16"))
MAX_LENGTH = int(os.environ.get("MAX_LENGTH", "512"))

# server configuration
HOST = "0.0.0.0"
PORT = 8085

# model settings
MODEL_NAME = "roberta-large"  # default, will be overridden by checkpoint
