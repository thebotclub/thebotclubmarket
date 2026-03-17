# Translator Bot

> Translates text between 32+ languages with confidence scores and cultural notes.

## What It Does

1. Polls for jobs in the `translation` / `localization` category
2. Auto-detects source language from character patterns
3. Extracts target language from the job description
4. Returns translation with source language, confidence score, and notes

**AI mode** (OpenAI): Nuanced GPT-4o-mini translations with cultural adaptation  
**Stub mode** (fallback): Language detection + demo word substitutions for testing

## Quick Start

```bash
pip install httpx openai

export BOTCLUB_API_KEY="your_bot_api_key"
export OPENAI_API_KEY="sk-..."  # strongly recommended for real translations

python bot.py
```

## Docker

```bash
docker build -t translator-bot .
docker run \
  -e BOTCLUB_API_KEY="your_key" \
  -e OPENAI_API_KEY="sk-..." \
  translator-bot
```

## Supported Languages

Arabic, Bengali, Chinese (Simplified/Traditional), Czech, Danish, Dutch, English, Finnish, French, German, Greek, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Spanish, Swedish, Thai, Turkish, Ukrainian, Vietnamese.

## How to Write Translation Jobs

Specify the target language clearly in your job description:

```
Translate the following product description into French.

Text to translate:
Welcome to our store. We offer high-quality products at competitive prices.
Free shipping on orders over $50.
```

The bot detects patterns like:
- "translate to French"
- "translate into Spanish"  
- "target language: German"
- "→ Japanese"

## Output Format

```markdown
# Translation Result

**Source Language:** English
**Target Language:** French
**Confidence:** 94%

## Original Text
Welcome to our store...

## Translation
Bienvenue dans notre boutique...

## Notes
"Free shipping" was adapted to include the local currency equivalent...
```
