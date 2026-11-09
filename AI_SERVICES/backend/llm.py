"""Thin client for free-tier LLMs.

Order of preference: Google Gemini (free tier, text + vision) -> Groq (free
tier, OpenAI-compatible) -> no LLM. Every caller has a deterministic fallback,
so the app keeps working without any API key.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
from typing import Optional

import httpx

from . import config

log = logging.getLogger("udyam.llm")
_TIMEOUT = httpx.Timeout(45.0, connect=10.0)


def provider() -> str:
    if config.GEMINI_API_KEY:
        return "gemini"
    if config.GROQ_API_KEY:
        return "groq"
    return "none"


# When the free quota runs out (HTTP 429) we pause LLM calls instead of waiting on
# every request; the app keeps working in rules + local OCR mode meanwhile.
_paused_until = 0.0
MAX_PAUSE_SECONDS = 15 * 60


def status() -> dict:
    p = provider()
    model = {"gemini": config.GEMINI_MODEL, "groq": config.GROQ_MODEL}.get(p, "rules only")
    paused = p != "none" and time.time() < _paused_until
    return {"provider": p, "model": model, "enabled": p != "none" and not paused, "paused": paused,
            "paused_minutes": max(0, round((_paused_until - time.time()) / 60)) if paused else 0}


def _pause_for(resp: httpx.Response) -> None:
    global _paused_until
    delay = 60.0
    try:
        for d in resp.json().get("error", {}).get("details", []):
            if "retryDelay" in d:
                delay = float(str(d["retryDelay"]).rstrip("s"))
    except Exception:
        pass
    retry_after = resp.headers.get("retry-after")
    if retry_after and retry_after.isdigit():
        delay = float(retry_after)
    _paused_until = time.time() + min(max(delay, 30.0), MAX_PAUSE_SECONDS)
    log.warning("LLM free quota hit (HTTP 429); using rules mode for %.0f min", (_paused_until - time.time()) / 60)


def _parse_json(text: str) -> Optional[dict]:
    if not text:
        return None
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _gemini(system: str, user: str, image: Optional[bytes], mime: str) -> Optional[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_MODEL}:generateContent"
    parts = []
    if image is not None:
        parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(image).decode()}})
    parts.append({"text": user})
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3},
    }
    thinking = _thinking_config(config.GEMINI_MODEL)
    if thinking:
        body["generationConfig"]["thinkingConfig"] = thinking
    headers = {"x-goog-api-key": config.GEMINI_API_KEY}
    r = httpx.post(url, json=body, headers=headers, timeout=_TIMEOUT)
    if r.status_code == 400 and thinking and "thinking" in r.text.lower():
        # Model does not accept this thinking setting: retry with the model's default.
        body["generationConfig"].pop("thinkingConfig", None)
        r = httpx.post(url, json=body, headers=headers, timeout=_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _thinking_config(model: str) -> Optional[dict]:
    """Keep replies fast: extraction and short explanations need little or no reasoning."""
    m = model.lower()
    if "lite" in m:
        return None
    if "2.5" in m:
        return None if "pro" in m else {"thinkingBudget": 0}
    if m.startswith("gemini-3"):
        return {"thinkingLevel": "minimal"}
    return None


def _groq(system: str, user: str, image: Optional[bytes], mime: str) -> Optional[str]:
    content: object = user
    model = config.GROQ_MODEL
    if image is not None:
        model = config.GROQ_VISION_MODEL
        data_url = f"data:{mime};base64,{base64.b64encode(image).decode()}"
        content = [{"type": "text", "text": user}, {"type": "image_url", "image_url": {"url": data_url}}]
    body = {
        "model": model,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}],
    }
    r = httpx.post("https://api.groq.com/openai/v1/chat/completions", json=body,
                   headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"}, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def ask_json(system: str, user: str, image: Optional[bytes] = None, mime: str = "image/png") -> Optional[dict]:
    """Return parsed JSON from the configured LLM, or None on any failure."""
    p = provider()
    if not status()["enabled"]:
        return None
    try:
        text = _gemini(system, user, image, mime) if p == "gemini" else _groq(system, user, image, mime)
        return _parse_json(text or "")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            _pause_for(exc.response)
        else:
            log.warning("LLM call failed (%s): HTTP %s", p, exc.response.status_code)
        return None
    except Exception as exc:  # network, timeout, safety block... fall back silently
        log.warning("LLM call failed (%s): %s", p, type(exc).__name__)
        return None
