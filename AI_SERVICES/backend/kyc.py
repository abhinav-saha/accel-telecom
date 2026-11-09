"""Smart KYC: cross-checks extracted document fields against the mock
GSTIN / Udyam registries and the business rules in the README.

Each check returns status pass | warn | fail with a plain-language message
and, where relevant, what the owner should do next.
"""
from __future__ import annotations

import datetime as dt
import difflib
import re
from typing import Dict, List, Optional

from .config import ADDRESS_PROOF_MAX_AGE_DAYS, TODAY
from .ocr import DOC_TYPES
from .registry import (city_from_address, lookup_gstin, lookup_udyam, mask_gstin, mask_id,
                       proprietor_name, validate_gstin_format, validate_udyam_format)

REQUIRED_DOCS = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"]
AUTHORISED_DESIGNATIONS = {"owner", "proprietor", "partner", "designated partner", "director", "managing director"}


def _n(s: Optional[str]) -> str:
    s = (s or "").lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]", "", s)


def similar(a: Optional[str], b: Optional[str]) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, _n(a), _n(b)).ratio()


def _pin(addr: str) -> str:
    m = re.findall(r"\d{6}", re.sub(r"(?<=\d)\s+(?=\d)", "", addr or ""))
    return m[-1] if m else ""


def _date(s: Optional[str]) -> Optional[dt.date]:
    try:
        return dt.date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def _suggest_gstin(gst_doc: dict) -> Optional[dict]:
    """Find the registry record the certificate most likely belongs to (same trade name + city)."""
    from .data import gstin_registry
    name, addr = gst_doc.get("trade_name"), gst_doc.get("address", "")
    if not name:
        return None
    best, score = None, 0.0
    for rec in gstin_registry().values():
        if similar(rec["trade_name"], name) < 0.9:
            continue
        sc = similar(rec["principal_place_of_business"], addr)
        if sc > score:
            best, score = rec, sc
    if best and score >= 0.7:
        return {"gstin": best["gstin"], "trade_name": best["trade_name"], "city": city_from_address(best["principal_place_of_business"])}
    return None


def _check(cid: str, title: str, status: str, message: str, action: str = "", doc: str = "") -> dict:
    return {"id": cid, "title": title, "status": status, "message": message, "action": action, "doc": doc}


