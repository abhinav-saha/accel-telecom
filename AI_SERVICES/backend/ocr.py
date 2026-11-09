"""Document extraction: Gemini vision when a key is set, local RapidOCR otherwise.

Local pipeline: decode -> blur check -> deskew -> remove pink watermark ->
OCR -> rows -> label/value pairing -> identifier repair (GSTIN checksum,
Udyam pattern). Images never leave memory and are not written to disk.
"""
from __future__ import annotations

import difflib
import logging
import re
import threading
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from . import config, llm
from .registry import GSTIN_RE, gstin_check_char

log = logging.getLogger("udyam.ocr")

DOC_TYPES = {
    "gst_certificate": "GST registration certificate",
    "udyam_certificate": "Udyam registration certificate",
    "signatory_id": "Authorised signatory ID",
    "address_proof": "Address proof (utility bill)",
}

LABELS = {
    "gst_certificate": {
        "gstin": ["gstin"], "legal_name": ["legal name"], "trade_name": ["trade name"],
        "constitution": ["constitution"], "address": ["address of principal", "place of business"],
        "date_of_liability": ["date of liability"], "registration_type": ["type of registration"],
    },
    "udyam_certificate": {
        "udyam_number": ["udyam reg. number", "udyam reg number"], "enterprise_name": ["enterprise name"],
        "major_activity": ["major activity"], "city": ["city"], "state": ["state"],
        "date_of_registration": ["date of registration"],
    },
    "signatory_id": {
        "name": ["name"], "designation": ["designation"], "business_name": ["for business"],
        "id_number": ["id no.", "id no"], "valid_till": ["valid till"],
    },
    "address_proof": {
        "consumer_number": ["consumer no."], "billed_to": ["billed to"], "address": ["supply address"],
        "bill_date": ["bill date"], "units": ["units consumed"], "amount_due": ["amount due (inr)", "amount due"],
    },
}

BLUR_THRESHOLD = 60.0
_engine = None
_engine_lock = threading.Lock()


def _ocr_engine():
    global _engine
    with _engine_lock:
        if _engine is None:
            from rapidocr_onnxruntime import RapidOCR
            _engine = RapidOCR()
    return _engine


# ---------------------------------------------------------------- image utils

