#!/usr/bin/env python3
"""
DataExtractor Bot — TheBotClub Demo Bot
Extracts structured data from unstructured text using regex patterns and optional AI.
Returns clean JSON with entities, contacts, dates, URLs, and custom fields.
"""

import os
import re
import json
import time
import logging
import sys
from datetime import datetime
from typing import Optional, Any
import httpx

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("data-extractor")

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("BOTCLUB_API_URL", "https://thebotclub.io")
API_KEY = os.environ.get("BOTCLUB_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "25"))

with open(os.path.join(os.path.dirname(__file__), "config.json")) as f:
    CONFIG = json.load(f)

KEYWORDS = CONFIG["keywords"]
HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}


# ── Extraction Patterns ───────────────────────────────────────────────────────
PATTERNS = {
    "emails": re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"),
    "phones": re.compile(r"(?:\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}"),
    "urls": re.compile(r"https?://[^\s<>\"']+"),
    "dates": re.compile(
        r"\b(?:\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{4}[/\-\.]\d{2}[/\-\.]\d{2}"
        r"|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
        r"|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
        re.IGNORECASE,
    ),
    "prices": re.compile(r"(?:USD?|EUR?|GBP?|AUD?)?\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:USD|EUR|GBP|AUD|dollars?|euros?|pounds?))?"),
    "percentages": re.compile(r"\b\d+(?:\.\d+)?%"),
    "ip_addresses": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "social_handles": re.compile(r"@[a-zA-Z0-9_]{1,50}"),
    "hashtags": re.compile(r"#[a-zA-Z][a-zA-Z0-9_]{1,49}"),
}

# Key-value patterns
KV_PATTERNS = [
    re.compile(r"^([A-Za-z][A-Za-z\s]{1,30})\s*[:=]\s*(.+)$", re.MULTILINE),
    re.compile(r"<([^>]+)>([^<]+)</\1>"),  # XML/HTML tags
]

# Named entity patterns (simple NLP)
PERSON_INDICATORS = re.compile(
    r"\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|CEO|CTO|CFO|Director|Manager|President)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
    re.MULTILINE,
)
COMPANY_INDICATORS = re.compile(
    r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Inc\.?|LLC|Ltd\.?|Corp\.?|GmbH|Pty\.?|Co\.?)\b"
)
LOCATION_INDICATORS = re.compile(
    r"\bin\s+([A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*)\b"
)


def extract_structured(text: str) -> dict[str, Any]:
    """Run deterministic extraction on raw text."""
    result: dict[str, Any] = {
        "_meta": {
            "extractedAt": datetime.utcnow().isoformat() + "Z",
            "inputLength": len(text),
            "method": "pattern-based",
        }
    }

    # Pattern-based fields
    for field, pattern in PATTERNS.items():
        matches = list(set(pattern.findall(text)))
        if matches:
            result[field] = matches[:50]  # cap at 50 per field

    # Key-value pairs
    kv = {}
    for pattern in KV_PATTERNS:
        for match in pattern.finditer(text):
            key = match.group(1).strip().lower().replace(" ", "_")
            value = match.group(2).strip()
            if len(key) <= 40 and len(value) <= 500:
                kv[key] = value
    if kv:
        result["key_value_pairs"] = kv

    # Named entities
    persons = list({m.group(1) for m in PERSON_INDICATORS.finditer(text)})
    companies = list({m.group(1) for m in COMPANY_INDICATORS.finditer(text)})
    locations = list({m.group(1) for m in LOCATION_INDICATORS.finditer(text)})

    entities: dict[str, list] = {}
    if persons:
        entities["persons"] = persons
    if companies:
        entities["organizations"] = companies
    if locations:
        entities["locations"] = locations
    if entities:
        result["named_entities"] = entities

    # Table detection (markdown or pipe-delimited)
    table_rows = re.findall(r"^\|(.+)\|$", text, re.MULTILINE)
    if len(table_rows) >= 2:
        headers = [h.strip() for h in table_rows[0].split("|") if h.strip()]
        rows = []
        for row_str in table_rows[2:]:  # skip header separator
            cells = [c.strip() for c in row_str.split("|") if c.strip()]
            if cells:
                rows.append(dict(zip(headers, cells)))
        if rows:
            result["table"] = {"headers": headers, "rows": rows}

    # Word/sentence statistics
    words = text.split()
    sentences = re.split(r"[.!?]+", text)
    result["statistics"] = {
        "wordCount": len(words),
        "sentenceCount": len([s for s in sentences if s.strip()]),
        "characterCount": len(text),
        "uniqueWords": len(set(w.lower() for w in words)),
    }

    return result


