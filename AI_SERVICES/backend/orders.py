"""Orders and the self-serve tracker.

Expected dates come from each product's typical_install_days. The tracker
also shows who is doing the installation: a local channel partner or field
engineer, so the digital journey feeds work to the existing channel instead
of competing with it.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import random
import re
import time
from typing import List, Optional

from . import db
from .config import TODAY
from .data import catalogue
from .registry import mask_phone

PARTNER_PREFIX = ["Shree", "Sai", "New", "Star", "Royal", "Metro", "City", "Om"]
PARTNER_SUFFIX = ["Telecom", "Connect", "Networks", "Digital Solutions", "Infotech", "Communications"]


def _partner_for(city: str, segment: str) -> dict:
    h = int(hashlib.md5((city or "x").encode()).hexdigest(), 16)
    if segment in ("multi", "mfg"):
        return {"type": "Accel field engineer + key-account manager",
                "name": f"Accel Business {city or 'Regional'} enterprise team",
                "why": "Multi-site and factory installs need a site survey, so our field team handles them."}
    return {"type": "Certified local partner",
            "name": f"{PARTNER_PREFIX[h % len(PARTNER_PREFIX)]} {PARTNER_SUFFIX[(h // 7) % len(PARTNER_SUFFIX)]}, {city}",
            "why": "A certified Accel partner near you does the installation and earns commission on this order."}


def _stages(install_days: int) -> List[dict]:
    d = TODAY
    plan = [
        ("placed", "Order placed", 0, "We have your order and documents."),
        ("kyc", "KYC verified", 0, "Your documents and GST/Udyam records are verified."),
        ("esign", "Agreement e-signed", 0, "Your agreement is signed and stored securely."),
        ("scheduled", "Installation scheduled", 1, "Engineer assigned and visit slot booked."),
        ("installing", "Installation in progress", max(1, install_days - 1), "Lines and devices are being set up."),
        ("active", "All services live", install_days + 1, "Everything is working. Welcome to Accel Business!"),
    ]
    return [{"key": k, "title": t, "eta": (d + dt.timedelta(days=off)).isoformat(), "day": off, "note": n}
            for k, t, off, n in plan]


def create(session: dict, contact: dict, kyc_status: str, esign_ref: str) -> dict:
    quote = session["quote"]
    p = session["profile"]
    oid = "UD" + "".join(random.choices("0123456789", k=6))
    phone = re.sub(r"\D", "", contact.get("phone", ""))
    cat = catalogue()
    products = []
    for line in quote["lines"]:
        days = cat[line["product_id"]]["install_days"]
        products.append({"product_id": line["product_id"], "name": line["name"], "qty": line["qty"],
                         "install_days": days, "eta": (TODAY + dt.timedelta(days=days + 1)).isoformat()})
    order = {
        "id": oid, "session_id": session["id"], "created_ts": time.time(), "created": TODAY.isoformat(),
        "business_name": p.get("business_name") or p.get("business_description") or "Your business",
        "city": p.get("city"), "segment": p.get("segment"), "language": session["language"],
        "contact_name": contact.get("name", "")[:60], "phone_masked": mask_phone(phone), "phone_last4": phone[-4:],
        "monthly": quote["monthly"], "gst": quote["gst"], "setup": quote["setup"], "term": quote["term"],
        "first_bill": quote["first_bill"], "products": products, "install_days": quote["install_days"],
        "stages": _stages(quote["install_days"]), "sim_day": 0, "kyc_status": kyc_status, "esign_ref": esign_ref,
        "partner": _partner_for(p.get("city", ""), p.get("segment", "micro")),
        "support": {"single_number": "1800-XXX-0000 (one number for all products)", "whatsapp": "+91 9XXXX XXXXX"},
    }
    db.save_order(order)
    return view(order)


def view(order: dict) -> dict:
    day = order.get("sim_day", 0)
    stages = []
    current = None
    for st in order["stages"]:
        done = st["day"] <= day if st["key"] != "installing" else st["day"] <= day and day >= 1
        state = "done" if done else "upcoming"
        stages.append(dict(st, state=state))
    for st in stages:
        if st["state"] == "upcoming":
            st["state"] = "current"
            current = st
            break
    today = TODAY + dt.timedelta(days=day)
    products = [dict(p, status="Live" if TODAY + dt.timedelta(days=p["install_days"] + 1) <= today else
                     ("Installing" if day >= 1 else "Scheduled")) for p in order["products"]]
    pct = round(100 * sum(s["state"] == "done" for s in stages) / len(stages))
    msgs = [f"✅ {s['title']} - {s['note']}" for s in stages if s["state"] == "done"]
    return {**{k: v for k, v in order.items() if k not in ("phone_last4", "session_id")},
            "stages": stages, "products": products, "today": today.isoformat(), "progress": pct,
            "current": current, "notifications": msgs[::-1]}


def get(oid: str, phone_last4: str) -> Optional[dict]:
    o = db.load_order(oid.strip().upper())
    if not o or (phone_last4 and o.get("phone_last4") != re.sub(r"\D", "", phone_last4)[-4:]):
        return None
    return view(o)


def advance(oid: str, days: int = 1) -> Optional[dict]:
    o = db.load_order(oid)
    if not o:
        return None
    o["sim_day"] = min(o["install_days"] + 2, o.get("sim_day", 0) + days)
    db.save_order(o)
    return view(o)
