"""Conversational advisor: slot-filling dialogue + deterministic bundle engine.

Works in three layers so it never breaks during a demo:
1. Quick-reply chips (always available, every language).
2. Rule-based understanding of free text (numbers, cities, Hindi/Hinglish
   keywords, GSTIN auto-fill from the mock registry).
3. Optional LLM (Gemini/Groq free tier) for open-ended text in any language,
   questions about products and natural explanations.
"""
from __future__ import annotations

import json
import re
import time
import uuid
from typing import Dict, List, Optional, Tuple

from . import db, llm, rules
from .data import catalogue, city_states, city_tiers, udyam_registry
from .i18n import (BUSINESS_TYPE_SEGMENT, CHIPS, DONE_LABEL, LANGUAGE_NAMES_EN, NEED_LABELS, NEEDS_BY_SEGMENT,
                   label, q)
from .registry import city_from_address, lookup_gstin, mask_gstin

SLOTS = ["business_type", "city", "employees", "sites", "has_gstin", "current_internet", "needs", "budget"]

# ------------------------------------------------------------------ keyword NLU

BT_KEYWORDS = {
    "kirana": ["kirana", "grocery", "general store", "provision", "supermarket", "किराना", "किराणा", "राशन"],
    "pharmacy": ["pharmacy", "chemist", "medical store", "medical shop", "दवा", "मेडिकल", "फार्मेसी"],
    "salon": ["salon", "parlour", "parlor", "beauty", "spa", "barber", "सैलून", "पार्लर", "सलून"],
    "restaurant": ["restaurant", "cafe", "café", "bakery", "dhaba", "sweet", "mithai", "hotel", "रेस्टोरेंट", "होटल",
                   "बेकरी", "ढाबा", "मिठाई", "कैफ़े"],
    "clinic": ["clinic", "doctor", "dental", "dentist", "diagnostic", "lab", "physio", "hospital", "nursing",
               "क्लिनिक", "डॉक्टर", "दवाखाना", "लैब", "हॉस्पिटल"],
    "office": ["ca firm", "chartered", "accountant", "law", "lawyer", "advocate", "legal", "consult", "office",
               "agency", "architect", "real estate", "insurance", "travel", "वकील", "ऑफिस", "दफ्तर", "सीए"],
    "coaching": ["coaching", "tuition", "institute", "school", "classes", "academy", "कोचिंग", "ट्यूशन", "स्कूल", "क्लास"],
    "chain": ["chain", "outlets", "branches", "franchise", "चेन", "ब्रांच", "शाखा"],
    "factory": ["factory", "manufactur", "plant", "workshop", "moulding", "molding", "packaging", "textile",
                "auto part", "printing press", "processing", "फैक्ट्री", "कारखाना", "फ़ैक्टरी", "मैन्युफैक्चरिंग", "कारखान"],
    "shop": ["shop", "store", "boutique", "mobile repair", "hardware", "stationery", "optician", "electronics",
             "दुकान", "स्टोर"],
}

NEED_KEYWORDS = {
    "payments": ["upi", "pos", "billing", "card", "payment", "बिलिंग", "पेमेंट", "बिल"],
    "whatsapp": ["whatsapp", "sms", "message", "catalog", "व्हाट्सएप", "मैसेज"],
    "cctv": ["cctv", "camera", "कैमरा", "सीसीटीवी", "कॅमेरा", "security camera"],
    "email": ["email", "e-mail", "mail", "office suite", "ईमेल", "मेल"],
    "security": ["security", "virus", "hack", "data safe", "firewall", "सुरक्षा", "वायरस"],
    "uptime": ["never down", "uptime", "backup internet", "failover", "always on", "बंद न", "down"],
    "calls": ["calls", "call centre", "helpline", "toll", "telephony", "कॉल"],
    "website": ["website", "online presence", "domain", "वेबसाइट"],
    "wifi": ["wifi", "wi-fi", "guest", "वाईफाई", "वाई-फाई"],
    "backup": ["backup", "बैकअप"],
    "machines": ["machine", "iot", "sensor", "मशीन"],
    "vehicles": ["vehicle", "fleet", "delivery", "truck", "van", "gaadi", "गाड़ी", "गाडी", "वाहन"],
}

