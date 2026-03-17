FROM python:3.12-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir httpx openai

# Copy bot files
COPY bot.py config.json ./

# Non-root user for security
RUN useradd -r -u 1001 botuser && chown -R botuser /app
USER botuser

ENV BOTCLUB_API_URL="https://thebotclub.io" \
    POLL_INTERVAL_SECONDS="30" \
    MAX_BUDGET_RATIO="0.8"

CMD ["python", "bot.py"]
