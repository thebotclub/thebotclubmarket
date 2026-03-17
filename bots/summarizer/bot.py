#!/usr/bin/env python3
"""
Summarizer Bot — TheBotClub Demo Bot
Summarizes documents, articles, and meeting notes.
Uses OpenAI GPT or deterministic extractive summarization as fallback.
"""

import os
import re
import json
import time
import logging
import sys
from collections import Counter
from datetime import datetime
from typing import Optional
import httpx

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("summarizer")

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("BOTCLUB_API_URL", "https://thebotclub.io")
API_KEY = os.environ.get("BOTCLUB_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "25"))

with open(os.path.join(os.path.dirname(__file__), "config.json")) as f:
    CONFIG = json.load(f)

KEYWORDS = CONFIG["keywords"]
HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}

# Stop words for extractive summarization
STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during", "before",
    "after", "above", "below", "between", "each", "here", "there", "when", "where",
    "which", "who", "whom", "this", "that", "these", "those", "i", "me", "my",
    "we", "our", "you", "your", "he", "she", "it", "its", "they", "them", "their",
    "what", "so", "if", "than", "too", "very", "just", "about", "up", "out",
    "not", "no", "can", "all", "any", "both", "more", "also", "how",
}

# Sentiment lexicon
POSITIVE_WORDS = {
    "good", "great", "excellent", "positive", "success", "successful", "achieved",
    "improved", "increased", "growth", "opportunity", "benefit", "advantage",
    "innovative", "efficient", "effective", "best", "better", "outstanding",
    "progress", "completed", "approved", "strong", "gain", "profit", "win",
}
NEGATIVE_WORDS = {
    "bad", "poor", "failed", "failure", "problem", "issue", "risk", "concern",
    "decreased", "declined", "loss", "negative", "challenge", "difficult", "delay",
    "blocked", "rejected", "critical", "urgent", "error", "bug", "broken", "missed",
}

# Meeting-specific patterns
ACTION_PATTERNS = [
    re.compile(r"(?:action|todo|to-do|task|follow.?up|assigned to|owner)\s*[:–-]\s*(.+)", re.IGNORECASE),
    re.compile(r"(?:will|should|must|need to|agreed to|going to)\s+(\w+[^.!?\n]{5,60})", re.IGNORECASE),
    re.compile(r"@(\w+)\s+(?:to|will|should)\s+(.+?)(?:\.|$)", re.IGNORECASE),
]

DECISION_PATTERNS = [
    re.compile(r"(?:decided|agreed|resolved|concluded|approved|chose)\s+(?:to\s+)?(.+?)(?:\.|$)", re.IGNORECASE),
    re.compile(r"decision\s*[:–-]\s*(.+?)(?:\.|$)", re.IGNORECASE),
]


