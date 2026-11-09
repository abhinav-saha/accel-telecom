"""Deterministic bundle engine.

The LLM never picks products on its own: it only turns conversation into a
profile and explains the result. Eligibility, dependencies and prices all come
from product_catalogue.csv through the functions below, so every
recommendation is reproducible and always respects the catalogue rules.
"""
from __future__ import annotations

import datetime as dt
from typing import Dict, List, Optional, Tuple

from .config import GST_RATE, TODAY
from .data import catalogue, SEGMENTS

CONNECTIVITY_CORE = ["P01", "P02", "P03", "P04", "P05", "P06"]
WIRED_CORE = ["P01", "P02", "P03", "P05", "P06"]

NEEDS = {
    "payments": ("UPI / card billing at the counter", "काउंटर पर UPI / कार्ड बिलिंग"),
    "whatsapp": ("Reach customers on WhatsApp / SMS", "WhatsApp / SMS से ग्राहकों तक पहुँचें"),
    "cctv": ("CCTV / shop security cameras", "CCTV / दुकान के सुरक्षा कैमरे"),
    "email": ("Business email & shared files", "बिज़नेस ईमेल और फ़ाइलें"),
    "security": ("Protect computers & customer data", "कंप्यूटर और ग्राहक डेटा की सुरक्षा"),
    "uptime": ("Internet must never go down", "इंटरनेट कभी बंद न हो"),
    "calls": ("Handle lots of customer calls", "ग्राहकों की ज़्यादा कॉल संभालना"),
    "website": ("A simple website", "एक आसान वेबसाइट"),
    "wifi": ("Free Wi-Fi for customers", "ग्राहकों के लिए फ्री Wi-Fi"),
    "backup": ("Backup of important files", "ज़रूरी फ़ाइलों का बैकअप"),
    "machines": ("Monitor factory machines", "फ़ैक्टरी मशीनों की निगरानी"),
    "vehicles": ("Track delivery vehicles", "डिलीवरी गाड़ियों की ट्रैकिंग"),
}

TERMS = [12, 24, 36]
# Position inside the catalogue price band for each commitment length:
# shorter commitment -> upper half of the band, longest -> floor price.
TERM_PRICE_POSITION = {12: 0.5, 24: 0.25, 36: 0.0}


# --------------------------------------------------------------------------
# Eligibility
# --------------------------------------------------------------------------

def eligibility_issues(pid: str, profile: dict, bundle_ids: Optional[List[str]] = None) -> List[str]:
    """Human-readable reasons why `pid` cannot be sold to this profile."""
    p = catalogue()[pid]
    issues = []
    tier = profile.get("city_tier") or 2
    emp = profile.get("employees") or 1
    sites = profile.get("sites") or 1
    if tier not in p["tiers"]:
        issues.append(f"{p['name']} is only sold in tier-{'/'.join(map(str, p['tiers']))} cities.")
    if emp < p["min_employees"]:
        issues.append(f"{p['name']} needs at least {p['min_employees']} employees.")
    if sites < p["min_sites"]:
        issues.append(f"{p['name']} needs at least {p['min_sites']} sites.")
    if p["requires_gstin"] and not profile.get("has_gstin"):
        issues.append(f"{p['name']} needs an active GSTIN.")
    if bundle_ids is not None and p["requires_one_of"]:
        if not set(p["requires_one_of"]) & set(bundle_ids):
            names = ", ".join(catalogue()[x]["name"] for x in p["requires_one_of"])
            issues.append(f"{p['name']} works on top of one of: {names}.")
    return issues


def is_eligible(pid: str, profile: dict, bundle_ids: Optional[List[str]] = None) -> bool:
    return not eligibility_issues(pid, profile, bundle_ids)


# --------------------------------------------------------------------------
# Recommendation
# --------------------------------------------------------------------------