def extract_with_openai(text: str, description: str) -> dict:
    """Use OpenAI to extract structured data per the job's specific requirements."""
    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    prompt = f"""You are a data extraction specialist. Extract structured data from the text below.

Job requirements: {description}

Text to extract from:
---
{text[:3000]}
---

Return ONLY a valid JSON object with the extracted data. Use descriptive keys. 
Include a "_meta" key with: extractedAt (ISO timestamp), method: "openai-gpt4o-mini", confidence: 0-1."""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def perform_extraction(text: str, description: str) -> str:
    """Extract structured data and return as formatted markdown + JSON."""
    if OPENAI_API_KEY:
        log.info("Extracting with OpenAI")
        try:
            data = extract_with_openai(text, description)
        except Exception as e:
            log.warning(f"OpenAI failed ({e}), using pattern extraction")
            data = extract_structured(text)
    else:
        data = extract_structured(text)

    summary_lines = []
    for key, value in data.items():
        if key.startswith("_"):
            continue
        if isinstance(value, list):
            summary_lines.append(f"- **{key}**: {len(value)} item(s) found")
        elif isinstance(value, dict):
            summary_lines.append(f"- **{key}**: {len(value)} field(s)")
        else:
            summary_lines.append(f"- **{key}**: {str(value)[:100]}")

    content = f"""# Data Extraction Results

## Summary

{chr(10).join(summary_lines) if summary_lines else "- No structured data found in input"}

## Extracted Data (JSON)

```json
{json.dumps(data, indent=2, default=str)}
```

---
*Extracted by DataExtractor Bot on TheBotClub Marketplace*
"""
    return content


# ── API Helpers ───────────────────────────────────────────────────────────────
def api_get(path: str, params: dict = None) -> Optional[dict]:
    try:
        r = httpx.get(f"{BASE_URL}/api/v2{path}", headers=HEADERS, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error(f"GET {path} error: {e}")
        return None


def api_post(path: str, payload: dict) -> Optional[dict]:
    try:
        r = httpx.post(f"{BASE_URL}/api/v2{path}", headers=HEADERS, json=payload, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error(f"POST {path} error: {e}")
        return None


def is_matching_job(job: dict) -> bool:
    cat = (job.get("category") or "").lower()
    text = f"{cat} {job.get('title', '')} {job.get('description', '')}".lower()
    if cat in ("data", "extraction", "data/extraction", "scraping"):
        return True
    return any(kw in text for kw in KEYWORDS)


def verify_registration() -> bool:
    result = api_get("/me")
    if not result or not result.get("data"):
        log.error("Failed to verify bot registration.")
        return False
    bot = result["data"]
    log.info(f"Registered as: {bot['name']} (id={bot['id']})")
    return bot.get("isActive", False)


def get_pending_bids() -> set:
    result = api_get("/bids", {"status": "PENDING"})
    return {b["jobId"] for b in result.get("data", [])} if result else set()


def get_accepted_bids() -> list:
    result = api_get("/bids", {"status": "ACCEPTED"})
    return result.get("data", []) if result else []


def poll_and_bid():
    pending = get_pending_bids()
    result = api_get("/jobs", {"status": "OPEN", "limit": "50"})
    if not result:
        return
    for job in result.get("data", []):
        jid = job["id"]
        if jid in pending or not is_matching_job(job):
            continue
        budget = float(job.get("budget") or 0)
        bid_amount = round(max(5.0, budget * 0.70), 2)
        log.info(f"Bidding on data extraction job {jid}: '{job['title']}'")
        api_post(f"/jobs/{jid}/bids", {
            "amount": bid_amount,
            "message": (
                "DataExtractor Bot — I'll parse your text and return clean structured JSON. "
                f"I extract emails, phones, URLs, dates, prices, entities, tables, and custom fields. "
                f"Fast turnaround. Bid: ${bid_amount}."
            ),
        })


def process_accepted_jobs():
    for bid in get_accepted_bids():
        job_id = bid["jobId"]
        job_result = api_get(f"/jobs/{job_id}")
        if not job_result:
            continue
        job = job_result.get("data", {})
        description = job.get("description", "")
        title = job.get("title", "")

        log.info(f"Extracting data for job {job_id}: '{title}'")
        content = perform_extraction(description, f"{title}\n{description}")
        api_post(f"/jobs/{job_id}/submissions", {"content": content, "fileUrls": []})
        log.info(f"  ✓ Data extraction submitted for job {job_id}")


def main():
    log.info("DataExtractor Bot starting up…")
    if not API_KEY:
        log.error("BOTCLUB_API_KEY not set. Exiting.")
        sys.exit(1)
    if not verify_registration():
        sys.exit(1)

    log.info(f"Polling every {POLL_INTERVAL}s for data extraction jobs…")
    while True:
        try:
            poll_and_bid()
            process_accepted_jobs()
        except KeyboardInterrupt:
            log.info("Shutting down.")
            break
        except Exception as e:
            log.error(f"Main loop error: {e}", exc_info=True)
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
