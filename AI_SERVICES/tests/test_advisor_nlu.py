"""Rule-based understanding of free text (works without any LLM key)."""
from backend.advisor import rule_extract


def test_english_sentence_fills_several_slots():
    up = rule_extract("I have 3 pharmacy shops in Pune, around 15 staff, GST registered", "business_type")
    assert up["business_type"] == "pharmacy"
    assert up["sites"] == 3 and up["employees"] == 15
    assert up["city"] == "Pune" and up["has_gstin"] is True


def test_hinglish_sentence():
    up = rule_extract("hamari 5 kirana dukan hai Patna mein 12 log", "business_type")
    assert up["business_type"] == "kirana" and up["sites"] == 5 and up["employees"] == 12 and up["city"] == "Patna"


def test_devanagari_sentence():
    up = rule_extract("मेरे क्लिनिक में 8 लोग काम करते हैं, दिल्ली", "business_type")
    assert up["business_type"] == "clinic" and up["employees"] == 8 and up["city"] == "Delhi"


def test_bare_answers_to_current_question():
    assert rule_extract("haan", "has_gstin")["has_gstin"] is True
    assert rule_extract("नहीं", "has_gstin")["has_gstin"] is False
    assert rule_extract("12", "employees")["employees"] == 12
    assert rule_extract("5k", "budget")["budget"] == 5000


def test_a_question_is_not_read_as_yes():
    # "kya hota hai" contains "hai" - it must not count as "yes, I have GST"
    assert "has_gstin" not in rule_extract("static IP kya hota hai aur kya mujhe chahiye?", "has_gstin")


def test_invalid_quick_reply_value_is_ignored_not_a_crash():
    from backend import advisor
    sid = advisor.new_session("en")["session_id"]
    r = advisor.handle(sid, value="not-a-real-option")
    assert r["slot"] == "business_type"          # still asking the same question
    r = advisor.handle(sid, value="clinic")
    assert r["slot"] == "city"