CITY_ALIASES = {
    "दिल्ली": "Delhi", "new delhi": "Delhi", "मुंबई": "Mumbai", "bombay": "Mumbai", "बेंगलुरु": "Bengaluru",
    "bangalore": "Bengaluru", "बंगलौर": "Bengaluru", "ಬೆಂಗಳೂರು": "Bengaluru", "हैदराबाद": "Hyderabad",
    "హైదరాబాద్": "Hyderabad", "चेन्नई": "Chennai", "madras": "Chennai", "சென்னை": "Chennai", "पुणे": "Pune",
    "poona": "Pune", "कोलकाता": "Kolkata", "calcutta": "Kolkata", "কলকাতা": "Kolkata", "वडोदरा": "Vadodara",
    "baroda": "Vadodara", "कोच्चि": "Kochi", "cochin": "Kochi", "കൊച്ചി": "Kochi", "अहमदाबाद": "Ahmedabad",
    "અમદાવાદ": "Ahmedabad", "लुधियाना": "Ludhiana", "ਲੁਧਿਆਣਾ": "Ludhiana", "इंदौर": "Indore", "नागपुर": "Nagpur",
    "लखनऊ": "Lucknow", "भोपाल": "Bhopal", "जयपुर": "Jaipur", "मैसूर": "Mysuru", "mysore": "Mysuru",
    "कोयंबटूर": "Coimbatore", "கோயம்புத்தூர்": "Coimbatore", "नासिक": "Nashik", "नाशिक": "Nashik",
    "विशाखापत्तनम": "Visakhapatnam", "vizag": "Visakhapatnam", "విశాఖపట్నం": "Visakhapatnam", "पटना": "Patna",
    "सूरत": "Surat", "સુરત": "Surat",
}
INTERNET_KEYWORDS = {
    "Mobile hotspot": ["hotspot", "mobile data", "phone", "हॉटस्पॉट", "मोबाइल"],
    "Home broadband": ["home broadband", "home wifi", "घर"],
    "Business broadband": ["business broadband", "broadband", "fibre", "fiber", "ब्रॉडबैंड"],
    "Leased line": ["leased", "ill", "dedicated"],
    "Mixed per site": ["different", "mixed", "alag"],
    "No fibre": ["no fibre", "no fiber", "fibre nahi", "फ़ाइबर नहीं"],
    "None": ["nothing", "none", "kuch nahi", "कुछ नहीं", "no internet"],
}
YES = {"yes", "y", "haan", "han", "ha", "हाँ", "हां", "हा", "हो", "होय", "ji", "जी", "yes we have", "registered", "ஆம்", "అవును", "ಹೌದು", "હા", "হ্যাঁ", "ਹਾਂ", "അതെ"}
NO = {"no", "n", "nahi", "nahin", "nai", "नहीं", "नही", "नाही", "not registered", "இல்லை", "లేదు", "ಇಲ್ಲ", "ના", "না", "ਨਹੀਂ", "ഇല്ല"}

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _numbers(text: str) -> List[int]:
    t = text.translate(_DEVANAGARI_DIGITS).replace(",", "")
    out = []
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(k|हज़ार|हजार|thousand|lakh|लाख)?", t, re.I):
        v = float(m.group(1))
        unit = (m.group(2) or "").lower()
        if unit in ("k", "हज़ार", "हजार", "thousand"):
            v *= 1000
        elif unit in ("lakh", "लाख"):
            v *= 100000
        out.append(int(v))
    return out


def _find_keyword(text: str, table: Dict[str, List[str]]) -> Optional[str]:
    t = text.lower()
    for key, words in table.items():
        if any(w in t for w in words):
            return key
    return None


def rule_extract(text: str, expecting: Optional[str]) -> dict:
    t = text.lower().strip()
    up: dict = {}
    nums = _numbers(t)
    # explicit patterns anywhere in the sentence
    m = re.search(r"(\d+)\s*(?:[^\d\s,.]+\s+){0,2}?(people|employees|staff|log|लोग|कर्मचारी|workers|members|जण|लोक)", t.translate(_DEVANAGARI_DIGITS))
    if m:
        up["employees"] = int(m.group(1))
    m = re.search(r"(\d+)\s*(?:[^\d\s,.]+\s+){0,2}?(shops|shop|branches|branch|outlets|outlet|stores|store|sites|locations|clinics|dukan|dukaan|dukane|branches|दुकान|ब्रांच|शाखा|दुकाने)", t.translate(_DEVANAGARI_DIGITS))
    if m:
        up["sites"] = int(m.group(1))
    bt = _find_keyword(t, BT_KEYWORDS)
    if bt:
        up["business_type"] = bt
    for alias, city in CITY_ALIASES.items():
        if alias in t:
            up["city"] = city
    for city in city_tiers():
        if city.lower() in t:
            up["city"] = city
    needs = [k for k, words in NEED_KEYWORDS.items() if any(w in t for w in words)]
    if needs:
        up["needs"] = needs
    if "gst" in t:
        if any(w in t.split() for w in ("no", "nahi", "nahin", "नहीं", "नाही")) or "not" in t:
            up["has_gstin"] = False
        else:
            up["has_gstin"] = True
    if expecting == "current_internet":
        ci = _find_keyword(t, INTERNET_KEYWORDS)
        if ci:
            up["current_internet"] = ci
    # bare answers to the current question
    words = set(re.findall(r"[\wऀ-෿]+", t))
    if expecting == "has_gstin" and "has_gstin" not in up and "?" not in t:
        if words & YES:
            up["has_gstin"] = True
        elif words & NO:
            up["has_gstin"] = False
    if expecting in ("employees", "sites") and expecting not in up and nums:
        up[expecting] = nums[0]
    if expecting == "budget":
        if nums:
            up["budget"] = nums[-1]
        elif any(w in t for w in ("no budget", "koi bhi", "any", "कोई", "flexible", "no fixed")):
            up["budget"] = 0
    if expecting == "city" and "city" not in up and t and len(t) < 30 and not nums:
        up["city"] = text.strip().title()
    if expecting == "business_type" and "business_type" not in up and len(t) > 2:
        up["business_type"] = "shop"
    return up