def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def _pick_connectivity(profile: dict) -> Tuple[str, str]:
    seg = profile["segment"]
    emp = profile.get("employees") or 1
    sites = profile.get("sites") or 1
    per_site = max(1, round(emp / sites))
    if profile.get("no_fibre"):
        return "P04", "no fibre at your location, so 5G AirFiber plugs in and works within 2 days"
    if seg == "mfg":
        order = [("P06", emp >= 100), ("P05", emp >= 10), ("P03", emp >= 5), ("P02", True)]
        why = {
            "P06": f"a dedicated 100 Mbps line with 99.9% uptime for {emp} people, ERP and machines",
            "P05": "a dedicated 20 Mbps line with 99.5% uptime, so production and ERP never wait",
            "P03": "1 Gbps fibre with priority support for your plant",
            "P02": "fast 300 Mbps fibre for office systems and ERP access",
        }
    elif seg == "multi":
        order = [("P02", per_site >= 8), ("P01", True)]
        why = {
            "P02": f"300 Mbps fibre at each of your {sites} sites keeps billing and CCTV running together",
            "P01": f"100 Mbps fibre at each of your {sites} sites - enough for billing, UPI and CCTV",
        }
    elif seg == "prof":
        order = [("P03", emp >= 20), ("P02", emp >= 6), ("P01", True)]
        why = {
            "P03": f"1 Gbps fibre with priority support for {emp} people on cloud apps and video calls",
            "P02": f"300 Mbps fibre so {emp} people can use cloud software and video calls at once",
            "P01": "100 Mbps unlimited fibre - plenty for a small office",
        }
    else:
        order = [("P01", True)]
        why = {"P01": "100 Mbps unlimited fibre so UPI, card machine and WhatsApp never stall"}
    for pid, cond in order:
        if cond and is_eligible(pid, profile):
            return pid, why[pid]
    for pid in ["P02", "P01", "P04"]:
        if is_eligible(pid, profile):
            return pid, why.get(pid, "reliable business broadband")
    return "P04", "5G AirFiber, plug-and-play"


