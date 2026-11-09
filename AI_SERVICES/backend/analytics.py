"""Back-office analytics and a lead propensity model trained on smb_leads.csv.

Only features known when a lead is created are used (no leakage from later
funnel stages), so the same model can score live advisor sessions.
"""
from __future__ import annotations

import math
import statistics
from collections import Counter, defaultdict
from functools import lru_cache
from typing import Dict, List

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from . import db
from .data import SEGMENT_CODE, SEGMENTS, leads

STAGES = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"]

# How the digital journey addresses each historical drop reason
DROP_PLAYBOOK = {
    "Unreachable after 3 attempts": ("Digital fixes it", "Send WhatsApp link to the self-serve advisor - no call needed."),
    "Owner had no time for a visit": ("Digital fixes it", "Advisor works 24x7 on the phone in 5 minutes - no visit."),
    "Not interested on first call": ("Nurture", "Drip WhatsApp content by segment; re-target in 30 days."),
    "Price too high": ("Digital fixes it", "Budget-aware bundles + starter plans; transparent toggles."),
    "Locked in with current provider": ("Nurture", "Schedule a reminder before their contract ends."),
    "Wrong or invalid number": ("Data quality", "OTP-verify mobile numbers at capture."),
    "Visit not scheduled by sales": ("Digital fixes it", "Auto-route to a local partner with SLA tracking."),
    "Only wanted a mobile plan": ("Upsell later", "Sell the SIM online; offer bundle after 60 days."),
    "Competitor offered cheaper plan": ("Partly", "Show savings vs current spend and bundle value."),
    "Quote too complex to understand": ("Digital fixes it", "Plain-language quote with one monthly price."),
    "Quote took too long to arrive": ("Digital fixes it", "Instant quote in the advisor (was 3-5 days)."),
    "Decided to wait": ("Nurture", "Save the quote; WhatsApp reminder with one-tap resume."),
    "Installation delayed beyond 21 days": ("Ops", "Tracker + partner SLAs; AirFiber for quick installs."),
    "Missing GST or Udyam document": ("Digital fixes it", "GSTIN/Udyam lookup + guided free Udyam registration."),
    "KYC rejected": ("Digital fixes it", "Instant document checks tell the owner exactly what to fix."),
    "Found paperwork too long": ("Digital fixes it", "GSTIN/Udyam auto-fill + DigiLocker + photo OCR: 4 uploads, no forms."),
    "Authorised signatory not available": ("Digital fixes it", "Remote Aadhaar OTP e-sign from anywhere; no in-person signing."),
    "Customer cancelled before install": ("Ops", "Tracker with dates and installer name; WhatsApp updates at each step."),
    "Document details did not match": ("Digital fixes it", "Registry cross-check shows the exact mismatch before submission."),
    "Site not feasible for fibre": ("Digital fixes it", "Offer 5G AirFiber (plug-and-play, ~2-day install) instead."),
    "First payment failed": ("Digital fixes it", "UPI AutoPay mandate at checkout with retry link on WhatsApp."),
}


def _f(v: str) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def lead_features(r: dict) -> dict:
    return {
        "segment=" + r.get("segment", ""): 1, "tier=" + str(r.get("city_tier", "")): 1,
        "source=" + r.get("lead_source", ""): 1, "lang=" + r.get("preferred_language", ""): 1,
        "turnover=" + r.get("annual_turnover_band", ""): 1, "internet=" + r.get("current_internet", ""): 1,
        "provider=" + r.get("current_provider", ""): 1,
        "has_gstin": 1 if r.get("has_gstin") == "Y" else 0, "has_udyam": 1 if r.get("has_udyam") == "Y" else 0,
        "log_emp": math.log1p(_f(r.get("employee_count"))), "log_sites": math.log1p(_f(r.get("num_sites"))),
        "log_spend": math.log1p(_f(r.get("monthly_telecom_spend_inr"))),
        "n_interest": len([x for x in (r.get("products_of_interest") or "").split(";") if x]),
    }