# ------------------------------------------------------------------ LLM NLU

def _catalogue_brief() -> str:
    lines = []
    for p in catalogue().values():
        lines.append(f"{p['id']} {p['name']} ({p['category']}): {p['description']}; Rs {p['price_min']}-{p['price_max']} "
                     f"{p['unit']}/month; setup Rs {p['setup_fee']}; min {p['min_contract']} months; install ~{p['install_days']} days"
                     + ("; needs GSTIN" if p["requires_gstin"] else ""))
    return "\n".join(lines)


def llm_extract(text: str, session: dict) -> Tuple[dict, str]:
    lang = LANGUAGE_NAMES_EN.get(session["language"], "English")
    system = (
        "You are the language-understanding module of 'Udyam Saathi', Accel Business's advisor for small Indian businesses. "
        "Users write in any Indian language, Hinglish or English. Extract ONLY what the user actually said. "
        "Return JSON: {\"updates\": {\"business_type\": one of [kirana, pharmacy, salon, restaurant, shop, clinic, office, "
        "coaching, chain, factory] or null, \"business_description\": short English description or null, \"city\": city "
        "name in English or null, \"employees\": int or null, \"sites\": int or null, \"has_gstin\": true/false/null, "
        "\"gstin\": 15-char GSTIN or null, \"current_internet\": one of [Mobile hotspot, Home broadband, Business broadband, "
        "Leased line, Mixed per site, No fibre, None] or null, \"needs\": subset of [payments, whatsapp, cctv, email, security, "
        "uptime, calls, website, wifi, backup, machines, vehicles] or [], \"budget\": monthly rupees as int (0 = no fixed "
        f"budget) or null}}, \"evidence\": {{\"<field>\": \"the exact words copied from user_message that state it\"}}, "
        "\"answer\": string}. Fill a field ONLY if the user stated it in this message; never infer or assume "
        "(e.g. do not set has_gstin unless GST is mentioned). Every filled field needs evidence. "
        f"If the message contains a question, put a short, friendly answer in {lang} in 'answer' (2-3 sentences, plain "
        "words, no product codes, prices from the catalogue only); otherwise answer is ''. Do not ask the next question "
        "yourself. Never promise discounts or products that are not in the catalogue.\n\nCATALOGUE:\n" + _catalogue_brief()
    )
    user = json.dumps({"current_question": session.get("asked"), "known_profile": _public_profile(session["profile"]),
                       "user_message": text}, ensure_ascii=False)
    resp = llm.ask_json(system, user)
    if not resp:
        return {}, ""
    evidence = resp.get("evidence") if isinstance(resp.get("evidence"), dict) else {}
    norm = lambda s: re.sub(r"\s+", " ", str(s)).strip().lower()
    message = norm(text)
    ups = {}
    for k, v in (resp.get("updates") or {}).items():
        if v in (None, "", []):
            continue
        ev = norm(evidence.get(k, ""))
        # Guard against hallucinated fields: keep a value only if the user's own words back it up,
        # or it answers the question we just asked.
        if (ev and ev in message) or k == session.get("asked") or (k == "business_description" and "business_type" in evidence):
            ups[k] = v
    return ups, (resp.get("answer") or "").strip()


# ------------------------------------------------------------------ session helpers

def _public_profile(p: dict) -> dict:
    return {k: v for k, v in p.items() if k not in ("gstin",)}


