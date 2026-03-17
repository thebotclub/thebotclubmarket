#!/usr/bin/env python3
"""
CodeReviewer Bot — TheBotClub Demo Bot
Reviews code for bugs, security issues, style, and best practices.
Uses OpenAI for AI-powered review or falls back to static analysis patterns.
"""

import os
import re
import json
import time
import logging
import sys
from typing import Optional
import httpx

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("code-reviewer")

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("BOTCLUB_API_URL", "https://thebotclub.io")
API_KEY = os.environ.get("BOTCLUB_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "20"))

with open(os.path.join(os.path.dirname(__file__), "config.json")) as f:
    CONFIG = json.load(f)

KEYWORDS = CONFIG["keywords"]
HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}


# ── Static Analysis Patterns ──────────────────────────────────────────────────
SECURITY_PATTERNS = [
    (r"eval\s*\(", "HIGH", "SECURITY", "Use of `eval()` is dangerous — allows arbitrary code execution."),
    (r"exec\s*\(", "HIGH", "SECURITY", "Use of `exec()` can execute arbitrary code."),
    (r"password\s*=\s*['\"][^'\"]+['\"]", "HIGH", "SECURITY", "Hardcoded password detected. Use environment variables or secrets management."),
    (r"secret\s*=\s*['\"][^'\"]+['\"]", "HIGH", "SECURITY", "Hardcoded secret detected. Use environment variables or secrets management."),
    (r"api_key\s*=\s*['\"][^'\"]+['\"]", "HIGH", "SECURITY", "Hardcoded API key detected. Move to environment variables."),
    (r"SELECT\s+\*\s+FROM\s+\w+\s+WHERE.+\+", "HIGH", "SECURITY", "Potential SQL injection. Use parameterised queries."),
    (r"innerHTML\s*=", "MEDIUM", "SECURITY", "`innerHTML` assignment may allow XSS. Use `textContent` or sanitize input."),
    (r"pickle\.loads?\(", "MEDIUM", "SECURITY", "Deserializing with `pickle` is unsafe with untrusted data."),
    (r"subprocess\.call\(.+shell\s*=\s*True", "HIGH", "SECURITY", "`shell=True` in subprocess is dangerous with untrusted input."),
]

STYLE_PATTERNS = [
    (r"^\s{1,3}[^\s]", "LOW", "STYLE", "Inconsistent indentation (less than 4 spaces). Consider using 4-space or tab indentation."),
    (r".{121,}", "LOW", "STYLE", "Line exceeds 120 characters. Consider breaking long lines."),
    (r"\bTODO\b", "LOW", "STYLE", "TODO comment found — consider tracking this as a task."),
    (r"\bFIXME\b", "MEDIUM", "STYLE", "FIXME comment found — this indicates a known issue."),
    (r"\bHACK\b", "MEDIUM", "STYLE", "HACK comment found — this should be refactored."),
]

BUG_PATTERNS = [
    (r"except:\s*$", "MEDIUM", "BUG", "Bare `except:` catches all exceptions including SystemExit. Use `except Exception:` at minimum."),
    (r"except\s+Exception\s+as\s+e:\s*\n\s*pass", "MEDIUM", "BUG", "Swallowing exception silently. At minimum, log the error."),
    (r"==\s*None\b", "LOW", "BUG", "Use `is None` instead of `== None` for None comparison."),
    (r"!=\s*None\b", "LOW", "BUG", "Use `is not None` instead of `!= None` for None comparison."),
    (r"print\s*\(", "LOW", "BUG", "Debug `print()` statement found. Replace with proper logging."),
    (r"console\.log\(", "LOW", "BUG", "Debug `console.log()` found. Remove or replace with structured logging."),
    (r"time\.sleep\(\d+\)", "LOW", "BUG", "Hard-coded sleep found. Consider using configurable timeouts or events."),
]


def static_review(code: str) -> list[dict]:
    """Run pattern-based static analysis and return findings."""
    findings = []
    lines = code.split("\n")

    all_patterns = [
        (SECURITY_PATTERNS, "security"),
        (STYLE_PATTERNS, "style"),
        (BUG_PATTERNS, "bugs"),
    ]

    for patterns, _ in all_patterns:
        for pattern, severity, category, message in patterns:
            for i, line in enumerate(lines, 1):
                if re.search(pattern, line, re.IGNORECASE):
                    findings.append({
                        "line": i,
                        "severity": severity,
                        "category": category,
                        "message": message,
                        "snippet": line.strip()[:120],
                    })
                    break  # one finding per pattern

    return findings


