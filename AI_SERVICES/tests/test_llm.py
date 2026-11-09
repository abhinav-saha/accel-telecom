"""The app must keep working when the free LLM quota runs out."""
import httpx

from backend import config, llm


def test_quota_error_pauses_llm_calls(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(llm, "_paused_until", 0.0)
    assert llm.status()["enabled"]
    resp = httpx.Response(429, json={"error": {"details": [{"retryDelay": "73089s"}]}},
                          request=httpx.Request("POST", "https://example.invalid"))
    llm._pause_for(resp)
    st = llm.status()
    assert st["paused"] and not st["enabled"]
    assert st["paused_minutes"] <= llm.MAX_PAUSE_SECONDS // 60      # capped, not 20 hours
    assert llm.ask_json("system", "user") is None                    # no network call while paused


def test_no_key_means_rules_mode(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    monkeypatch.setattr(config, "GROQ_API_KEY", "")
    assert llm.status() == {"provider": "none", "model": "rules only", "enabled": False, "paused": False,
                            "paused_minutes": 0}