def new_session(language: str, channel: str = "web") -> dict:
    sid = uuid.uuid4().hex[:12]
    s = {
        "id": sid, "created": time.time(), "language": language if language in DONE_LABEL else "en",
        "channel": channel, "profile": {"needs": []}, "asked": None, "stage": "chat",
        "transcript": [], "recommendation": None, "quote": None, "kyc": None, "order_id": None, "callback": None,
    }
    greet = q("greeting", s["language"])
    s["transcript"].append({"role": "bot", "text": greet, "ts": time.time()})
    resp = _ask_next(s, [greet])
    db.save_session(sid, s)
    return resp


def _apply(profile: dict, ups: dict, notes: List[str], lang: str) -> None:
    if ups.get("gstin"):
        _apply_gstin(profile, ups["gstin"], notes, lang)
    if ups.get("business_type") in BUSINESS_TYPE_SEGMENT:
        profile["business_type"] = ups["business_type"]
        if ups.get("business_description"):
            profile["business_description"] = ups["business_description"]
    if ups.get("city"):
        city = str(ups["city"]).strip()
        known = {c.lower(): c for c in city_tiers()}
        city = CITY_ALIASES.get(city.lower(), known.get(city.lower(), city))
        profile["city"] = city
        profile["city_tier"] = city_tiers().get(city, 2)
        profile["city_known"] = city in city_tiers()
        profile["state"] = city_states().get(city, profile.get("state", ""))
    for k in ("employees", "sites"):
        if ups.get(k) is not None:
            try:
                v = int(ups[k])
                if 0 < v < 100000:
                    profile[k] = v
            except (TypeError, ValueError):
                pass
    if ups.get("has_gstin") is not None and "gstin" not in profile:
        profile["has_gstin"] = bool(ups["has_gstin"])
    if ups.get("current_internet"):
        profile["current_internet"] = ups["current_internet"]
        profile["no_fibre"] = ups["current_internet"] == "No fibre"
    if ups.get("needs"):
        valid = [n for n in ups["needs"] if n in rules.NEEDS]
        profile["needs"] = sorted(set(profile.get("needs", [])) | set(valid))
    if ups.get("needs_done"):
        profile["needs_done"] = True
    if ups.get("budget") is not None:
        try:
            b = int(ups["budget"])
            profile["budget"] = b if b > 0 else None
            profile["budget_set"] = True
        except (TypeError, ValueError):
            pass
    _refresh_segment(profile)


def _refresh_segment(p: dict) -> None:
    if "business_type" not in p:
        return
    seg = BUSINESS_TYPE_SEGMENT[p["business_type"]]
    if p.get("sites", 1) >= 3 and seg != "mfg":
        seg = "multi"
    p["segment"] = seg


def _apply_gstin(profile: dict, raw: str, notes: List[str], lang: str) -> None:
    r = lookup_gstin(raw)
    if not r["found"]:
        err = r["format"]["errors"][0] if r["format"]["errors"] else "not found in the GST registry."
        notes.append(q("gst_bad", lang, error=err))
        return
    city = city_from_address(r["address"])
    profile.update({
        "gstin": r["gstin"], "gstin_masked": mask_gstin(r["gstin"]), "has_gstin": r["active"],
        "gst_status": r["status"], "business_name": r["trade_name"], "legal_name": r["legal_name"],
        "constitution": r["constitution"], "state": r["state"],
    })
    if city:
        profile["city"] = city
        profile["city_tier"] = city_tiers().get(city, 2)
        profile["city_known"] = city in city_tiers()
    # Udyam registry tells us the line of business -> business type
    for u in udyam_registry().values():
        if u["enterprise_name"] == r["trade_name"] and u["city"] == city:
            desc = u["nic_description"]
            bt = _find_keyword(desc, BT_KEYWORDS)
            if bt:
                profile["business_type"] = bt
                profile["business_description"] = desc
                if "chain" in desc.lower() or "group" in desc.lower():
                    profile["business_type"] = "chain"
            profile["udyam_hint"] = u["udyam_number"]
            break
    notes.append(q("gst_found", lang, name=r["trade_name"], city=city, status=r["status"]))
    if not r["active"]:
        notes.append(q("gst_inactive", lang, status=r["status"].upper()))


def _next_slot(p: dict) -> Optional[str]:
    if "business_type" not in p:
        return "business_type"
    if "city" not in p:
        return "city"
    if "employees" not in p:
        return "employees"
    if "sites" not in p:
        return "sites"
    if "has_gstin" not in p:
        return "has_gstin"
    if "current_internet" not in p:
        return "current_internet"
    if not p.get("needs_done"):
        return "needs"
    if not p.get("budget_set"):
        return "budget"
    return None


