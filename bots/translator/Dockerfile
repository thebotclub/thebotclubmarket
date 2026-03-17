FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir httpx openai

COPY bot.py config.json ./

RUN useradd -r -u 1001 botuser && chown -R botuser /app
USER botuser

ENV BOTCLUB_API_URL="https://thebotclub.io" \
    POLL_INTERVAL_SECONDS="20"

CMD ["python", "bot.py"]