def recommend(profile: dict) -> dict:
    """Build a bundle from a completed profile."""
    seg = profile["segment"]
    emp = int(profile.get("employees") or 1)
    sites = int(profile.get("sites") or 1)
    needs = set(profile.get("needs") or [])
    cat = catalogue()

    items: List[dict] = []
    excluded: List[dict] = []

    def add(pid: str, qty: int, why: str, core: bool = False, priority: int = 50) -> None:
        bundle_ids = [i["product_id"] for i in items] + [pid]
        issues = eligibility_issues(pid, profile, bundle_ids)
        if issues:
            excluded.append({"product_id": pid, "name": cat[pid]["name"], "why_not": issues[0]})
            return
        items.append({"product_id": pid, "qty": max(1, int(qty)), "why": why, "core": core, "priority": priority})

    # 1. Connectivity at every site
    conn, conn_why = _pick_connectivity(profile)
    add(conn, sites, conn_why[0].upper() + conn_why[1:] + ".", core=True, priority=100)

    # 2. Business mobile lines
    if seg == "micro":
        add("P07", 1, "One business postpaid line for the owner, separate from personal use.", core=True, priority=90)
    elif seg == "prof":
        lines = _clamp(emp // 5, 1, 5)
        plan = "P08" if emp >= 10 else "P07"
        add(plan, lines, f"{lines} business mobile line(s) for the doctor/partner and front desk.", priority=70)
    elif seg == "multi":
        add("P08", sites, f"One business line per site manager ({sites} lines), all on one bill.", priority=70)
    else:
        lines = _clamp(emp // 20, 2, 6)
        add("P08", lines, f"{lines} business lines for owners and supervisors, with roaming for supplier visits.", priority=70)

    # 3. Segment defaults that every activated customer in this segment tends to buy
    if seg == "prof" or "email" in needs:
        users = _clamp(emp, 1, 25) if seg in ("prof", "micro") else _clamp(emp // 4, 3, 25)
        add("P16", users, f"Professional email (name@yourbusiness.in) and shared files for {users} people.", priority=65)
    if seg == "prof" or "security" in needs:
        devices = _clamp(emp, 1, 25) if seg != "mfg" else _clamp(emp // 5, 5, 25)
        add("P20", devices, f"Antivirus and ransomware protection on {devices} computers - client data stays safe.", priority=60)
    if "backup" in needs or (seg == "prof" and "security" in needs):
        add("P17", 1, "1 TB cloud backup so files survive a crashed or stolen laptop.", priority=45)
    if seg == "multi" or "uptime" in needs:
        if conn in WIRED_CORE:
            add("P09", sites, "Automatic 4G/5G backup - if fibre goes down, billing continues.", priority=55)
    if seg == "multi" and sites >= 5:
        add("P10", sites, f"SD-WAN lets you manage all {sites} sites from one screen.", priority=40)
    if "security" in needs and ((emp >= 10 and seg in ("mfg", "multi")) or emp >= 25):
        add("P21", 1 if seg != "multi" else sites, "Managed firewall blocks attacks before they reach your network.", priority=35)

    # 4. Needs-driven products
    if "payments" in needs:
        counters = sites
        add("P19", counters, f"Cloud POS & billing with UPI/card acceptance on {counters} counter(s).", priority=80)
    if "whatsapp" in needs:
        add("P15", 1, "WhatsApp Business API to send your catalogue, offers and order updates.", priority=60)
    if "cctv" in needs:
        cams = {"micro": 2, "prof": 2, "multi": 3 * sites, "mfg": 6}[seg]
        add("P23", int(profile.get("cameras") or cams), "Cloud CCTV - watch your premises live on your phone.", priority=55)
    if "wifi" in needs:
        add("P22", sites, "Secure guest Wi-Fi, kept separate from your billing network.", priority=40)
    if "website" in needs:
        add("P18", 1, "Website + domain + SSL so customers find you on Google.", priority=35)
    if "calls" in needs:
        if seg == "multi":
            add("P13", 1, "One toll-free number customers can call for any of your sites.", priority=45)
        else:
            channels = _clamp(emp // 10, 2, 10)
            add("P12", channels, f"Cloud telephony with {channels} lines so no customer call is missed.", priority=45)
    if "machines" in needs:
        add("P24", int(profile.get("machines") or 10), "IoT sensors alert you before a machine breaks down.", priority=45)
    if "vehicles" in needs:
        add("P25", int(profile.get("vehicles") or 3), "Live GPS tracking for your delivery vehicles.", priority=40)

    for it in items:
        it.setdefault("on", True)

    # 5. Optional add-ons (off by default) the owner can toggle in the quote
    chosen = {i["product_id"] for i in items}
    addons = []
    for pid, p in cat.items():
        if pid in chosen or pid in CONNECTIVITY_CORE:
            continue
        if seg not in p["segments"]:
            continue
        if not is_eligible(pid, profile, list(chosen)):
            continue
        addons.append({"product_id": pid, "qty": _default_qty(pid, profile), "why": p["description"],
                       "core": False, "priority": 10, "on": False})
        # Show at most 4 optional add-ons
        addons = addons[:3]

    # Budget: drop lowest-priority extras until within budget
    budget = profile.get("budget")
    term = default_term([i["product_id"] for i in items])
    trimmed = []
    if budget:
        def total() -> float:
            return price_items([i for i in items if i["on"]], term)["monthly"]
        for it in sorted([i for i in items if not i["core"]], key=lambda x: x["priority"]):
            if total() <= budget:
                break
            if _dependants_on(it["product_id"], items):
                continue
            it["on"] = False
            trimmed.append(it["product_id"])

    alternatives = [pid for pid in CONNECTIVITY_CORE if pid != conn and is_eligible(pid, profile)]
    return {
        "items": items + addons,
        "excluded": excluded,
        "connectivity": conn,
        "connectivity_alternatives": alternatives,
        "term": term,
        "budget_trimmed": trimmed,
    }


def _dependants_on(pid: str, items: List[dict]) -> bool:
    cat = catalogue()
    on_ids = [i["product_id"] for i in items if i["on"]]
    for other in on_ids:
        req = cat[other]["requires_one_of"]
        if pid in req and len(set(req) & set(on_ids) - {pid}) == 0:
            return True
    return False


def _default_qty(pid: str, profile: dict) -> int:
    unit = catalogue()[pid]["unit"]
    sites = profile.get("sites") or 1
    emp = profile.get("employees") or 1
    if unit == "per site":
        return sites
    if unit in ("per user", "per device"):
        return _clamp(emp, 1, 25)
    if unit == "per camera":
        return 2 * sites
    if unit == "per vehicle":
        return 3
    if unit == "per counter":
        return sites
    if unit == "per line":
        return 1
    return 1


# --------------------------------------------------------------------------
# Pricing
# --------------------------------------------------------------------------

def default_term(pids: List[str]) -> int:
    need = max([catalogue()[p]["min_contract"] for p in pids] or [12])
    return next(t for t in TERMS if t >= need)


def allowed_terms(pids: List[str]) -> List[int]:
    need = max([catalogue()[p]["min_contract"] for p in pids] or [1])
    return [t for t in TERMS if t >= need]


def unit_price(pid: str, term: int) -> int:
    p = catalogue()[pid]
    pos = TERM_PRICE_POSITION.get(term, 0.5)
    return int(round(p["price_min"] + (p["price_max"] - p["price_min"]) * pos))


def price_items(items: List[dict], term: int) -> dict:
    lines = []
    monthly = setup = 0
    for it in items:
        p = catalogue()[it["product_id"]]
        up = unit_price(it["product_id"], term)
        amount = up * it["qty"]
        one_time = p["setup_fee"] * it["qty"]
        monthly += amount
        setup += one_time
        lines.append({
            "product_id": it["product_id"], "name": p["name"], "category": p["category"],
            "unit": p["unit"], "qty": it["qty"], "unit_price": up, "monthly": amount,
            "setup_fee": one_time, "install_days": p["install_days"],
        })
    return {"lines": lines, "monthly": monthly, "setup": setup}


def build_quote(items: List[dict], profile: dict, term: Optional[int] = None) -> dict:
    """Price the switched-on items and check every catalogue rule."""
    cat = catalogue()
    on = [i for i in items if i.get("on", True) and i.get("qty", 0) > 0]
    ids = [i["product_id"] for i in on]
    terms = allowed_terms(ids) or [36]
    if term not in terms:
        term = terms[0]
    priced = price_items(on, term)
    issues = []
    for it in on:
        for msg in eligibility_issues(it["product_id"], profile, ids):
            issues.append({"product_id": it["product_id"], "message": msg})
    if not set(ids) & set(CONNECTIVITY_CORE):
        issues.append({"product_id": None, "message": "Add an internet connection - most services need one."})
    gst = round(priced["monthly"] * GST_RATE)
    install_days = max([cat[p]["install_days"] for p in ids] or [0])
    savings = None
    spend = profile.get("current_spend")
    if spend:
        savings = spend - priced["monthly"]
    return {
        "term": term,
        "allowed_terms": terms,
        "lines": priced["lines"],
        "monthly": priced["monthly"],
        "gst": gst,
        "monthly_with_gst": priced["monthly"] + gst,
        "setup": priced["setup"],
        "first_bill": priced["monthly"] + gst + priced["setup"] + round(priced["setup"] * GST_RATE),
        "install_days": install_days,
        "expected_activation": (TODAY + dt.timedelta(days=install_days + 2)).isoformat(),
        "issues": issues,
        "valid": not issues and bool(on),
        "savings_vs_current": savings,
        "contract_value": priced["monthly"] * term + priced["setup"],
    }


def product_card(pid: str) -> dict:
    p = catalogue()[pid]
    return {k: p[k] for k in ("id", "name", "category", "description", "unit", "price_min", "price_max",
                              "setup_fee", "min_contract", "install_days", "requires_gstin", "requires_one_of")}