def _chips(slot: str, s: dict) -> Tuple[List[dict], bool]:
    lang = s["language"]
    p = s["profile"]
    if slot == "city":
        cities = list(city_tiers().keys())
        return [{"value": c, "label": c} for c in cities], False
    if slot == "needs":
        seg = p.get("segment", "micro")
        order = NEEDS_BY_SEGMENT[seg] + [n for n in NEED_LABELS if n not in NEEDS_BY_SEGMENT[seg]]
        chips = [{"value": n, "label": label((n,) + NEED_LABELS[n], lang), "selected": n in p.get("needs", [])}
                 for n in order]
        return chips, True
    rows = CHIPS.get(slot, [])
    if slot == "current_internet" and p.get("sites", 1) < 2:
        rows = [r for r in rows if r[0] != "Mixed per site"]
    if slot == "sites" and p.get("business_type") == "chain":
        rows = [r for r in rows if int(r[0]) >= 2]
    return [{"value": r[0], "label": label(r, lang)} for r in rows], False


def _ask_next(s: dict, pre: List[str]) -> dict:
    slot = _next_slot(s["profile"])
    s["asked"] = slot
    if slot is None:
        return _finish(s, pre)
    question = q(slot, s["language"])
    s["transcript"].append({"role": "bot", "text": question, "ts": time.time()})
    chips, multi = _chips(slot, s)
    filled = len([x for x in SLOTS if x != slot and SLOTS.index(x) < SLOTS.index(slot)])
    return {"session_id": s["id"], "messages": pre + [question], "chips": chips, "multi": multi,
            "done_label": DONE_LABEL[s["language"]], "slot": slot, "progress": round(100 * filled / len(SLOTS)),
            "profile": _public_profile(s["profile"]), "stage": s["stage"]}


# ------------------------------------------------------------------ recommendation + explanation
def _explain(s: dict, rec: dict, quote: dict) -> Tuple[str, Dict[str, str]]:
    p = s["profile"]
    lang = s["language"]
    cat = catalogue()
    on_items = [i for i in rec["items"] if i["on"]]

    if llm.status()["enabled"]:
        system = (
            "You are Udyam Saathi, a friendly advisor for Indian small-business owners. "
            f"Explain a recommended telecom/IT bundle in {LANGUAGE_NAMES_EN.get(lang, 'English')} "
            "using very simple words (Class-8 reading level). Never use product codes. "
            "Never change products, quantities or prices. Do not mention prices or quote totals; "
            "the system will insert the exact price separately. "
            "Return JSON {\"summary\": \"3-4 sentences explaining why this bundle fits this business, "
            "one bill + one support number\", \"reasons\": {\"<product_id>\": "
            "\"one short sentence why this product helps THIS business\"}}."
        )

        payload = {
            "business": {
                k: p.get(k)
                for k in (
                    "business_description",
                    "business_type",
                    "city",
                    "employees",
                    "sites",
                    "has_gstin",
                    "current_internet",
                    "needs",
                    "budget"
                )
            },
            "items": [
                {
                    "product_id": i["product_id"],
                    "name": cat[i["product_id"]]["name"],
                    "qty": i["qty"],
                    "engine_reason": i["why"]
                }
                for i in on_items
            ],
            "not_possible": rec["excluded"],
            "monthly_price_inr": quote["monthly"],
            "gst_inr": quote["gst"],
            "one_time_setup_inr": quote["setup"],
            "contract_months": quote["term"],
            "ready_in_days": quote["install_days"],
        }

        resp = llm.ask_json(system, json.dumps(payload, ensure_ascii=False))

        if resp and resp.get("summary"):
            reasons = {
                k: v
                for k, v in (resp.get("reasons") or {}).items()
                if k in cat and isinstance(v, str)
            }

            price_text = (
                f"Monthly price: ₹{quote['monthly']:,}/month "
                f"+ GST (₹{quote['gst']:,})."
            )

            return f"{resp['summary']} {price_text}", reasons

    # Deterministic fallback when LLM is unavailable
    summary = (
        f"This bundle is designed for your {p.get('business_type', 'business')} "
        f"and covers your needs with {len(on_items)} selected products. "
        "Everything comes under one bill with one support number. "
        f"Monthly price: ₹{quote['monthly']:,}/month "
        f"+ GST (₹{quote['gst']:,})."
    )

    reasons = {
        i["product_id"]: i["why"]
        for i in on_items
    }

    return summary, reasons


          
    # deterministic fallback
    biz = p.get("business_name") or _type_label(p, lang)
    n = len(on_items)
    price = f"₹{quote['monthly']:,}"
    if lang == "hi":
        summary = (f"{p.get('city', '')} में {p.get('employees', 1)} लोगों वाले {biz} के लिए यह बंडल {n} ज़रूरतें पूरी करता है - "
                   f"सिर्फ़ {price}/माह (+GST), एक बिल और एक सपोर्ट नंबर। सब कुछ लगभग {quote['install_days']} दिन में चालू।")
    elif lang == "mr":
        summary = (f"{p.get('city', '')} मधील {p.get('employees', 1)} लोकांच्या {biz} साठी हे बंडल {n} गरजा पूर्ण करते - "
                   f"फक्त {price}/महिना (+GST), एक बिल आणि एक सपोर्ट नंबर. सर्व काही सुमारे {quote['install_days']} दिवसांत सुरू.")
    else:
        summary = (f"For {biz} in {p.get('city', 'your city')} with {p.get('employees', 1)} people, this bundle covers "
                   f"{n} needs for {price}/month (+GST) - one bill, one support number, everything live in about "
                   f"{quote['install_days']} days.")
    if rec["excluded"]:
        x = rec["excluded"][0]
        summary += {"hi": f" ध्यान दें: {x['why_not']}", "mr": f" टीप: {x['why_not']}"}.get(lang, f" Note: {x['why_not']}")
    return summary, {}


