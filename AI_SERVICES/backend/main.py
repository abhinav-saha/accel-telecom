"""FastAPI app: serves the customer PWA, back-office and JSON APIs."""
from __future__ import annotations

import logging
import random
import re
import time
from typing import Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import advisor, analytics, db, kyc, llm, orders, rules
from .config import ADMIN_PIN, KYC_DIR, FRONTEND_DIR, TODAY
from .data import catalogue, city_tiers
from .i18n import LANGUAGES, SPEECH_LOCALE
from .ocr import DOC_TYPES, extract
from .registry import lookup_gstin, lookup_udyam, mask_gstin, mask_id, mask_phone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("udyam")

app = FastAPI(title="Udyam Digital - Accel Business SMB onboarding", version="1.0")

CONSENT_NOTICE_VERSION = "2026-07-v1"
RETENTION = {
    "document_images": "Not stored - processed in memory and discarded immediately after extraction.",
    "extracted_fields": "Raw fields deleted right after verification; only masked values + check results are kept.",
    "kyc_result": "Kept for the contract period + 8 years (telecom licence / tax record rules), then deleted.",
    "abandoned_sessions": "Deleted after 30 days if no order is placed.",
}


# ------------------------------------------------------------------ models

class StartReq(BaseModel):
    language: str = "en"
    channel: str = "web"


class MsgReq(BaseModel):
    session_id: str
    text: Optional[str] = None
    value: Optional[str] = None


class QuoteItem(BaseModel):
    product_id: str
    qty: int = 1
    on: bool = True


class QuoteReq(BaseModel):
    session_id: str
    items: List[QuoteItem] = []
    term: Optional[int] = None


class ConnReq(BaseModel):
    session_id: str
    product_id: str


class LookupReq(BaseModel):
    value: str


class ConsentReq(BaseModel):
    session_id: str
    purposes: Dict[str, bool]


class VerifyReq(BaseModel):
    session_id: str
    gstin: str = ""
    udyam: str = ""


class EsignReq(BaseModel):
    session_id: str
    otp: str


class OrderReq(BaseModel):
    session_id: str
    name: str
    phone: str


class CallbackReq(BaseModel):
    session_id: Optional[str] = None
    name: str
    phone: str
    slot: str = "Anytime"
    note: str = ""


def _session(sid: str) -> dict:
    s = db.load_session(sid)
    if not s:
        raise HTTPException(404, "Session not found - please start again.")
    return s


def _admin(request: Request) -> None:
    if request.headers.get("x-admin-pin") != ADMIN_PIN:
        raise HTTPException(401, "Back-office PIN required")


# ------------------------------------------------------------------ meta / catalogue / registries

@app.get("/api/meta")
def meta():
    return {"languages": LANGUAGES, "speech": SPEECH_LOCALE, "llm": llm.status(), "today": TODAY.isoformat(),
            "cities": city_tiers(), "needs": {k: v[0] for k, v in rules.NEEDS.items()},
            "retention": RETENTION, "consent_version": CONSENT_NOTICE_VERSION}


@app.get("/api/catalogue")
def get_catalogue():
    return [rules.product_card(pid) for pid in catalogue()]


@app.post("/api/registry/gstin")
def gstin_lookup(req: LookupReq):
    """Mock GST public-search API backed by mock_gstin_registry.csv (POST keeps IDs out of URLs/logs)."""
    r = lookup_gstin(req.value)
    log.info("gstin lookup %s found=%s", mask_gstin(req.value), r["found"])
    return r


@app.post("/api/registry/udyam")
def udyam_lookup(req: LookupReq):
    r = lookup_udyam(req.value)
    log.info("udyam lookup %s found=%s", mask_id(req.value, 3), r["found"])
    return r


# ------------------------------------------------------------------ advisor

@app.post("/api/chat/start")
def chat_start(req: StartReq):
    return advisor.new_session(req.language, req.channel)


@app.post("/api/chat/message")
def chat_message(req: MsgReq):
    try:
        return advisor.handle(req.session_id, req.text, req.value)
    except KeyError:
        raise HTTPException(404, "Session not found - please start again.")


@app.post("/api/quote")
def quote(req: QuoteReq):
    try:
        return advisor.update_quote(req.session_id, [i.dict() for i in req.items], req.term)
    except KeyError:
        raise HTTPException(404, "Session not found")


