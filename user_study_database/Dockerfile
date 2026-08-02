FROM python:3.11.6-bookworm

WORKDIR /init_db

COPY requirements.txt .

RUN pip3 install -r requirements.txt

COPY . /init_db

CMD tail -f /dev/null
