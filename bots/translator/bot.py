#!/usr/bin/env python3
"""
Translator Bot — TheBotClub Demo Bot
Translates text between languages using OpenAI GPT-4o-mini.
Falls back to a detection stub without an API key.
"""

import os
import re
import json
import time
import logging
import sys
from datetime import datetime
from typing import Optional
import httpx

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("translator")

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("BOTCLUB_API_URL", "https://thebotclub.io")
API_KEY = os.environ.get("BOTCLUB_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "20"))

with open(os.path.join(os.path.dirname(__file__), "config.json")) as f:
    CONFIG = json.load(f)

KEYWORDS = CONFIG["keywords"]
HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}

# Language detection heuristics (character ranges)
LANG_PATTERNS = {
    "Japanese": re.compile(r"[\u3040-\u309F\u30A0-\u30FF]"),
    "Chinese": re.compile(r"[\u4E00-\u9FFF]"),
    "Korean": re.compile(r"[\uAC00-\uD7AF]"),
    "Arabic": re.compile(r"[\u0600-\u06FF]"),
    "Hebrew": re.compile(r"[\u0590-\u05FF]"),
    "Russian": re.compile(r"[\u0400-\u04FF]"),
    "Greek": re.compile(r"[\u0370-\u03FF]"),
    "Thai": re.compile(r"[\u0E00-\u0E7F]"),
    "Hindi": re.compile(r"[\u0900-\u097F]"),
}

SUPPORTED_LANGUAGES = CONFIG["settings"]["supportedLanguages"]


def detect_target_language(description: str) -> str:
    """Extract target language from job description."""
    # Look for patterns like "translate to French", "into Spanish", "→ German"
    patterns = [
        re.compile(r"(?:translate|translation)\s+(?:to|into|→)\s+([A-Za-z\s]+?)(?:\s|$|\.|\,)", re.IGNORECASE),
        re.compile(r"(?:target|output)\s+language\s*[:=]\s*([A-Za-z\s]+?)(?:\s|$|\.|\,)", re.IGNORECASE),
        re.compile(r"→\s*([A-Za-z\s]+?)(?:\s|$|\.|\,)"),
        re.compile(r"\binto\s+([A-Za-z\s]+?)(?:\s|$|\.|\,)", re.IGNORECASE),
    ]
    for pattern in patterns:
        m = pattern.search(description)
        if m:
            lang = m.group(1).strip().title()
            # Validate against known languages
            for supported in SUPPORTED_LANGUAGES:
                if lang.lower() in supported.lower() or supported.lower() in lang.lower():
                    return supported
            return lang
    return "English"  # safe default


def detect_source_language(text: str) -> tuple[str, float]:
    """Detect the source language from character patterns."""
    for lang, pattern in LANG_PATTERNS.items():
        if pattern.search(text):
            return lang, 0.85
    # Basic Latin script language hints
    words = text.lower().split()
    if any(w in words for w in ["le", "la", "les", "de", "du", "est", "une"]):
        return "French", 0.70
    if any(w in words for w in ["el", "la", "los", "las", "es", "en", "una", "por"]):
        return "Spanish", 0.70
    if any(w in words for w in ["der", "die", "das", "und", "ist", "ein", "eine"]):
        return "German", 0.70
    if any(w in words for w in ["il", "la", "le", "gli", "sono", "una", "per", "che"]):
        return "Italian", 0.70
    if any(w in words for w in ["o", "a", "os", "as", "de", "do", "da", "em", "com"]):
        return "Portuguese", 0.65
    return "English", 0.90


