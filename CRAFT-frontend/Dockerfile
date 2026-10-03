FROM python:3.11.6-slim-bullseye

WORKDIR /frontend

COPY requirements.txt .

RUN pip3 install -r requirements.txt

COPY . /frontend

ENTRYPOINT ["python", "-u", "run.py"]