def _type_label(p: dict, lang: str) -> str:
    for row in CHIPS["business_type"]:
        if row[0] == p.get("business_type"):
            return label(row, lang).split(" ", 1)[1]
    return {"hi": "आपके बिज़नेस", "mr": "तुमच्या व्यवसाया"}.get(lang, "your business")


def _finish(s: dict, pre: List[str]) -> dict:
    p = s["profile"]
    rec = rules.recommend(p)
    quote = rules.build_quote(rec["items"], p, rec["term"])
    summary, reasons = _explain(s, rec, quote)
    for it in rec["items"]:
        if it["product_id"] in reasons:
            it["why"] = reasons[it["product_id"]]
    s["recommendation"] = rec
    s["quote"] = quote
    s["stage"] = "recommended"
    ready = q("ready", s["language"])
    s["transcript"].append({"role": "bot", "text": ready + " " + summary, "ts": time.time()})
    return {"session_id": s["id"], "messages": pre + [ready, summary], "chips": [], "multi": False, "slot": None,
            "progress": 100, "profile": _public_profile(p), "stage": s["stage"],
            "recommendation": decorate(rec), "quote": quote}


def decorate(rec: dict) -> dict:
    cat = catalogue()
    out = dict(rec)
    out["items"] = [dict(i, **{"name": cat[i["product_id"]]["name"], "category": cat[i["product_id"]]["category"],
                               "unit": cat[i["product_id"]]["unit"], "description": cat[i["product_id"]]["description"],
                               "requires": cat[i["product_id"]]["requires_one_of"]}) for i in rec["items"]]
    out["connectivity_options"] = [{"product_id": pid, "name": cat[pid]["name"], "description": cat[pid]["description"]}
                                   for pid in [rec["connectivity"]] + rec["connectivity_alternatives"]]
    return out


# ------------------------------------------------------------------ refinement after the recommendation

REMOVE_WORDS = ("remove", "hata", "हटा", "nahi chahiye", "नहीं चाहिए", "don't need", "dont need", "without", "बिना", "drop")
ADD_WORDS = ("add", "jod", "जोड़", "chahiye", "चाहिए", "include", "also", "भी")
CHEAP_WORDS = ("cheap", "sasta", "सस्ता", "kam", "कम", "budget", "less", "expensive", "महंगा", "mehenga", "costly")


def _product_by_words(t: str) -> Optional[str]:
    hints = {"P23": ["cctv", "camera", "कैमरा"], "P15": ["whatsapp", "व्हाट्सएप"], "P19": ["pos", "billing", "बिलिंग"],
             "P18": ["website", "वेबसाइट"], "P16": ["email", "ईमेल"], "P20": ["antivirus", "endpoint"],
             "P22": ["wifi", "wi-fi"], "P09": ["backup internet", "failover"], "P17": ["cloud backup", "backup"],
             "P12": ["telephony", "sip"], "P13": ["toll"], "P14": ["sms"], "P25": ["fleet", "vehicle", "gaadi"],
             "P24": ["machine"], "P21": ["firewall"], "P11": ["static ip"], "P10": ["sd-wan", "sdwan"],
             "P07": ["sim", "postpaid", "mobile"], "P08": ["postpaid 599"]}
    for pid, ws in hints.items():
        if any(w in t for w in ws):
            return pid
    return None


