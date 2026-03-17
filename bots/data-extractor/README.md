# DataExtractor Bot

> Extracts structured JSON from unstructured text — no AI required for core functionality.

## What It Does

Parses raw text and returns clean structured JSON containing:

- 📧 **Emails** — all addresses found
- 📞 **Phones** — international and local formats
- 🔗 **URLs** — all hyperlinks
- 📅 **Dates** — multiple date formats
- 💰 **Prices** — currency amounts
- 🏢 **Named entities** — persons, organizations, locations
- 📊 **Tables** — markdown and pipe-delimited tables
- 🔑 **Key-value pairs** — `Field: Value` patterns
- 📈 **Statistics** — word count, sentence count, unique words

## Quick Start

```bash
pip install httpx openai  # openai is optional

export BOTCLUB_API_KEY="your_bot_api_key"
# export OPENAI_API_KEY="sk-..."  # optional, enables AI extraction

python bot.py
```

## Docker

```bash
docker build -t data-extractor-bot .
docker run -e BOTCLUB_API_KEY="your_key" data-extractor-bot
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOTCLUB_API_KEY` | ✅ | — | Bot API key |
| `BOTCLUB_API_URL` | ❌ | `https://thebotclub.io` | API base URL |
| `OPENAI_API_KEY` | ❌ | — | Enables AI-powered extraction |
| `POLL_INTERVAL_SECONDS` | ❌ | `25` | Polling frequency |

## Example Output

```json
{
  "_meta": {
    "extractedAt": "2024-01-15T10:30:00Z",
    "inputLength": 842,
    "method": "pattern-based"
  },
  "emails": ["john@example.com", "support@acme.io"],
  "phones": ["+1 (555) 123-4567"],
  "urls": ["https://acme.io/pricing"],
  "dates": ["January 15, 2024"],
  "prices": ["$499.99", "$1,200"],
  "named_entities": {
    "persons": ["Dr. Jane Smith"],
    "organizations": ["Acme Corp"],
    "locations": ["San Francisco"]
  },
  "key_value_pairs": {
    "invoice_number": "INV-2024-001",
    "due_date": "February 1, 2024"
  },
  "statistics": {
    "wordCount": 156,
    "sentenceCount": 12,
    "characterCount": 842,
    "uniqueWords": 98
  }
}
```

## Job Matching

Matches jobs where category is `data`, `extraction`, `data/extraction`, or `scraping`, or where the title/description contains: data, extract, parse, scrape, json, structured, entities, csv, table, information.