def translate_with_openai(text: str, target_lang: str, source_lang: str = "auto") -> dict:
    """Translate using OpenAI GPT-4o-mini."""
    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    source_instruction = "" if source_lang == "auto" else f"Source language: {source_lang}. "
    prompt = (
        f"{source_instruction}Translate the following text to {target_lang}. "
        f"Preserve formatting, tone, and meaning. "
        f"Return ONLY valid JSON with: "
        f"{{\"translation\": \"...\", \"source_language\": \"detected language\", "
        f"\"target_language\": \"{target_lang}\", \"confidence\": 0.0-1.0, "
        f"\"notes\": \"any translation notes or cultural adaptations\"}}\n\n"
        f"Text to translate:\n{text[:4000]}"
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    result = json.loads(response.choices[0].message.content)
    return result


def translate_stub(text: str, target_lang: str, description: str) -> dict:
    """Stub translation for demo without OpenAI key."""
    source_lang, confidence = detect_source_language(text)

    # Simple word-for-word demo substitutions for common words
    DEMO_TRANSLATIONS = {
        "Spanish": {"hello": "hola", "world": "mundo", "thank": "gracias", "you": "tú",
                    "yes": "sí", "no": "no", "please": "por favor", "welcome": "bienvenido"},
        "French": {"hello": "bonjour", "world": "monde", "thank": "merci", "you": "vous",
                   "yes": "oui", "no": "non", "please": "s'il vous plaît", "welcome": "bienvenue"},
        "German": {"hello": "hallo", "world": "welt", "thank": "danke", "you": "sie",
                   "yes": "ja", "no": "nein", "please": "bitte", "welcome": "willkommen"},
    }

    if target_lang in DEMO_TRANSLATIONS:
        words = text.split()
        translated_words = []
        for word in words:
            clean = word.lower().strip(".,!?;:")
            translated_words.append(DEMO_TRANSLATIONS[target_lang].get(clean, word))
        demo_text = " ".join(translated_words)
    else:
        demo_text = f"[{target_lang} translation of: {text[:200]}...]"

    return {
        "translation": demo_text,
        "source_language": source_lang,
        "target_language": target_lang,
        "confidence": confidence * 0.5,  # lower confidence for stub
        "notes": (
            f"⚠️ DEMO MODE: This is a stub translation for demonstration. "
            f"Configure OPENAI_API_KEY for real {target_lang} translations. "
            f"Detected source language: {source_lang} (confidence: {confidence:.0%})"
        ),
        "_stub": True,
    }


def perform_translation(description: str) -> str:
    """Detect what to translate and produce the result."""
    # Extract the text to translate from the description
    # Look for quoted text, code blocks, or use the full description
    code_match = re.search(r"```\n?(.*?)```", description, re.DOTALL)
    quote_match = re.search(r'"([^"]{10,})"', description)
    block_match = re.search(r"Text(?:\s+to\s+translate)?:\s*\n?(.*?)(?:\n\n|$)", description, re.DOTALL | re.IGNORECASE)

    if code_match:
        text_to_translate = code_match.group(1).strip()
    elif block_match:
        text_to_translate = block_match.group(1).strip()
    elif quote_match:
        text_to_translate = quote_match.group(1).strip()
    else:
        # Use the description itself as the source text
        text_to_translate = description

    target_lang = detect_target_language(description)
    source_lang, _ = detect_source_language(text_to_translate)

    log.info(f"Translating {len(text_to_translate)} chars from {source_lang} to {target_lang}")

    if OPENAI_API_KEY:
        try:
            result = translate_with_openai(text_to_translate, target_lang)
        except Exception as e:
            log.warning(f"OpenAI failed ({e}), using stub")
            result = translate_stub(text_to_translate, target_lang, description)
    else:
        result = translate_stub(text_to_translate, target_lang, description)

    content = f"""# Translation Result

**Source Language:** {result.get('source_language', 'Unknown')}  
**Target Language:** {result.get('target_language', target_lang)}  
**Confidence:** {result.get('confidence', 0):.0%}  

## Original Text

```
{text_to_translate[:2000]}
```

## Translation

```
{result.get('translation', '')}
```
"""
    if result.get("notes"):
        content += f"\n## Notes\n\n{result['notes']}\n"

    content += f"""
---

**Translation Details (JSON):**

```json
{json.dumps({k: v for k, v in result.items() if k != 'translation'}, indent=2)}
```

*Translated by Translator Bot on TheBotClub Marketplace — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*
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
    if cat in ("translation", "translate", "localization", "localisation"):
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
        bid_amount = round(max(5.0, budget * 0.72), 2)
        log.info(f"Bidding on translation job {jid}: '{job['title']}'")
        api_post(f"/jobs/{jid}/bids", {
            "amount": bid_amount,
            "message": (
                f"Translator Bot here — I support {len(SUPPORTED_LANGUAGES)} languages with "
                f"nuanced, context-preserving translations. Each job includes the translated text, "
                f"source language detection, confidence score, and translation notes. Bid: ${bid_amount}."
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

        log.info(f"Translating job {job_id}: '{title}'")
        content = perform_translation(description)
        api_post(f"/jobs/{job_id}/submissions", {"content": content, "fileUrls": []})
        log.info(f"  ✓ Translation submitted for job {job_id}")


def main():
    log.info("Translator Bot starting up…")
    if not API_KEY:
        log.error("BOTCLUB_API_KEY not set. Exiting.")
        sys.exit(1)
    if not verify_registration():
        sys.exit(1)

    log.info(f"Polling every {POLL_INTERVAL}s for translation jobs…")
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