def refine(s: dict, text: str) -> dict:
    rec = s["recommendation"]
    p = s["profile"]
    t = text.lower()
    answer = ""
    actions: List[dict] = []
    if llm.status()["enabled"]:
        system = ("You help a small-business owner adjust a recommended bundle. Return JSON {\"answer\": short reply in "
                  f"{LANGUAGE_NAMES_EN.get(s['language'], 'English')} (2 sentences, no product codes), \"actions\": [{{\"op\": "
                  "\"add|remove|qty\", \"product_id\": \"Pxx\", \"qty\": int}}], \"budget\": int or null}. Only use product ids "
                  "from the catalogue. If the user just asks a question, return actions [] and answer it.\n\nCATALOGUE:\n"
                  + _catalogue_brief())
        cur = [{"product_id": i["product_id"], "name": catalogue()[i["product_id"]]["name"], "qty": i["qty"], "on": i["on"]}
               for i in rec["items"]]
        resp = llm.ask_json(system, json.dumps({"bundle": cur, "profile": _public_profile(p), "message": text},
                                               ensure_ascii=False))
        if resp:
            answer = resp.get("answer") or ""
            actions = [a for a in resp.get("actions") or [] if isinstance(a, dict) and a.get("product_id") in catalogue()]
            if resp.get("budget"):
                p["budget"] = int(resp["budget"])
    if not answer and not actions:
        pid = _product_by_words(t)
        if pid and any(w in t for w in REMOVE_WORDS):
            actions = [{"op": "remove", "product_id": pid}]
        elif pid and any(w in t for w in ADD_WORDS):
            nums = _numbers(t)
            actions = [{"op": "add", "product_id": pid, "qty": nums[0] if nums else None}]
        elif any(w in t for w in CHEAP_WORDS):
            cur = rules.build_quote(rec["items"], p, s["quote"]["term"])["monthly"]
            p["budget"] = int(cur * 0.8)
            rec2 = rules.recommend(p)
            rec.clear()
            rec.update(rec2)
            answer = {"hi": f"ठीक है, मैंने कुछ ऐड-ऑन बंद करके बंडल को ₹{p['budget']:,}/माह के आसपास कर दिया है। आप इन्हें फिर से चालू कर सकते हैं।",
                      "mr": f"ठीक आहे, काही ॲड-ऑन बंद करून बंडल ₹{p['budget']:,}/महिना जवळ आणले आहे."}.get(
                s["language"], f"Done - I switched off a few extras to bring it close to ₹{p['budget']:,}/month. You can switch them back on anytime.")
        else:
            answer = {"hi": "आप नीचे दिए टॉगल से प्रोडक्ट जोड़ या हटा सकते हैं, या 'CCTV हटा दो' / 'सस्ता करो' जैसा लिखें।",
                      "mr": "खालील टॉगलने उत्पादने जोडा/काढा, किंवा 'CCTV काढा' / 'स्वस्त करा' असे लिहा."}.get(
                s["language"], "You can toggle products below, or type things like 'remove CCTV', 'add 4 cameras' or 'make it cheaper'.")
    cat = catalogue()
    ids = [i["product_id"] for i in rec["items"]]
    for a in actions:
        pid = a["product_id"]
        if a["op"] == "remove":
            for i in rec["items"]:
                if i["product_id"] == pid:
                    i["on"] = False
        elif a["op"] in ("add", "qty"):
            qty = a.get("qty") or rules._default_qty(pid, p)
            if pid in ids:
                for i in rec["items"]:
                    if i["product_id"] == pid:
                        i["on"] = True
                        i["qty"] = int(qty)
            else:
                rec["items"].append({"product_id": pid, "qty": int(qty), "why": cat[pid]["description"], "core": False,
                                     "priority": 20, "on": True})
        if not answer:
            answer = {"hi": "बंडल अपडेट कर दिया है।", "mr": "बंडल अपडेट केले आहे."}.get(s["language"], "Updated your bundle.")
    quote = rules.build_quote(rec["items"], p, s["quote"]["term"] if s.get("quote") else None)
    s["quote"] = quote
    s["transcript"].append({"role": "bot", "text": answer, "ts": time.time()})
    return {"session_id": s["id"], "messages": [answer], "chips": [], "multi": False, "slot": None, "progress": 100,
            "profile": _public_profile(p), "stage": s["stage"], "recommendation": decorate(rec), "quote": quote}


# ------------------------------------------------------------------ main entry point