@app.post("/api/quote/connectivity")
def quote_connectivity(req: ConnReq):
    try:
        return advisor.switch_connectivity(req.session_id, req.product_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/session/{sid}")
def get_session(sid: str):
    s = _session(sid)
    rec = s.get("recommendation")
    return {"id": s["id"], "language": s["language"], "stage": s["stage"], "profile": advisor._public_profile(s["profile"]),
            "recommendation": advisor.decorate(rec) if rec else None, "quote": s.get("quote"),
            "kyc": s.get("kyc"), "consent": s.get("consent"), "esign": s.get("esign"), "order_id": s.get("order_id"),
            "transcript": s.get("transcript", [])[-40:]}


# ------------------------------------------------------------------ KYC

@app.post("/api/kyc/consent")
def kyc_consent(req: ConsentReq):
    s = _session(req.session_id)
    if not req.purposes.get("kyc"):
        raise HTTPException(400, "KYC consent is required to verify documents.")
    receipt = {"consent_id": "CNS-" + "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=8)),
               "ts": time.time(), "notice_version": CONSENT_NOTICE_VERSION, "purposes": req.purposes,
               "language": s["language"]}
    s["consent"] = receipt
    s["stage"] = "kyc"
    db.save_session(s["id"], s)
    db.audit(s["id"], "consent_given", ",".join(k for k, v in req.purposes.items() if v))
    return receipt


@app.post("/api/kyc/withdraw")
def kyc_withdraw(req: MsgReq):
    s = _session(req.session_id)
    s["consent"] = None
    s["kyc_docs"] = {}
    s["kyc"] = None
    db.save_session(s["id"], s)
    db.audit(s["id"], "consent_withdrawn", "documents and extracted data erased")
    return {"ok": True, "message": "Consent withdrawn. Your documents and extracted data have been erased."}


def _masked_fields(fields: dict) -> dict:
    out = dict(fields)
    if out.get("gstin"):
        out["gstin"] = mask_gstin(out["gstin"])
    for k in ("id_number", "consumer_number"):
        if out.get(k):
            out[k] = mask_id(out[k])
    return out


def _store_extraction(s: dict, doc_type: str, result: dict) -> dict:
    s.setdefault("kyc_docs", {})[doc_type] = {"fields": result["fields"], "quality": result["quality"],
                                              "doc_type": result.get("doc_type"), "engine": result.get("engine")}
    db.save_session(s["id"], s)
    db.audit(s["id"], "document_extracted", f"{doc_type} via {result.get('engine')}")
    detected = result.get("doc_type")
    return {"doc_type": doc_type, "detected_type": detected, "type_ok": not detected or detected == doc_type,
            "fields": _masked_fields(result["fields"]), "quality": result["quality"], "engine": result.get("engine"),
            "deskew_angle": result.get("deskew_angle")}


@app.post("/api/kyc/extract")
async def kyc_extract(session_id: str = Form(...), doc_type: str = Form(...), file: UploadFile = File(...)):
    s = _session(session_id)
    if not s.get("consent"):
        raise HTTPException(403, "Please accept the consent notice first.")
    if doc_type not in DOC_TYPES:
        raise HTTPException(400, "Unknown document type")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 8 MB)")
    try:
        result = extract(data, doc_type)   # image bytes stay in memory only
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        del data
    return _store_extraction(s, doc_type, result)


@app.get("/api/kyc/samples")
def kyc_samples():
    out = {}
    for f in sorted(KYC_DIR.glob("K*_*.png")):
        k, t = f.stem.split("_", 1)
        out.setdefault(k, []).append(t)
    return [{"applicant": k, "docs": v} for k, v in out.items()]


@app.get("/api/kyc/sample-image/{name}")
def kyc_sample_image(name: str):
    if not re.fullmatch(r"K\d{2}_[a-z_]+", name):
        raise HTTPException(400, "bad name")
    path = KYC_DIR / f"{name}.png"
    if not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path)


class SampleReq(BaseModel):
    session_id: str
    applicant: str
    doc_type: Optional[str] = None


@app.post("/api/kyc/sample")
def kyc_use_sample(req: SampleReq):
    """Demo helper: run the real extraction pipeline on a specimen document (or fetch all, DigiLocker-style)."""
    s = _session(req.session_id)
    if not s.get("consent"):
        raise HTTPException(403, "Please accept the consent notice first.")
    if not re.fullmatch(r"K\d{2}", req.applicant):
        raise HTTPException(400, "bad applicant")
    types = [req.doc_type] if req.doc_type else list(DOC_TYPES)
    s["kyc_docs"] = {} if not req.doc_type else s.get("kyc_docs", {})
    results = []
    for t in types:
        path = KYC_DIR / f"{req.applicant}_{t}.png"
        if not path.exists():
            results.append({"doc_type": t, "missing": True})
            continue
        res = extract(path.read_bytes(), t)
        results.append(dict(_store_extraction(s, t, res), preview=f"/api/kyc/sample-image/{req.applicant}_{t}"))
    return {"applicant": req.applicant, "documents": results}