@lru_cache(maxsize=1)
def model() -> dict:
    rows = leads()
    X = [lead_features(r) for r in rows]
    y = np.array([1 if r["outcome"] == "Activated" else 0 for r in rows])
    vec = DictVectorizer(sparse=False)
    Xm = vec.fit_transform(X)
    Xtr, Xte, ytr, yte = train_test_split(Xm, y, test_size=0.25, random_state=7, stratify=y)
    clf = LogisticRegression(max_iter=2000, C=0.5, class_weight="balanced")
    clf.fit(Xtr, ytr)
    auc = roc_auc_score(yte, clf.predict_proba(Xte)[:, 1])
    clf.fit(Xm, y)
    scores = clf.predict_proba(Xm)[:, 1]
    names = vec.get_feature_names_out()
    coefs = sorted(zip(names, clf.coef_[0]), key=lambda t: -abs(t[1]))
    # Calibrate the displayed score into deciles so the UI shows "top x%" sensibly
    order = np.argsort(scores)
    pct = np.empty_like(scores)
    pct[order] = np.linspace(0, 100, len(scores))
    return {"vec": vec, "clf": clf, "auc": round(float(auc), 3), "scores": scores, "pct": pct,
            "top_features": [{"feature": n, "weight": round(float(w), 2)} for n, w in coefs[:10]],
            "sorted_scores": np.sort(scores)}


def score_profile(features: dict) -> float:
    m = model()
    s = float(m["clf"].predict_proba(m["vec"].transform([features]))[:, 1][0])
    pct = float(np.searchsorted(m["sorted_scores"], s) / len(m["sorted_scores"]) * 100)
    return min(99, int(pct))


def session_features(p: dict) -> dict:
    return lead_features({
        "segment": SEGMENTS.get(p.get("segment", "micro")), "city_tier": p.get("city_tier", 2),
        "lead_source": "Website form", "preferred_language": "Hindi",
        "annual_turnover_band": "", "current_internet": p.get("current_internet", ""), "current_provider": "",
        "has_gstin": "Y" if p.get("has_gstin") else "N", "has_udyam": "Y" if p.get("udyam_hint") else "N",
        "employee_count": p.get("employees", 1), "num_sites": p.get("sites", 1), "monthly_telecom_spend_inr": 0,
        "products_of_interest": ";".join(p.get("needs", [])),
    })


def _route(segment_code: str, value: float) -> str:
    if segment_code in ("multi", "mfg") or value >= 10000:
        return "Field sales (key account)"
    if segment_code == "prof":
        return "Inside sales + local partner"
    return "Local channel partner"


@lru_cache(maxsize=1)
def summary() -> dict:
    rows = leads()
    funnel = []
    prev = None
    for i, st in enumerate(STAGES):
        n = sum(1 for r in rows if STAGES.index(r["stage_reached"]) >= i)
        funnel.append({"stage": st, "count": n, "pct_prev": round(100 * n / prev) if prev else None})
        prev = n
    act = [r for r in rows if r["outcome"] == "Activated"]
    seg = []
    for name in SEGMENTS.values():
        rs = [r for r in rows if r["segment"] == name]
        a = [r for r in rs if r["outcome"] == "Activated"]
        seg.append({
            "segment": name, "code": SEGMENT_CODE[name], "leads": len(rs), "activated": len(a),
            "activation_rate": round(100 * len(a) / len(rs), 1),
            "median_bundle": int(statistics.median([_f(r["monthly_bundle_value_inr"]) for r in a])) if a else 0,
            "churn_6m": round(100 * sum(r["churned_within_6_months"] == "Y" for r in a) / max(1, len(a)), 1),
            "avg_nps": round(statistics.mean([_f(r["nps_score"]) for r in a]), 1) if a else None,
            "cac_per_activation": int(sum(_f(r["acquisition_cost_inr"]) for r in rs) / max(1, len(a))),
            "avg_days": round(statistics.mean([_f(r["days_lead_to_activation"]) for r in a]), 1) if a else None,
        })
    reasons = Counter(r["drop_reason"] for r in rows if r["drop_reason"])
    drop = [{"reason": k, "count": v, "fix": DROP_PLAYBOOK.get(k, ("", ""))[0], "action": DROP_PLAYBOOK.get(k, ("", ""))[1]}
            for k, v in reasons.most_common()]
    fixable = sum(d["count"] for d in drop if d["fix"] == "Digital fixes it")
    src = defaultdict(lambda: [0, 0, 0.0])
    for r in rows:
        s = src[r["lead_source"]]
        s[0] += 1
        s[1] += r["outcome"] == "Activated"
        s[2] += _f(r["acquisition_cost_inr"])
    sources = [{"source": k, "leads": v[0], "activated": v[1], "rate": round(100 * v[1] / v[0], 1),
                "cac": int(v[2] / max(1, v[1]))} for k, v in sorted(src.items(), key=lambda kv: -kv[1][1] / kv[1][0])]
    lang = Counter(r["preferred_language"] for r in rows).most_common()
    g_rate = lambda flag: round(100 * sum(1 for r in rows if r["has_gstin"] == flag and r["outcome"] == "Activated")
                                / max(1, sum(1 for r in rows if r["has_gstin"] == flag)), 1)
    return {
        "kpis": {
            "leads": len(rows), "activated": len(act), "conversion": round(100 * len(act) / len(rows), 1),
            "avg_days": round(statistics.mean([_f(r["days_lead_to_activation"]) for r in act]), 1),
            "avg_followups": round(statistics.mean([_f(r["customer_follow_up_calls"]) for r in act]), 1),
            "cac": int(sum(_f(r["acquisition_cost_inr"]) for r in rows) / len(act)),
            "median_bundle": int(statistics.median([_f(r["monthly_bundle_value_inr"]) for r in act])),
            "churn_6m": round(100 * sum(r["churned_within_6_months"] == "Y" for r in act) / len(act), 1),
            "gstin_rate": g_rate("Y"), "no_gstin_rate": g_rate("N"),
        },
        "funnel": funnel, "segments": seg, "drop_reasons": drop,
        "digitally_fixable": {"count": fixable, "pct": round(100 * fixable / max(1, sum(reasons.values())))},
        "sources": sources, "languages": [{"language": k, "count": v} for k, v in lang],
        "model": {"auc": model()["auc"], "top_features": model()["top_features"]},
    }


