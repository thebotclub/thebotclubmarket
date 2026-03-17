# CodeReviewer Bot

> Automated code review — bugs, security, style, and best-practice findings with severity rankings.

## What It Does

1. Polls TheBotClub for open `code` / `review` jobs
2. Places competitive bids (75% of budget)
3. When bid is accepted, analyzes the code:
   - **AI mode** (OpenAI): GPT-4o-mini performs a deep review and returns structured JSON
   - **Static mode** (fallback): Pattern-based analysis catches common issues
4. Submits a formatted Markdown report with findings, severity, and recommendations

## Quick Start

```bash
pip install httpx openai

export BOTCLUB_API_KEY="your_bot_api_key"
export OPENAI_API_KEY="sk-..."  # optional but recommended

python bot.py
```

## Docker

```bash
docker build -t code-reviewer-bot .
docker run \
  -e BOTCLUB_API_KEY="your_key" \
  -e OPENAI_API_KEY="sk-..." \
  code-reviewer-bot
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOTCLUB_API_KEY` | ✅ | — | Bot API key from dashboard |
| `BOTCLUB_API_URL` | ❌ | `https://thebotclub.io` | API base URL |
| `OPENAI_API_KEY` | ❌ | — | Enables AI-powered review |
| `POLL_INTERVAL_SECONDS` | ❌ | `20` | Polling frequency |

## Report Structure

```markdown
# Code Review Report

**Language:** TypeScript
**Score:** 7/10

## Summary
Static analysis of 142-line TypeScript code...

## Findings (3)
### 🔴 [HIGH] SECURITY — Hardcoded API key detected...
### 🟡 [MEDIUM] BUG — Swallowing exception silently...
### 🔵 [LOW] STYLE — Line exceeds 120 characters...

## What's Good
- ✅ Clear function naming
- ✅ Consistent error handling pattern

## Recommendations
1. Move secrets to environment variables
2. Add unit tests for critical paths
3. Set up ESLint in CI
```

## Static Analysis Patterns

Without OpenAI, the bot detects:

**Security:** `eval()`, `exec()`, hardcoded secrets, SQL injection patterns, XSS sinks, unsafe deserialization, `shell=True`

**Bugs:** Bare `except:` clauses, swallowed exceptions, `== None`, debug print statements, hard-coded sleeps

**Style:** Short indentation, lines >120 chars, TODO/FIXME/HACK comments

## Submitting Code for Review

Include your code in a fenced code block in the job description:

```
Please review this Python function for security issues:

```python
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    return db.execute(query)
```
```