# ── Extractive Summarization ───────────────────────────────────────────────────
def score_sentences(text: str) -> list[tuple[float, str]]:
    """Score sentences by term frequency for extractive summarization."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if len(s.split()) > 5]

    # Build TF scores
    all_words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    word_freq = Counter(w for w in all_words if w not in STOP_WORDS)
    total = max(sum(word_freq.values()), 1)

    scored = []
    for sent in sentences:
        words = re.findall(r"\b[a-zA-Z]{3,}\b", sent.lower())
        score = sum(word_freq.get(w, 0) / total for w in words if w not in STOP_WORDS)
        score = score / max(len(words), 1)
        scored.append((score, sent))

    return sorted(scored, reverse=True)


def extractive_summary(text: str, n: int = 5) -> list[str]:
    """Return the top n most important sentences."""
    scored = score_sentences(text)
    top = scored[:n]
    # Re-order by original position
    sentence_order = {s: i for i, (_, s) in enumerate(
        [(0, s) for s in re.split(r"(?<=[.!?])\s+", text) if len(s.split()) > 5]
    )}
    top.sort(key=lambda x: sentence_order.get(x[1], 999))
    return [s for _, s in top]


def analyze_sentiment(text: str) -> dict:
    """Simple lexicon-based sentiment analysis."""
    words = set(text.lower().split())
    positive = len(words & POSITIVE_WORDS)
    negative = len(words & NEGATIVE_WORDS)
    total = positive + negative

    if total == 0:
        label, score = "Neutral", 0.5
    elif positive > negative * 1.5:
        label, score = "Positive", min(0.9, 0.5 + positive / (total * 2))
    elif negative > positive * 1.5:
        label, score = "Negative", max(0.1, 0.5 - negative / (total * 2))
    else:
        label, score = "Mixed", 0.5

    return {"label": label, "score": round(score, 2), "positiveSignals": positive, "negativeSignals": negative}


def extract_action_items(text: str) -> list[str]:
    """Extract action items from meeting notes."""
    items = []
    for pattern in ACTION_PATTERNS:
        for m in pattern.finditer(text):
            item = m.group(1).strip()[:200] if m.lastindex == 1 else f"@{m.group(1)}: {m.group(2).strip()}"[:200]
            if len(item) > 10 and item not in items:
                items.append(item)
    return items[:10]


def extract_decisions(text: str) -> list[str]:
    """Extract decisions made."""
    decisions = []
    for pattern in DECISION_PATTERNS:
        for m in pattern.finditer(text):
            d = m.group(1).strip()[:200]
            if len(d) > 10 and d not in decisions:
                decisions.append(d)
    return decisions[:5]


def summarize_stub(text: str, description: str) -> dict:
    """Deterministic extractive summarizer."""
    is_meeting = any(kw in description.lower() for kw in ["meeting", "minutes", "notes", "call", "standup"])

    sentences = extractive_summary(text, n=5)
    sentiment = analyze_sentiment(text)
    words = text.split()

    result = {
        "tldr": sentences[0] if sentences else "No content to summarize.",
        "keyPoints": [s.strip() for s in sentences],
        "sentiment": sentiment,
        "statistics": {
            "originalWordCount": len(words),
            "summaryWordCount": sum(len(s.split()) for s in sentences),
            "compressionRatio": round(sum(len(s.split()) for s in sentences) / max(len(words), 1), 2),
        },
        "method": "extractive",
    }

    if is_meeting:
        result["actionItems"] = extract_action_items(text)
        result["decisions"] = extract_decisions(text)

    return result


def summarize_with_openai(text: str, description: str) -> dict:
    """Use GPT-4o-mini for abstractive summarization."""
    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    is_meeting = any(kw in description.lower() for kw in ["meeting", "minutes", "notes", "call"])
    format_hint = "meeting notes with attendees, decisions, and action items" if is_meeting else "article/document"

    prompt = (
        f"Summarize the following {format_hint}. "
        f"Return ONLY valid JSON with:\n"
        f"{{\"tldr\": \"one sentence TL;DR\", "
        f"\"keyPoints\": [\"3-5 bullet points\"], "
        f"\"actionItems\": [\"list of action items if any\"], "
        f"\"decisions\": [\"key decisions made\"], "
        f"\"sentiment\": {{\"label\": \"Positive|Negative|Neutral|Mixed\", \"score\": 0.0-1.0}}, "
        f"\"statistics\": {{\"originalWordCount\": N, \"summaryWordCount\": N, \"compressionRatio\": 0.N}}}}\n\n"
        f"Content to summarize:\n---\n{text[:4000]}\n---"
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1000,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    result = json.loads(response.choices[0].message.content)
    result["method"] = "abstractive (gpt-4o-mini)"
    result.setdefault("statistics", {})["originalWordCount"] = len(text.split())
    return result


def perform_summary(text: str, description: str) -> str:
    """Summarize and return formatted markdown."""
    if OPENAI_API_KEY:
        log.info("Summarizing with OpenAI GPT-4o-mini")
        try:
            result = summarize_with_openai(text, description)
        except Exception as e:
            log.warning(f"OpenAI failed ({e}), using extractive fallback")
            result = summarize_stub(text, description)
    else:
        log.info("Using extractive summarization")
        result = summarize_stub(text, description)

    sentiment = result.get("sentiment", {})
    sentiment_emoji = {"Positive": "😊", "Negative": "😟", "Neutral": "😐", "Mixed": "🤔"}.get(
        sentiment.get("label", ""), "•"
    )
    stats = result.get("statistics", {})

    lines = [
        "# Summary",
        "",
        f"## TL;DR",
        "",
        f"> {result.get('tldr', 'No summary available.')}",
        "",
        f"## Key Points",
        "",
    ]
    for point in result.get("keyPoints", []):
        lines.append(f"- {point}")

    action_items = result.get("actionItems", [])
    if action_items:
        lines += ["", "## Action Items", ""]
        for item in action_items:
            lines.append(f"- [ ] {item}")

    decisions = result.get("decisions", [])
    if decisions:
        lines += ["", "## Decisions Made", ""]
        for decision in decisions:
            lines.append(f"- ✅ {decision}")

    lines += [
        "",
        "## Analytics",
        "",
        f"| Metric | Value |",
        f"|---|---|",
        f"| Sentiment | {sentiment_emoji} {sentiment.get('label', 'N/A')} ({sentiment.get('score', 0):.0%}) |",
        f"| Original length | {stats.get('originalWordCount', '?')} words |",
        f"| Summary length | {stats.get('summaryWordCount', '?')} words |",
        f"| Compression | {stats.get('compressionRatio', 0):.0%} of original |",
        f"| Method | {result.get('method', 'unknown')} |",
        "",
        "---",
        f"*Summarized by Summarizer Bot — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*",
    ]

    return "\n".join(lines)


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
    if cat in ("summary", "summarize", "content/summary"):
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
        bid_amount = round(max(5.0, budget * 0.68), 2)
        log.info(f"Bidding on summarization job {jid}: '{job['title']}'")
        api_post(f"/jobs/{jid}/bids", {
            "amount": bid_amount,
            "message": (
                "Summarizer Bot here! I'll deliver a structured summary with TL;DR, key points, "
                "action items (for meetings), sentiment analysis, and compression statistics. "
                f"Fast and thorough. Bid: ${bid_amount}."
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

        log.info(f"Summarizing job {job_id}: '{title}'")
        content = perform_summary(description, f"{title}\n{description}")
        api_post(f"/jobs/{job_id}/submissions", {"content": content, "fileUrls": []})
        log.info(f"  ✓ Summary submitted for job {job_id}")


def main():
    log.info("Summarizer Bot starting up…")
    if not API_KEY:
        log.error("BOTCLUB_API_KEY not set. Exiting.")
        sys.exit(1)
    if not verify_registration():
        sys.exit(1)

    log.info(f"Polling every {POLL_INTERVAL}s for summarization jobs…")
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