def call_list(limit: int = 60, segment: str = "") -> List[dict]:
    """Historical dropped leads worth a call, ranked by propensity."""
    m = model()
    rows = leads()
    skip = {"Wrong or invalid number"}
    out = []
    for r, pct, raw in zip(rows, m["pct"], m["scores"]):
        if r["outcome"] != "Dropped" or r["drop_reason"] in skip:
            continue
        code = SEGMENT_CODE[r["segment"]]
        if segment and code != segment:
            continue
        out.append({
            "lead_id": r["lead_id"], "business": r["business_name"], "type": r["business_type"], "segment": r["segment"],
            "city": r["city"], "language": r["preferred_language"], "stage": r["stage_reached"],
            "drop_reason": r["drop_reason"], "score": min(99, int(pct)), "_raw": float(raw),
            "next_action": DROP_PLAYBOOK.get(r["drop_reason"], ("", "Call back"))[1],
            "route": _route(code, _f(r["monthly_telecom_spend_inr"]) * 2),
            "has_gstin": r["has_gstin"] == "Y",
        })
    out.sort(key=lambda x: -x["_raw"])
    for i, o in enumerate(out):
        o["rank"] = i + 1
        o.pop("_raw")
    return out[:limit]


def _type_label(p: dict) -> str:
    from .i18n import CHIPS
    for row in CHIPS["business_type"]:
        if row[0] == p.get("business_type"):
            return row[1].split(" ", 1)[1] + (f" ({p['business_description']})" if p.get("business_description") else "")
    return p.get("business_type", "Unknown")


def live_leads() -> List[dict]:
    """Advisor sessions that did not convert - handed to sales / partners."""
    out = []
    for s in db.all_sessions():
        p = s.get("profile") or {}
        if s.get("order_id") or "business_type" not in p:
            continue
        stage = s.get("stage", "chat")
        reason = ("Asked for a callback" if s.get("callback") else
                  {"chat": "Left during the advisor chat", "recommended": "Saw the bundle, did not proceed",
                   "quote": "Left at the quote", "kyc": "Stuck at KYC"}.get(stage, stage))
        if s.get("kyc") and s["kyc"].get("status") == "action_required":
            reason = "KYC issue: " + "; ".join(c["title"] for c in s["kyc"]["checks"] if c["status"] == "fail")[:120]
        q = s.get("quote") or {}
        out.append({
            "session_id": s["id"], "business": p.get("business_name") or _type_label(p),
            "segment": SEGMENTS.get(p.get("segment", ""), ""), "city": p.get("city", ""), "stage": stage,
            "reason": reason, "monthly": q.get("monthly"), "score": score_profile(session_features(p)),
            "route": _route(p.get("segment", "micro"), q.get("monthly") or 0),
            "callback": s.get("callback"), "updated": s.get("updated"), "language": s.get("language"),
        })
    out.sort(key=lambda x: (x["callback"] is None, -(x["score"] or 0)))
    return out