@app.post("/api/kyc/verify")
def kyc_verify(req: VerifyReq):
    s = _session(req.session_id)
    docs = s.get("kyc_docs") or {}
    result = kyc.verify(req.gstin, req.udyam, docs, bool(s.get("consent")))
    # Data minimisation: drop raw extracted fields once checks have run.
    s["kyc_docs"] = {k: {"fields": _masked_fields(v["fields"]), "quality": v["quality"], "doc_type": v.get("doc_type")}
                     for k, v in docs.items()}
    s["kyc"] = result
    if result.get("business"):
        s["profile"]["business_name"] = result["business"]["trade_name"]
    if result.get("gst_active"):
        s["profile"]["has_gstin"] = True
    elif result.get("business") and not result.get("gst_active"):
        s["profile"]["has_gstin"] = False
    # Re-check the quote against the verified GST status (e.g. cancelled GSTIN removes GST-only products)
    if s.get("recommendation"):
        s["quote"] = rules.build_quote(s["recommendation"]["items"], s["profile"], (s.get("quote") or {}).get("term"))
        result["quote_issues"] = s["quote"]["issues"]
    db.save_session(s["id"], s)
    db.audit(s["id"], "kyc_verified", f"{result['status']} pass={result['pass_count']} fail={result['fail_count']}")
    return result


@app.post("/api/kyc/esign")
def kyc_esign(req: EsignReq):
    s = _session(req.session_id)
    if not s.get("kyc") or s["kyc"]["status"] == "action_required":
        raise HTTPException(400, "Please fix the KYC items first.")
    if not re.fullmatch(r"\d{6}", req.otp or ""):
        raise HTTPException(400, "Enter the 6-digit OTP.")
    ref = "ESIGN-" + "".join(random.choices("0123456789ABCDEF", k=10))
    s["esign"] = {"ref": ref, "ts": time.time(), "method": "Aadhaar OTP e-sign (simulated)"}
    db.save_session(s["id"], s)
    db.audit(s["id"], "agreement_esigned", ref)
    return s["esign"]


# ------------------------------------------------------------------ orders / tracker / callback

@app.post("/api/orders")
def create_order(req: OrderReq):
    s = _session(req.session_id)
    if not s.get("esign"):
        raise HTTPException(400, "Please complete KYC and e-sign first.")
    if not s.get("quote") or not s["quote"].get("valid"):
        raise HTTPException(400, "Your quote has unresolved items - please review it.")
    if len(re.sub(r"\D", "", req.phone)) < 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number.")
    order = orders.create(s, {"name": req.name, "phone": req.phone}, s["kyc"]["status"], s["esign"]["ref"])
    s["order_id"] = order["id"]
    s["stage"] = "ordered"
    db.save_session(s["id"], s)
    db.audit(s["id"], "order_created", order["id"])
    return order


@app.get("/api/orders/{oid}")
def get_order(oid: str, phone4: str = ""):
    o = orders.get(oid, phone4)
    if not o:
        raise HTTPException(404, "No order found for this ID and mobile number.")
    return o


@app.post("/api/orders/{oid}/advance")
def advance_order(oid: str, days: int = 1):
    o = orders.advance(oid, days)
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@app.post("/api/callback")
def callback(req: CallbackReq):
    entry = {"name": req.name[:60], "phone_masked": mask_phone(req.phone), "slot": req.slot, "note": req.note[:200],
             "ts": time.time()}
    if req.session_id:
        s = db.load_session(req.session_id)
        if s:
            s["callback"] = entry
            db.save_session(s["id"], s)
    return {"ok": True, "message": "A local Accel expert will call you " + (req.slot.lower() if req.slot else "soon") + "."}


# ------------------------------------------------------------------ back-office

@app.get("/api/admin/summary")
def admin_summary(request: Request):
    _admin(request)
    return analytics.summary()


@app.get("/api/admin/calllist")
def admin_calllist(request: Request, segment: str = "", limit: int = 60):
    _admin(request)
    return analytics.call_list(limit, segment)


@app.get("/api/admin/live")
def admin_live(request: Request):
    _admin(request)
    return {"leads": analytics.live_leads(), "orders": [orders.view(o) for o in db.all_orders()][:50]}


# ------------------------------------------------------------------ static

@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "camera=(self), microphone=(self)"
    return resp


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/admin")
def admin_page():
    return FileResponse(FRONTEND_DIR / "admin.html")


@app.get("/track")
def track_page():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")


@app.on_event("startup")
def warm():
    # Build the propensity model once at boot so the back-office loads fast.
    try:
        analytics.summary()
    except Exception as exc:  # pragma: no cover
        log.warning("analytics warm-up failed: %s", exc)
    log.info("Retention: purged %d abandoned sessions older than 30 days", db.purge_abandoned(30))
    log.info("LLM: %s", llm.status())
