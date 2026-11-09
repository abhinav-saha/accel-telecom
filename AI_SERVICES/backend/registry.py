"""GSTIN / Udyam validation, mock registry lookups and identifier masking."""
from __future__ import annotations

import re
from typing import Optional

from .data import gstin_registry, udyam_registry

_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
UDYAM_RE = re.compile(r"^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$")

STATE_CODES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
    "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
}
UDYAM_STATE = {
    "JK": "Jammu and Kashmir", "HP": "Himachal Pradesh", "PB": "Punjab", "CH": "Chandigarh",
    "UK": "Uttarakhand", "HR": "Haryana", "DL": "Delhi", "RJ": "Rajasthan", "UP": "Uttar Pradesh",
    "BR": "Bihar", "WB": "West Bengal", "JH": "Jharkhand", "OD": "Odisha", "CG": "Chhattisgarh",
    "MP": "Madhya Pradesh", "GJ": "Gujarat", "MH": "Maharashtra", "KR": "Karnataka", "KA": "Karnataka",
    "GA": "Goa", "KL": "Kerala", "TN": "Tamil Nadu", "PY": "Puducherry", "TS": "Telangana",
    "AP": "Andhra Pradesh", "AS": "Assam",
}


def normalise(value: Optional[str]) -> str:
    return re.sub(r"[\s]", "", (value or "")).upper()


def gstin_check_char(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        product = _CHARS.index(ch) * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return _CHARS[(36 - total % 36) % 36]


def validate_gstin_format(raw: str) -> dict:
    g = normalise(raw)
    errors = []
    if len(g) != 15:
        errors.append(f"GSTIN must be 15 characters (got {len(g)}).")
    elif not GSTIN_RE.match(g):
        errors.append("GSTIN pattern is wrong: expected 2-digit state code, 10-character PAN, entity number, 'Z' and a check character.")
    elif g[:2] not in STATE_CODES:
        errors.append(f"'{g[:2]}' is not a valid GST state code.")
    elif gstin_check_char(g[:14]) != g[14]:
        errors.append("Check character does not match - the GSTIN has a typo.")
    # Note: PAN 4th char is always 'X' in this synthetic data; README asks us to accept it.
    return {
        "gstin": g,
        "valid": not errors,
        "errors": errors,
        "state_code": g[:2] if len(g) >= 2 else "",
        "state": STATE_CODES.get(g[:2], ""),
        "pan": g[2:12] if len(g) >= 12 else "",
    }


def lookup_gstin(raw: str) -> dict:
    fmt = validate_gstin_format(raw)
    if not fmt["valid"]:
        return {"found": False, "format": fmt}
    rec = gstin_registry().get(fmt["gstin"])
    if not rec:
        return {"found": False, "format": fmt}
    return {
        "found": True,
        "format": fmt,
        "gstin": rec["gstin"],
        "legal_name": rec["legal_name"],
        "trade_name": rec["trade_name"],
        "constitution": rec["constitution"],
        "address": rec["principal_place_of_business"],
        "state": rec["state"],
        "registration_date": rec["registration_date"],
        "status": rec["status"],
        "active": rec["status"] == "Active",
    }


def validate_udyam_format(raw: str) -> dict:
    u = normalise(raw)
    errors = []
    if not UDYAM_RE.match(u):
        errors.append("Udyam number must look like UDYAM-XX-00-0000000.")
    elif u[6:8] not in UDYAM_STATE:
        errors.append(f"'{u[6:8]}' is not a recognised state code.")
    return {"udyam": u, "valid": not errors, "errors": errors, "state": UDYAM_STATE.get(u[6:8], "")}


def lookup_udyam(raw: str) -> dict:
    fmt = validate_udyam_format(raw)
    if not fmt["valid"]:
        return {"found": False, "format": fmt}
    rec = udyam_registry().get(fmt["udyam"])
    if not rec:
        return {"found": False, "format": fmt}
    return {
        "found": True,
        "format": fmt,
        "udyam_number": rec["udyam_number"],
        "enterprise_name": rec["enterprise_name"],
        "enterprise_type": rec["enterprise_type"],
        "major_activity": rec["major_activity"],
        "nic_description": rec["nic_description"],
        "state": rec["state"],
        "city": rec["city"],
        "registration_date": rec["date_of_registration"],
    }


def proprietor_name(legal_name: str) -> str:
    """'Joseph Singh (Prop. Ganesh Woodcraft)' -> 'Joseph Singh'."""
    m = re.match(r"^(.*?)\s*\(Prop\.", legal_name or "")
    return m.group(1).strip() if m else ""


def city_from_address(address: str) -> str:
    # "Shop/Unit 80, Civil Lines, Nagpur, Maharashtra - 411231"
    parts = [p.strip() for p in (address or "").split(",")]
    return parts[-2] if len(parts) >= 2 else ""


# ---------- masking (used in UI, logs and stored records) ----------

def mask_gstin(g: str) -> str:
    g = normalise(g)
    return g[:2] + "X" * 8 + g[10:] if len(g) == 15 else "*" * len(g)


def mask_id(value: str, keep: int = 4) -> str:
    v = (value or "").replace(" ", "")
    if len(v) <= keep:
        return "*" * len(v)
    return "X" * (len(v) - keep) + v[-keep:]


def mask_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p or "")
    return ("XXXXXX" + digits[-4:]) if len(digits) >= 4 else "XXXX"