def verify(gstin_input: str, udyam_input: str, docs: Dict[str, dict], consent: bool) -> dict:
    """docs: {doc_type: {"fields": {...}, "quality": {...}, "doc_type": detected}}"""
    checks: List[dict] = []
    fx = {k: (v or {}).get("fields", {}) for k, v in docs.items()}

    # 0. Consent ---------------------------------------------------------------
    checks.append(_check("consent", "Consent recorded", "pass" if consent else "fail",
                         "Consent for KYC verification is on record." if consent else
                         "We need your consent before we can verify documents.",
                         "" if consent else "Accept the consent notice to continue."))

    # 1. Documents present, right type, legible ----------------------------------
    for d in REQUIRED_DOCS:
        name = DOC_TYPES[d]
        if d not in docs:
            checks.append(_check(f"{d}_present", f"{name} uploaded", "fail",
                                 f"{name} is missing.", f"Upload your {name}.", d))
            continue
        info = docs[d]
        detected = info.get("doc_type")
        if detected and detected != d and detected in DOC_TYPES:
            checks.append(_check(f"{d}_type", f"{name} - correct document", "fail",
                                 f"This looks like a {DOC_TYPES[detected].lower()}, not a {name.lower()}.",
                                 f"Upload the {name.lower()} in this slot.", d))
            continue
        if (info.get("quality") or {}).get("blurry"):
            checks.append(_check(f"{d}_quality", f"{name} - readable", "fail",
                                 f"This {name} is too blurry to read reliably.",
                                 "Retake the photo in good light, hold the phone steady and keep the whole page in frame.", d))

    # 2. GSTIN ---------------------------------------------------------------------
    gst_doc = fx.get("gst_certificate", {})
    gstin = (gstin_input or gst_doc.get("gstin") or "").strip().upper()
    reg = None
    if not gstin:
        checks.append(_check("gstin_format", "GSTIN", "fail", "No GSTIN was entered or found on the certificate.",
                             "Type your 15-character GSTIN.", "gst_certificate"))
    else:
        fmt = validate_gstin_format(gstin)
        if not fmt["valid"]:
            hint = _suggest_gstin(gst_doc)
            checks.append(_check("gstin_format", "GSTIN format & checksum", "fail",
                                 f"{mask_gstin(gstin)}: {fmt['errors'][0]}" + (
                                     f" The GST registry has {hint['trade_name']}, {hint['city']} under "
                                     f"{mask_gstin(hint['gstin'])} - the certificate may be edited or mistyped." if hint else ""),
                                 "Type the GSTIN from the GST portal, or upload the original certificate.", "gst_certificate"))
        else:
            checks.append(_check("gstin_format", "GSTIN format & checksum", "pass",
                                 f"{mask_gstin(gstin)} has a valid structure and check digit ({fmt['state']})."))
            reg = lookup_gstin(gstin)
            if not reg["found"]:
                checks.append(_check("gstin_registry", "GSTIN found in GST registry", "fail",
                                     "This GSTIN is not in the GST registry.", "Re-check the number on your certificate.",
                                     "gst_certificate"))
                reg = None
            elif not reg["active"]:
                checks.append(_check("gstin_status", "GST registration active", "fail",
                                     f"GST registration is {reg['status'].upper()} in the registry. We can't activate "
                                     "services that need GST on a cancelled or suspended registration.",
                                     "Restore the registration on the GST portal, or continue with non-GST products only.",
                                     "gst_certificate"))
            else:
                checks.append(_check("gstin_status", "GST registration active", "pass",
                                     f"Active since {reg['registration_date']} - {reg['trade_name']}."))

    if gst_doc and reg:
        cert_g = (gst_doc.get("gstin") or "").upper()
        if cert_g and cert_g != reg["gstin"]:
            cf = validate_gstin_format(cert_g)
            why = cf["errors"][0] if cf["errors"] else "it is a different number"
            checks.append(_check("gst_cert_gstin", "GSTIN on certificate matches", "fail",
                                 f"The GSTIN printed on the certificate ({mask_gstin(cert_g)}) does not match the "
                                 f"registry record ({mask_gstin(reg['gstin'])}): {why}",
                                 "Upload the original GST certificate (REG-06) from the GST portal.", "gst_certificate"))
        elif cert_g:
            checks.append(_check("gst_cert_gstin", "GSTIN on certificate matches", "pass",
                                 "Certificate GSTIN matches the registry."))
        else:
            checks.append(_check("gst_cert_gstin", "GSTIN on certificate", "warn",
                                 "Could not read the GSTIN on the certificate.", "Upload a clearer copy.",
                                 "gst_certificate"))
        for field, label in (("legal_name", "Legal name"), ("trade_name", "Trade name")):
            got = gst_doc.get(field)
            if not got:
                continue
            s = similar(got, reg[field])
            if s >= 0.9:
                checks.append(_check(f"gst_{field}", f"{label} matches registry", "pass", f"{label}: {reg[field]}"))
            else:
                checks.append(_check(f"gst_{field}", f"{label} matches registry", "fail",
                                     f"Certificate says \"{got}\" but the GST registry says \"{reg[field]}\". "
                                     "The document may be edited or belong to another business.",
                                     "Upload the GST certificate downloaded from the GST portal.", "gst_certificate"))
        if gst_doc.get("address"):
            s = similar(gst_doc["address"], reg["address"])
            st = "pass" if s >= 0.8 else ("warn" if s >= 0.6 else "fail")
            checks.append(_check("gst_address", "Business address matches registry", st,
                                 "Address matches the GST registry." if st == "pass" else
                                 f"Address on certificate differs from registry ({reg['address']}).",
                                 "" if st == "pass" else "Check that this is your principal place of business.",
                                 "gst_certificate"))
    elif gst_doc and not reg and gst_doc.get("gstin") and gstin_input and gst_doc["gstin"] != gstin_input.upper():
        checks.append(_check("gst_cert_gstin", "GSTIN on certificate matches", "fail",
                             "GSTIN on the certificate differs from the one you entered.", "", "gst_certificate"))

    # 3. Udyam -----------------------------------------------------------------------
    ud_doc = fx.get("udyam_certificate", {})
    udyam = (udyam_input or ud_doc.get("udyam_number") or "").strip().upper()
    ureg = None
    if "udyam_certificate" in docs and not ud_doc.get("udyam_number") and not (docs["udyam_certificate"].get("quality") or {}).get("blurry"):
        checks.append(_check("udyam_on_cert", "Udyam number on certificate", "fail",
                             "The Udyam registration number is blank on the certificate.",
                             "Download the certificate again from udyamregistration.gov.in or type your Udyam number.",
                             "udyam_certificate"))
    if udyam:
        uf = validate_udyam_format(udyam)
        if not uf["valid"]:
            checks.append(_check("udyam_format", "Udyam number format", "fail", uf["errors"][0],
                                 "Check the number (format UDYAM-XX-00-0000000).", "udyam_certificate"))
        else:
            ureg = lookup_udyam(udyam)
            if not ureg["found"]:
                checks.append(_check("udyam_registry", "Udyam found in registry", "fail",
                                     f"{udyam} is not in the Udyam registry.", "Re-check the number.", "udyam_certificate"))
                ureg = None
            else:
                checks.append(_check("udyam_registry", "Udyam found in registry", "pass",
                                     f"{ureg['enterprise_name']} - {ureg['enterprise_type']} enterprise, {ureg['city']}."))
    if ureg and ud_doc.get("udyam_number") and ud_doc["udyam_number"].upper() != ureg["udyam_number"]:
        checks.append(_check("udyam_cert_number", "Udyam number on certificate matches", "fail",
                             "The number on the certificate differs from the one entered.", "", "udyam_certificate"))
    if ureg and reg:
        biz = reg["trade_name"]
        s = similar(ureg["enterprise_name"], biz)
        same_city = _n(ureg["city"]) == _n(city_from_address(reg["address"]))
        if s >= 0.9 and same_city:
            checks.append(_check("udyam_gst_link", "Udyam and GST belong to the same business", "pass",
                                 f"Name and city match ({ureg['city']})."))
        else:
            checks.append(_check("udyam_gst_link", "Udyam and GST belong to the same business", "fail",
                                 f"Udyam record is for {ureg['enterprise_name']}, {ureg['city']} but GST is for {biz}, "
                                 f"{city_from_address(reg['address'])}. Same-name businesses exist in other cities.",
                                 "Make sure you entered the Udyam number of this branch.", "udyam_certificate"))
    if ureg and ud_doc.get("enterprise_name") and similar(ud_doc["enterprise_name"], ureg["enterprise_name"]) < 0.9:
        checks.append(_check("udyam_cert_name", "Name on Udyam certificate", "fail",
                             f"Certificate says \"{ud_doc['enterprise_name']}\", registry says \"{ureg['enterprise_name']}\".",
                             "", "udyam_certificate"))

    # 4. Signatory ---------------------------------------------------------------------
    sig = fx.get("signatory_id", {})
    if sig:
        vt = _date(sig.get("valid_till"))
        if vt and vt < TODAY:
            checks.append(_check("sig_valid", "Signatory ID valid", "fail", f"ID expired on {vt}.",
                                 "Upload a valid ID.", "signatory_id"))
        elif vt:
            checks.append(_check("sig_valid", "Signatory ID valid", "pass", f"Valid till {vt} (ID {mask_id(sig.get('id_number', ''))})."))
        if reg:
            biz_ok = max(similar(sig.get("business_name"), reg["trade_name"]), similar(sig.get("business_name"), reg["legal_name"]))
            if sig.get("business_name") and biz_ok < 0.85:
                checks.append(_check("sig_business", "ID issued for this business", "fail",
                                     f"ID is for \"{sig['business_name']}\", not {reg['trade_name']}.", "", "signatory_id"))
            prop = proprietor_name(reg["legal_name"])
            desig = (sig.get("designation") or "").strip().lower()
            if reg["constitution"] == "Proprietorship" and prop:
                if similar(sig.get("name"), prop) >= 0.85:
                    checks.append(_check("sig_authority", "Signatory is authorised", "pass",
                                         f"{sig.get('name')} is the proprietor on the GST record."))
                else:
                    checks.append(_check("sig_authority", "Signatory is authorised", "fail",
                                         f"{sig.get('name') or 'The signatory'} is not the proprietor ({prop}) on the GST record.",
                                         "The proprietor should sign, or upload a signed authorisation letter.", "signatory_id"))
            else:
                if desig in AUTHORISED_DESIGNATIONS:
                    checks.append(_check("sig_authority", "Signatory is authorised", "pass",
                                         f"{sig.get('name')} ({sig.get('designation')}) can sign for a {reg['constitution']}."))
                else:
                    checks.append(_check("sig_authority", "Signatory is authorised", "warn",
                                         f"For a {reg['constitution']} we need proof that {sig.get('name')} can sign.",
                                         "Upload a board resolution / partner authorisation letter.", "signatory_id"))

    # 5. Address proof ----------------------------------------------------------------------
    ap = fx.get("address_proof", {})
    if ap:
        bd = _date(ap.get("bill_date"))
        if not bd:
            checks.append(_check("addr_date", "Address proof is recent", "warn", "Could not read the bill date.",
                                 "Upload a clearer copy.", "address_proof"))
        else:
            age = (TODAY - bd).days
            if age > ADDRESS_PROOF_MAX_AGE_DAYS:
                checks.append(_check("addr_date", "Address proof is recent", "fail",
                                     f"Bill dated {bd} is {age} days old; it must be under {ADDRESS_PROOF_MAX_AGE_DAYS} days.",
                                     "Upload a utility bill from the last 3 months.", "address_proof"))
            elif age < 0:
                checks.append(_check("addr_date", "Address proof is recent", "fail",
                                     f"Bill date {bd} is in the future.", "", "address_proof"))
            else:
                checks.append(_check("addr_date", "Address proof is recent", "pass", f"Bill dated {bd} ({age} days old)."))
        if reg:
            nm = max(similar(ap.get("billed_to"), reg["trade_name"]), similar(ap.get("billed_to"), reg["legal_name"]),
                     similar(ap.get("billed_to"), proprietor_name(reg["legal_name"])))
            checks.append(_check("addr_name", "Bill is in the business's name", "pass" if nm >= 0.85 else "fail",
                                 f"Billed to {ap.get('billed_to')}." if nm >= 0.85 else
                                 f"Bill is in the name of \"{ap.get('billed_to')}\", not {reg['trade_name']}.",
                                 "" if nm >= 0.85 else "Upload a bill in the business or proprietor's name.", "address_proof"))
            s = similar(ap.get("address"), reg["address"])
            same_pin = _pin(ap.get("address", "")) and _pin(ap.get("address", "")) == _pin(reg["address"])
            st = "pass" if (s >= 0.8 or same_pin and s >= 0.6) else ("warn" if s >= 0.6 else "fail")
            checks.append(_check("addr_match", "Bill address matches GST address", st,
                                 "Supply address matches the GST principal place of business." if st == "pass" else
                                 f"Bill address \"{ap.get('address')}\" differs from GST address \"{reg['address']}\".",
                                 "" if st == "pass" else "Upload a bill for your registered premises.", "address_proof"))

    fails = [c for c in checks if c["status"] == "fail"]
    warns = [c for c in checks if c["status"] == "warn"]
    status = "verified" if not fails and not warns else ("needs_attention" if not fails else "action_required")
    summary = {
        "verified": "All documents verified. You're ready to e-sign.",
        "needs_attention": "Almost there - a few items need a quick look, but you can continue.",
        "action_required": "Some documents need to be fixed before we can activate your services.",
    }[status]
    business = None
    if reg:
        business = {"legal_name": reg["legal_name"], "trade_name": reg["trade_name"], "constitution": reg["constitution"],
                    "address": reg["address"], "state": reg["state"], "gstin_masked": mask_gstin(reg["gstin"]),
                    "gst_status": reg["status"]}
    return {"status": status, "summary": summary, "checks": checks, "fail_count": len(fails),
            "warn_count": len(warns), "pass_count": sum(c["status"] == "pass" for c in checks), "business": business,
            "gst_active": bool(reg and reg["active"])}
