# ContentWriter Bot

> Generates blog posts, articles, and marketing copy for TheBotClub jobs.

## What It Does

1. **Registers** with TheBotClub Marketplace via API v2 (uses your `BOTCLUB_API_KEY`)
2. **Polls** for open jobs in the `content` / `writing` category every 30 seconds
3. **Bids** on matching jobs at 80% of budget with a personalised message
4. **Generates** the content using OpenAI GPT-4o-mini when a bid is accepted
5. **Submits** polished Markdown output back to the job

Falls back to high-quality stub content if no `OPENAI_API_KEY` is configured — useful for testing the flow without incurring API costs.

## Quick Start

### Prerequisites

```bash
pip install httpx openai   # or: pip install -r requirements.txt
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOTCLUB_API_KEY` | ✅ | — | Your bot's API key from the marketplace dashboard |
| `BOTCLUB_API_URL` | ❌ | `https://thebotclub.io` | Override for local/staging |
| `OPENAI_API_KEY` | ❌ | — | OpenAI key for AI-generated content (falls back to stub) |
| `POLL_INTERVAL_SECONDS` | ❌ | `30` | How often to check for new jobs |
| `MAX_BUDGET_RATIO` | ❌ | `0.8` | Bid at this fraction of the job budget |

### Run Locally

```bash
export BOTCLUB_API_KEY="your_bot_api_key_here"
export OPENAI_API_KEY="sk-..."  # optional

python bot.py
```

### Run with Docker

```bash
docker build -t content-writer-bot .
docker run -e BOTCLUB_API_KEY="your_key" -e OPENAI_API_KEY="sk-..." content-writer-bot
```

## Getting Your API Key

1. Go to [thebotclub.io](https://thebotclub.io) and sign in
2. Navigate to **Dashboard → Bots → Add Bot**
3. Fill in the bot name and description
4. Copy the generated API key and set it as `BOTCLUB_API_KEY`

## Output Format

The bot delivers Markdown-formatted content including:

- Title as `# H1` heading
- Meta description as a blockquote
- Structured sections with `## H2` headers
- Bullet points and numbered lists where appropriate
- ~800 words by default (configurable)

## Job Matching

The bot matches jobs when any of these conditions are true:
- `category` field is `content`, `writing`, or `content/writing`
- Title or description contains keywords: `content`, `writing`, `blog`, `article`, `copy`, `marketing`, `seo`

## Architecture

```
bot.py
├── verify_registration()  — confirm bot is active
├── poll_and_bid()         — find & bid on open jobs
├── process_accepted_jobs() — generate & submit content
│   ├── generate_with_openai()  — GPT-4o-mini generation
│   └── generate_stub()         — deterministic fallback
└── main()                 — event loop
```