def decode(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read the image. Please upload a PNG or JPG.")
    return img


def sharpness(img: np.ndarray) -> float:
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    scale = 1240.0 / max(g.shape[1], 1)
    if abs(scale - 1) > 0.05:
        g = cv2.resize(g, None, fx=scale, fy=scale)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def _ink_mask(img: np.ndarray) -> np.ndarray:
    b, g, r = [img[:, :, i].astype(int) for i in range(3)]
    reddish = (r - g > 25) & (r - b > 15)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return ((gray < 120) & ~reddish).astype(np.uint8) * 255


def deskew(img: np.ndarray) -> Tuple[np.ndarray, float]:
    """Straighten a tilted photo using the document's frame lines."""
    mask = _ink_mask(img)
    lines = cv2.HoughLinesP(mask, 1, np.pi / 720, threshold=200,
                            minLineLength=img.shape[1] // 3, maxLineGap=10)
    if lines is None:
        return img, 0.0
    angles = []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        a = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(a) < 20:
            angles.append(a)
        elif abs(abs(a) - 90) < 20:
            angles.append(a - 90 if a > 0 else a + 90)
    if not angles:
        return img, 0.0
    angle = float(np.median(angles))
    if abs(angle) < 0.4:
        return img, 0.0
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderValue=(250, 250, 250))
    return rotated, angle


def remove_watermark(img: np.ndarray) -> np.ndarray:
    b, g, r = [img[:, :, i].astype(int) for i in range(3)]
    reddish = (r - g > 25) & (r - b > 15)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    out = np.where(reddish, 255, gray).astype(np.uint8)
    return np.where(out < 165, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- OCR parsing

def _run_ocr(image: np.ndarray) -> List[Tuple[float, float, float, str]]:
    res, _ = _ocr_engine()(image)
    boxes = []
    for box, text, _score in res or []:
        x0 = min(p[0] for p in box)
        x1 = max(p[0] for p in box)
        yc = sum(p[1] for p in box) / 4
        boxes.append((yc, x0, x1, text.strip()))
    return boxes


def _rows(boxes, tol: float = 16) -> List[List[Tuple[float, float, str]]]:
    rows: List[List] = []
    for yc, x0, x1, t in sorted(boxes):
        if rows and abs(rows[-1][0][0] - yc) < tol:
            rows[-1].append((yc, x0, t))
        else:
            rows.append([(yc, x0, t)])
    return [sorted(r, key=lambda b: b[1]) for r in rows]


_WATERMARK = re.compile(r"(SYNTHETIC|THETIC|SPECIMEN|ECIMEN|NOT ?A ?VALID|DOCUM|HETIC)", re.I)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def _match_label(text: str, doc_type: str) -> Optional[str]:
    t = _norm(text)
    if not t:
        return None
    best, score = None, 0.0
    for field, variants in LABELS[doc_type].items():
        for v in variants:
            r = difflib.SequenceMatcher(None, t, _norm(v)).ratio()
            if r > score:
                best, score = field, r
    return best if score >= 0.72 else None


def _clean_value(v: str) -> str:
    v = re.sub(r"\s+", " ", v).strip(" |:;")
    return v


def detect_type(text: str) -> Optional[str]:
    t = text.lower()
    if "udyam" in t:
        return "udyam_certificate"
    if "gst registration" in t or "gstin" in t or "gsт" in t or "regist" in t and "cert" in t:
        return "gst_certificate"
    if "signatory" in t:
        return "signatory_id"
    if "electricity" in t or "bill" in t or "consumer" in t:
        return "address_proof"
    return None


def _pair_fields(boxes, doc_type: str, width: int) -> Dict[str, str]:
    fields: Dict[str, List[str]] = {}
    rows = _rows(boxes)
    split = width * 0.38
    stacked = doc_type == "signatory_id"
    last_field = None
    pending_label = None
    for row in rows:
        texts = [t for _, _, t in row if not _WATERMARK.search(t) or len(t) > 30]
        if not texts:
            continue
        if stacked:
            line = " ".join(texts)
            f = _match_label(line, doc_type)
            if f and len(line) < 20:
                pending_label = f
                continue
            if pending_label:
                fields.setdefault(pending_label, []).append(line)
                pending_label = None
            continue
        left = " ".join(t for _, x, t in row if x < split and not _WATERMARK.fullmatch(t))
        right = " ".join(t for _, x, t in row if x >= split)
        right = re.sub(r"\b(NOT ?A ?VA[LI]*|NO[TI]?|VA[LI]?|DOCUM|ECIMEN ?-? ?NO\d?|HETIC'?S?)\b", "", right).strip()
        f = _match_label(left, doc_type) if left else None
        if f:
            if f == "address" and last_field == "address" and "place" in left.lower():
                fields.setdefault("address", []).append(right)
            else:
                fields.setdefault(f, []).append(right)
            last_field = f
        elif right and last_field == "address" and not left:
            fields["address"].append(right)
    out = {}
    for k, parts in fields.items():
        if k == "address":
            joined = "".join(p if i == 0 else (p if p[:1] in "-" else ("" if parts[i - 1][-1:].isalpha() and p[:1].islower() else " ") + p)
                             for i, p in enumerate(parts))
            out[k] = _clean_value(joined)
        else:
            out[k] = _clean_value(" ".join(parts))
    return {k: v for k, v in out.items() if v}


# ---------------------------------------------------------------- identifier repair

_TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6", "T": "7"}
_TO_ALPHA = {v: k for k, v in {"O": "0", "I": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}.items()}
_GSTIN_SHAPE = "DDAAAAADDDDA?Z?"  # D digit, A letter, ? alnum


def repair_gstin(token: str) -> Optional[str]:
    t = re.sub(r"[^A-Z0-9]", "", token.upper())
    if len(t) != 15:
        return None
    chars = list(t)
    for i, shape in enumerate(_GSTIN_SHAPE):
        c = chars[i]
        if shape == "D" and not c.isdigit():
            chars[i] = _TO_DIGIT.get(c, c)
        elif shape == "A" and not c.isalpha():
            chars[i] = _TO_ALPHA.get(c, c)
        elif shape == "Z" and c != "Z":
            chars[i] = "Z" if c in "27" else c
    g = "".join(chars)
    if GSTIN_RE.match(g) and gstin_check_char(g[:14]) == g[14]:
        return g
    # The monospace "dotted zero" is often read as 6/8 and 9 as 3 under the
    # watermark. Only the 2-digit state code is retried, and a candidate is
    # accepted only if it is a real state AND the checksum then passes.
    from .registry import STATE_CODES
    conf = {"0": "689", "6": "08", "8": "06", "3": "98", "9": "30", "1": "7", "7": "1", "2": "7", "5": "6"}
    for i in (0, 1):
        for alt in conf.get(g[i], ""):
            cand = g[:i] + alt + g[i + 1:]
            if cand[:2] in STATE_CODES and GSTIN_RE.match(cand) and gstin_check_char(cand[:14]) == cand[14]:
                return cand
    # try fixing the check character / entity char with common confusions
    for i in (12, 14):
        for alt in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            cand = g[:i] + alt + g[i + 1:]
            if GSTIN_RE.match(cand) and gstin_check_char(cand[:14]) == cand[14] and _close(t[i], alt):
                return cand
    return g if GSTIN_RE.match(g) else None


def _close(a: str, b: str) -> bool:
    groups = ["0OQD", "1IL", "2Z", "5S", "8B", "6G", "7T"]
    return a == b or any(a in g and b in g for g in groups)


def find_gstin(texts: List[str]) -> Optional[str]:
    """Pick the best GSTIN candidate across OCR passes.

    Preference: passes checksum > has a real state code > anything with the
    right shape. Characters are only coerced by position (e.g. O->0 where a
    digit must be), never "corrected" towards a registry value, so a genuine
    typo on the certificate is still reported as a typo.
    """
    from .registry import STATE_CODES
    cands = []
    for t in texts:
        for tok in re.findall(r"[0-9A-Z]{15,17}", t.upper().replace(" ", "")):
            for start in range(0, len(tok) - 14):
                g = repair_gstin(tok[start:start + 15])
                if g:
                    cands.append(g)
    if not cands:
        return None
    ok = [g for g in cands if gstin_check_char(g[:14]) == g[14]]
    if ok:
        return ok[0]
    real_state = [g for g in cands if g[:2] in STATE_CODES]
    return (real_state or cands)[0]


def find_udyam(texts: List[str]) -> Optional[str]:
    for t in texts:
        m = re.search(r"[UL][DO]?YAM\s*[-–]?\s*([A-Z]{2})\s*[-–]?\s*([0-9OI]{2})\s*[-–]?\s*([0-9OISB]{7})", t.upper())
        if m:
            dig = lambda s: "".join(_TO_DIGIT.get(c, c) for c in s)
            return f"UDYAM-{m.group(1)}-{dig(m.group(2))}-{dig(m.group(3))}"
    return None


# ---------------------------------------------------------------- public API

def ocr_extract(img: np.ndarray, hint: Optional[str]) -> dict:
    straight, angle = deskew(img)
    cleaned = remove_watermark(straight)
    boxes = _run_ocr(cleaned)
    raw_boxes = _run_ocr(straight) if hint in ("gst_certificate", "udyam_certificate", None) else []
    all_text = " ".join(b[3] for b in boxes + raw_boxes)
    doc_type = detect_type(all_text) or hint
    fields = _pair_fields(boxes, doc_type, cleaned.shape[1]) if doc_type in LABELS else {}
    texts = [b[3] for b in raw_boxes] + [b[3] for b in boxes]
    if doc_type == "gst_certificate":
        g = find_gstin(texts)
        if g:
            fields["gstin"] = g
        elif "gstin" in fields:
            fields.pop("gstin")
    if doc_type == "udyam_certificate":
        u = find_udyam(texts)
        if u:
            fields["udyam_number"] = u
        else:
            fields.pop("udyam_number", None)
    if doc_type == "signatory_id" and "name" in fields:
        fields["name"] = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", fields["name"])
    for k in ("bill_date", "valid_till", "date_of_liability", "date_of_registration"):
        if k in fields:
            m = re.search(r"(\d{4})[-./ ]?(\d{2})[-./ ]?(\d{2})", fields[k])
            fields[k] = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else fields[k]
    return {"doc_type": doc_type, "fields": fields, "engine": "rapidocr (local)", "deskew_angle": round(angle, 1)}


_LLM_SYSTEM = (
    "You extract fields from Indian business KYC documents (synthetic specimens for a hackathon; the pink "
    "'SYNTHETIC SPECIMEN' watermark is expected - ignore it). Return ONLY JSON: "
    '{"doc_type": "gst_certificate|udyam_certificate|signatory_id|address_proof|other", '
    '"legible": true|false, "fields": {...}}. Field keys by type - '
    "gst_certificate: gstin, legal_name, trade_name, constitution, address, date_of_liability, registration_type; "
    "udyam_certificate: udyam_number, enterprise_name, major_activity, city, state, date_of_registration; "
    "signatory_id: name, designation, business_name, id_number, valid_till; "
    "address_proof: consumer_number, billed_to, address, bill_date, units, amount_due. "
    "Copy values exactly as printed (dates as YYYY-MM-DD, join wrapped address lines into one string). "
    "If a field is blank, missing or unreadable use null - never guess or invent a value. "
    "Set legible=false if the image is too blurry to read reliably."
)


def extract(data: bytes, hint: Optional[str] = None) -> dict:
    img = decode(data)
    sharp = sharpness(img)
    quality = {"sharpness": round(sharp, 1), "blurry": sharp < BLUR_THRESHOLD,
               "width": int(img.shape[1]), "height": int(img.shape[0])}
    result = None
    if config.KYC_USE_LLM and llm.status()["enabled"]:
        ok, buf = cv2.imencode(".png", img)
        resp = llm.ask_json(_LLM_SYSTEM, f"Expected document type: {hint or 'unknown'}. Extract the fields.",
                            image=buf.tobytes() if ok else data, mime="image/png")
        if resp and isinstance(resp.get("fields"), dict):
            fields = {k: str(v).strip() for k, v in resp["fields"].items() if v not in (None, "", "null")}
            if "gstin" in fields:
                fixed = repair_gstin(fields["gstin"])
                fields["gstin"] = fixed or fields["gstin"]
            result = {"doc_type": resp.get("doc_type") or hint, "fields": fields,
                      "engine": f"{llm.status()['provider']} vision", "deskew_angle": None}
            if resp.get("legible") is False:
                quality["blurry"] = True
    if result is None:
        if quality["blurry"]:
            result = {"doc_type": hint, "fields": {}, "engine": "rapidocr (local)", "deskew_angle": None}
        else:
            result = ocr_extract(img, hint)
    result["quality"] = quality
    return result