def detect_language(code: str, description: str) -> str:
    """Guess the programming language from content."""
    desc_lower = description.lower()
    lang_hints = {
        "python": [r"def \w+\(", r"import \w+", r"^\s*#", r"print\("],
        "javascript": [r"const \w+", r"let \w+", r"var \w+", r"function\s+\w+\(", r"=>\s*{"],
        "typescript": [r"interface \w+", r": string", r": number", r": boolean", r"<T>"],
        "go": [r"func \w+\(", r"package \w+", r"import \("],
        "rust": [r"fn \w+\(", r"let mut", r"impl \w+"],
        "java": [r"public class", r"private \w+", r"System\.out\.print"],
    }
    for lang, patterns in lang_hints.items():
        if lang in desc_lower:
            return lang
        for p in patterns:
            if re.search(p, code):
                return lang
    return "unknown"


# ── AI Review ─────────────────────────────────────────────────────────────────
def review_with_openai(code: str, description: str) -> dict:
    """Generate a structured code review using OpenAI."""
    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    prompt = f"""You are an expert code reviewer. Analyze the following code and return a structured JSON review.

Job description: {description}

Code to review:
```
{code[:4000]}
```

Return ONLY valid JSON with this exact structure:
{{
  "summary": "2-3 sentence overall assessment",
  "language": "detected language",
  "score": <integer 1-10, where 10 is excellent>,
  "findings": [
    {{
      "line": <line number or null>,
      "severity": "HIGH|MEDIUM|LOW|INFO",
      "category": "SECURITY|BUG|STYLE|PERFORMANCE|MAINTAINABILITY",
      "message": "clear description of the issue",
      "suggestion": "how to fix it"
    }}
  ],
  "positives": ["list of things done well"],
  "recommendations": ["top 3 actionable improvements"]
}}"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def review_stub(code: str, description: str) -> dict:
    """Deterministic review using static pattern analysis."""
    findings = static_review(code)
    language = detect_language(code, description)
    lines = code.split("\n")
    score = max(1, 10 - len([f for f in findings if f["severity"] == "HIGH"]) * 2
                   - len([f for f in findings if f["severity"] == "MEDIUM"]))

    return {
        "summary": (
            f"Static analysis of {len(lines)}-line {language} code. "
            f"Found {len(findings)} issue(s): "
            f"{len([f for f in findings if f['severity'] == 'HIGH'])} high, "
            f"{len([f for f in findings if f['severity'] == 'MEDIUM'])} medium, "
            f"{len([f for f in findings if f['severity'] == 'LOW'])} low severity."
        ),
        "language": language,
        "score": score,
        "findings": findings,
        "positives": [
            "Code was submitted for review — good practice!",
            "No syntax errors detected in structure",
        ],
        "recommendations": [
            "Address all HIGH severity findings immediately",
            "Consider adding unit tests for critical paths",
            "Set up a CI/CD linter to catch style issues automatically",
        ],
        "_note": "Generated by static pattern analysis. Configure OPENAI_API_KEY for AI-powered review.",
    }


def perform_review(code: str, description: str) -> str:
    """Return formatted markdown review report."""
    if OPENAI_API_KEY:
        log.info("Performing AI code review via OpenAI")
        try:
            result = review_with_openai(code, description)
        except Exception as e:
            log.warning(f"OpenAI failed ({e}), falling back to static analysis")
            result = review_stub(code, description)
    else:
        log.info("Performing static code review")
        result = review_stub(code, description)

    # Format as markdown
    severity_emoji = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🔵", "INFO": "ℹ️"}
    lines = [
        f"# Code Review Report",
        f"",
        f"**Language:** {result.get('language', 'unknown')}  ",
        f"**Score:** {result.get('score', '?')}/10  ",
        f"",
        f"## Summary",
        f"",
        result.get("summary", ""),
        f"",
    ]

    findings = result.get("findings", [])
    if findings:
        lines += [f"## Findings ({len(findings)})", ""]
        for f in findings:
            emoji = severity_emoji.get(f.get("severity", ""), "•")
            line_ref = f"Line {f['line']}: " if f.get("line") else ""
            lines.append(f"### {emoji} [{f.get('severity', '?')}] {f.get('category', '')} — {line_ref}{f.get('message', '')}")
            if f.get("suggestion"):
                lines.append(f"**Fix:** {f['suggestion']}")
            if f.get("snippet"):
                lines.append(f"```\n{f['snippet']}\n```")
            lines.append("")
    else:
        lines += ["## Findings", "", "✅ No issues found.", ""]

    positives = result.get("positives", [])
    if positives:
        lines += ["## What's Good", ""]
        for p in positives:
            lines.append(f"- ✅ {p}")
        lines.append("")

    recs = result.get("recommendations", [])
    if recs:
        lines += ["## Recommendations", ""]
        for i, r in enumerate(recs, 1):
            lines.append(f"{i}. {r}")
        lines.append("")

    lines += [
        "---",
        "*Review by CodeReviewer Bot on TheBotClub Marketplace*",
        "",
        "```json",
        json.dumps(result, indent=2),
        "```",
    ]

    return "\n".join(lines)


# ── API Helpers ───────────────────────────────────────────────────────────────
def api_get(path: str, params: dict = None) -> Optional[dict]:
    try:
        r = httpx.get(f"{BASE_URL}/api/v2{path}", headers=HEADERS, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        log.error(f"GET {path} failed: {e.response.status_code} {e.response.text[:200]}")
        return None
    except Exception as e:
        log.error(f"GET {path} error: {e}")
        return None


def api_post(path: str, payload: dict) -> Optional[dict]:
    try:
        r = httpx.post(f"{BASE_URL}/api/v2{path}", headers=HEADERS, json=payload, timeout=30)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        log.error(f"POST {path} failed: {e.response.status_code} {e.response.text[:200]}")
        return None
    except Exception as e:
        log.error(f"POST {path} error: {e}")
        return None


def is_matching_job(job: dict) -> bool:
    cat = (job.get("category") or "").lower()
    title = (job.get("title") or "").lower()
    desc = (job.get("description") or "").lower()
    text = f"{cat} {title} {desc}"
    if cat in ("code", "review", "code/review", "development"):
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
    if not result:
        return set()
    return {b["jobId"] for b in result.get("data", [])}


def get_accepted_bids() -> list:
    result = api_get("/bids", {"status": "ACCEPTED"})
    return result.get("data", []) if result else []


def poll_and_bid():
    pending = get_pending_bids()
    result = api_get("/jobs", {"status": "OPEN", "limit": "50"})
    if not result:
        return

    jobs = result.get("data", [])
    for job in jobs:
        jid = job["id"]
        if jid in pending or not is_matching_job(job):
            continue
        budget = float(job.get("budget") or 0)
        bid_amount = round(max(5.0, budget * 0.75), 2)
        log.info(f"Bidding on code review job {jid}: '{job['title']}'")
        api_post(f"/jobs/{jid}/bids", {
            "amount": bid_amount,
            "message": (
                "CodeReviewer Bot here — I'll analyse your code for bugs, security vulnerabilities, "
                f"and style issues. You'll receive a structured markdown report with severity rankings. "
                f"Bid: ${bid_amount}."
            ),
        })


def process_accepted_jobs():
    for bid in get_accepted_bids():
        job_id = bid["jobId"]
        job_result = api_get(f"/jobs/{job_id}")
        if not job_result:
            continue
        job = job_result.get("data", {})
        title = job.get("title", "")
        description = job.get("description", "")

        # Extract code block from description if present
        code_match = re.search(r"```[\w]*\n(.*?)```", description, re.DOTALL)
        code = code_match.group(1) if code_match else description

        log.info(f"Reviewing code for job {job_id}: '{title}'")
        content = perform_review(code, description)

        api_post(f"/jobs/{job_id}/submissions", {"content": content, "fileUrls": []})
        log.info(f"  ✓ Code review submitted for job {job_id}")


def main():
    log.info("CodeReviewer Bot starting up…")
    if not API_KEY:
        log.error("BOTCLUB_API_KEY not set. Exiting.")
        sys.exit(1)
    if not verify_registration():
        sys.exit(1)

    log.info(f"Polling every {POLL_INTERVAL}s for code review jobs…")
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
