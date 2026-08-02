# RoBERTa Model Service

standalone service for serving fine-tuned roberta model for craft scoring.

## setup

1. place your hugging face checkpoint in a directory (e.g., `./roberta-model-checkpoint/`)
2. the checkpoint should contain:
   - `config.json`
   - `pytorch_model.bin` or `model.safetensors`
   - `tokenizer_config.json`
   - `vocab.json`
   - other tokenizer files

## running with docker

```bash
# build the image
docker build -t roberta-model-service .

# run the container
docker run -p 8086:8086 \
  -v /path/to/your/checkpoint:/app/model \
  -e MODEL_PATH=/app/model \
  -e DEVICE=cpu \
  roberta-model-service
```

## running locally

```bash
# install dependencies
pip install -r requirements.txt

# set environment variables
export MODEL_PATH=/path/to/your/checkpoint
export DEVICE=cpu

# run the server
python server.py
```

## api endpoints

### health check
```bash
curl http://localhost:8086/health
```

### score a conversation
```bash
curl -X POST http://localhost:8086/score \
  -H "Content-Type: application/json" \
  -d '{
    "existing": [
      {"id": "1", "text": "hello there"},
      {"id": "2", "text": "hi, how are you?"}
    ],
    "new": "im doing great!"
  }'
```

response:
```json
{
  "scores": {
    "1": 0.234,
    "2": 0.345,
    "new": 0.123
  }
}
```

## environment variables

- `MODEL_PATH`: path to hugging face checkpoint or a parent directory that contains checkpoint subfolders (default: `/models/checkpoint`)
- `HF_REPO_ID`: hugging face hub repo id, used when `MODEL_PATH` does not exist on disk (default: unset)
- `DEVICE`: device to use (`cpu` or `cuda`) (default: `cpu`)
- `BATCH_SIZE`: batch size for inference (default: `16`)
- `MAX_LENGTH`: maximum sequence length (default: `512`)
