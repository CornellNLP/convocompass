FROM python:3.11-slim

WORKDIR /app

# install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# copy requirements and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# neutralize convokit's hard import of TransformerDecoderModel (pulls unsloth).
# we only use TransformerEncoderModel (RoBERTa); make the decoder import best-effort.
RUN python - <<'PY'
import os, convokit
p = os.path.join(os.path.dirname(convokit.__file__), "forecaster", "__init__.py")
# Rewrite the forecaster package init to avoid unconditionally importing
# TransformerDecoderModel (which pulls unsloth). We only use the encoder.
with open(p, "w") as f:
    f.write(
        "from .forecaster import *\n"
        "from .forecasterModel import *\n"
        "from .cumulativeBoW import *\n"
        "import sys\n"
        "if 'torch' in sys.modules:\n"
        "    from .CRAFTModel import *\n"
        "    from .CRAFT import *\n"
        "try:\n"
        "    from .TransformerDecoderModel import *\n"
        "except BaseException as _e:\n"
        "    import warnings\n"
        "    warnings.warn(f'skipping TransformerDecoderModel (encoder-only service): {_e}')\n"
        "from .TransformerEncoderModel import *\n"
        "from .TransformerForecasterConfig import *\n"
    )
compile(open(p).read(), p, "exec")
print("rewrote convokit forecaster/__init__.py ok")
PY

# copy application files
COPY config.py .
COPY model_loader.py .
COPY inference.py .
COPY server.py .

# expose port
EXPOSE 8085

# run server with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8085", "--workers", "1", "--timeout", "300", "server:app"]
