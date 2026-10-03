# ConvoCompass

ConvoCompass is a tool which allows users to deploy conversational assistants directly into communication platforms on which they use, such as Reddit or Wikipedia.

## Repository layout

- `wiki-talk-page/`: Wikipedia userscript
- `wiki-talk-page/yaml/`: Example `assistant.yaml` files
- `extension-backend/`: Legacy code, for forecasting: Flask API (`:8083`) the userscripts call for forecasting scores, participant tokens, and logging
- `roberta-model-service/`: Legacy code, for forecasting: Serves the fine-tuned RoBERTa forecaster over HTTP
- `user_study_database/`: Legacy code, for forecasting: MySQL for keeping track of tokens.
- `CRAFT-frontend/`: Includes the LLM backend: `assistant.yaml` parsing (`server/assistant_yaml.py`) and the Gemini calls (`server/llm_backend.py`, started by `run_llm.py`).
- `reddit_extension/`: Chrome extension for Reddit.

## Running the LLM backend

```bash
cd CRAFT-frontend
pip install -r requirements.txt
export GEMINI_API_KEY= # YOUR API KEY
export GEMINI_MODEL=gemini-3.5-flash
python run_llm.py
```

Currently, our system only uses the Gemini API for its requests.

In order to have your llm request approved by the backend, we also keep track of valid participant tokens to ensure security. Tokens come from the study database, or from `LLM_DEMO_TOKEN` / `LLM_DEMO_TOKENS` for testing (format documented at the top of `server/llm_backend.py`).

| Route | Purpose |
|---|---|
| `POST /llm/claim_token` | check a token |
| `POST /llm/start`, `/llm/continue` | generate feedback for a thread and draft |
| `POST /llm/submit`, `/llm/submit_feedback` | acknowledge submission |

If the request includes `assistant_yaml`, the backend follows that file. Otherwise it returns the default discussion summary and policy links.

## `assistant.yaml`

The main way of creating a YAML is via using a toolkit. The file determines persona, generation settings, and a `prompt` list of blocks that are joined into one LLM prompt. An optional `should_respond_prompt` runs first which controls whether or not the assistant decides to update with an intervention/new text.

```yaml
persona:
  name: Context and policies
generation:
  temperature: 0.7
num_retries: 2
structured_output:
  message_field: response
prompt:
  - id: 0
    type: TEXT
    text: You are helping a newcomer in this discussion.
  - id: 1
    type: CONTEXT
  - id: 2
    type: PARTICIPANT_CHAT_INPUT
```

The following block types are supported:
`TEXT`, `CONTEXT` (the thread), `PARTICIPANT_CHAT_INPUT` (the draft), `PARTICIPANT_INFO`, `ARTICLE_PAGE`, `POST_TITLE`, `POST_DESCRIPTION`, `PARTICIPANT_ROLE`, and `RULE` (an r/changemyview rule by id).

These come from the 

## Installing the Wikipedia userscript

Copy one of the `wiki-talk-page-codex.js` scripts into your `common.js`. Point the script's backend URL at your own deployment, if you wish, or use User:Laerdon/ConvoWizardTesting.js.