def _chip_update(slot: str, value: str) -> dict:
    """Validate a quick-reply value for the current question; unknown values are ignored, never crash."""
    value = (value or "").strip()
    if slot == "needs":
        needs = [v for v in value.split(",") if v in rules.NEEDS]
        return {"needs": needs, "needs_done": True} if needs or value == "" else {}
    if slot in ("employees", "sites", "budget"):
        return {slot: int(value)} if value.isdigit() else {}
    if slot == "has_gstin":
        return {"has_gstin": value == "yes"} if value in ("yes", "no") else {}
    if slot == "current_internet":
        return {slot: value} if value in {r[0] for r in CHIPS["current_internet"]} else {}
    if slot == "business_type":
        return {slot: value} if value in BUSINESS_TYPE_SEGMENT else {}
    if slot == "city":
        return {slot: value[:40]} if value else {}
    return {}


def handle(sid: str, text: Optional[str] = None, value: Optional[str] = None) -> dict:
    s = db.load_session(sid)
    if not s:
        raise KeyError("session not found")
    lang = s["language"]
    slot = s.get("asked")
    notes: List[str] = []
    shown = text if text is not None else value
    s["transcript"].append({"role": "user", "text": (shown or "")[:500], "ts": time.time()})

    if s["stage"] != "chat" and text:
        resp = refine(s, text)
        db.save_session(sid, s)
        return resp

    ups: dict = {}
    if value is not None and slot:
        ups = _chip_update(slot, value)
        if slot == "needs" and ups:
            s["profile"]["needs"] = []
    elif text:
        gm = re.search(r"\b[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][0-9A-Za-z][Zz][0-9A-Za-z]\b", text)
        if gm:
            ups["gstin"] = gm.group(0).upper()
        if llm.status()["enabled"]:
            l_ups, answer = llm_extract(text, s)
            ups = {**rule_extract(text, slot), **l_ups, **ups}
            if answer:
                notes.append(answer)
        else:
            ups = {**rule_extract(text, slot), **ups}
        if slot == "needs" and (ups.get("needs") or re.search(r"\b(done|bas|that's all|ho gaya|हो गया|बस)\b", text.lower())):
            ups["needs_done"] = True
    before = json.dumps(s["profile"], sort_keys=True)
    _apply(s["profile"], ups, notes, lang)
    if json.dumps(s["profile"], sort_keys=True) == before and not notes:
        notes.append(q("didnt_get", lang))
    for n in notes:
        s["transcript"].append({"role": "bot", "text": n, "ts": time.time()})
    resp = _ask_next(s, notes)
    db.save_session(sid, s)
    return resp


def update_quote(sid: str, items: List[dict], term: Optional[int]) -> dict:
    s = db.load_session(sid)
    if not s or not s.get("recommendation"):
        raise KeyError("session not found")
    rec = s["recommendation"]
    by_id = {i["product_id"]: i for i in rec["items"]}
    for it in items:
        pid = it.get("product_id")
        if pid not in catalogue():
            continue
        qty = max(0, min(500, int(it.get("qty") or 0)))
        if pid in by_id:
            by_id[pid]["on"] = bool(it.get("on", True)) and qty > 0
            if qty:
                by_id[pid]["qty"] = qty
        else:
            rec["items"].append({"product_id": pid, "qty": max(1, qty), "why": catalogue()[pid]["description"],
                                 "core": False, "priority": 20, "on": bool(it.get("on", True))})
    quote = rules.build_quote(rec["items"], s["profile"], term)
    s["quote"] = quote
    s["stage"] = "quote" if s["stage"] in ("recommended", "quote") else s["stage"]
    db.save_session(sid, s)
    return {"recommendation": decorate(rec), "quote": quote}


def switch_connectivity(sid: str, pid: str) -> dict:
    s = db.load_session(sid)
    rec = s["recommendation"]
    p = s["profile"]
    if pid not in rules.CONNECTIVITY_CORE or not rules.is_eligible(pid, p):
        raise ValueError("Not available for this business")
    sites = p.get("sites", 1)
    rec["items"] = [i for i in rec["items"] if i["product_id"] not in rules.CONNECTIVITY_CORE]
    rec["items"].insert(0, {"product_id": pid, "qty": sites, "why": catalogue()[pid]["description"], "core": True,
                            "priority": 100, "on": True})
    old = rec["connectivity"]
    rec["connectivity_alternatives"] = [x for x in [old] + rec["connectivity_alternatives"] if x != pid]
    rec["connectivity"] = pid
    # dependants that no longer have a valid base are switched off
    ids = [i["product_id"] for i in rec["items"] if i["on"]]
    for i in rec["items"]:
        req = catalogue()[i["product_id"]]["requires_one_of"]
        if req and not set(req) & set(ids):
            i["on"] = False
    quote = rules.build_quote(rec["items"], p, s["quote"]["term"] if s.get("quote") else None)
    s["quote"] = quote
    db.save_session(sid, s)
    return {"recommendation": decorate(rec), "quote": quote}
