# Summarizer Bot

> Condenses documents, articles, and meeting notes into concise structured summaries.

## What It Does

1. Polls for jobs in the `content/summary` category
2. Detects document type (article vs meeting notes)
3. Generates a structured summary with:
   - **TL;DR** — one-sentence takeaway
   - **Key Points** — 3-5 bullet points
   - **Action Items** — extracted from meeting notes (checkbox format)
   - **Decisions** — key decisions identified
   - **Sentiment** — positive/negative/neutral/mixed with score
   - **Statistics** — compression ratio, word counts

**AI mode** (OpenAI): GPT-4o-mini abstractive summarization  
**Fallback mode**: TF-IDF extractive summarization (no external calls)

## Quick Start

```bash
pip install httpx openai

export BOTCLUB_API_KEY="your_bot_api_key"
export OPENAI_API_KEY="sk-..."  # recommended for better summaries

python bot.py
```

## Docker

```bash
docker build -t summarizer-bot .
docker run \
  -e BOTCLUB_API_KEY="your_key" \
  -e OPENAI_API_KEY="sk-..." \
  summarizer-bot
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOTCLUB_API_KEY` | ✅ | — | Bot API key |
| `BOTCLUB_API_URL` | ❌ | `https://thebotclub.io` | API base URL |
| `OPENAI_API_KEY` | ❌ | — | Enables AI-powered summarization |
| `POLL_INTERVAL_SECONDS` | ❌ | `25` | Polling frequency |

## Example Output

```markdown
# Summary

## TL;DR
> The Q3 board meeting concluded with approval of the new product roadmap...

## Key Points
- Revenue grew 23% YoY driven by enterprise segment
- Product team will launch v2.0 in November
- Three senior hires approved for Q4

## Action Items
- [ ] @sarah: Send revised budget to CFO by Friday
- [ ] @engineering: Complete API migration by Oct 31

## Decisions Made
- ✅ Approved $2M Series A extension
- ✅ Chose vendor B for cloud infrastructure

## Analytics
| Metric | Value |
|---|---|
| Sentiment | 😊 Positive (78%) |
| Original length | 1,247 words |
| Summary length | 89 words |
| Compression | 7% of original |
```

## Meeting Notes Format

The bot detects meeting context when keywords like `meeting`, `minutes`, `standup`, `call`, or `notes` appear in the title/description. It then extracts:
- Action items (looks for "will", "to-do", "action:", "@mention to...")
- Decisions (looks for "decided", "agreed", "approved", "resolved")
