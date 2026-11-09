"""Smart KYC on the 12 specimen applicants, using local OCR only (no LLM).

Expected outcomes were established by inspecting each document against the mock
registries; the README in data/ says "some have problems your Smart KYC should catch".
"""
import pytest

from backend.config import KYC_DIR
from backend.kyc import verify
from backend.ocr import DOC_TYPES, extract

EXPECTED = {
    "K01": {"gstin_status", "udyam_on_cert"},       # GSTIN cancelled; Udyam number blank
    "K02": set(),                                   # tilted photo - must still verify
    "K03": set(),                                   # same-name business in another city
    "K04": {"gst_certificate_quality"},             # blurry GST certificate
    "K05": {"udyam_certificate_present"},           # Udyam certificate missing
    "K06": {"gstin_format"},                        # GSTIN typo on certificate
    "K07": {"gst_legal_name"},                      # edited legal name
    "K08": set(), "K09": set(), "K10": set(),
    "K11": {"addr_date"},                           # bill older than 90 days
    "K12": set(),                                   # same-name businesses in other cities
}


def _docs(applicant):
    docs = {}
    for doc_type in DOC_TYPES:
        path = KYC_DIR / f"{applicant}_{doc_type}.png"
        if path.exists():
            docs[doc_type] = extract(path.read_bytes(), doc_type)
    return docs


@pytest.mark.parametrize("applicant", sorted(EXPECTED))
def test_specimen_applicant(applicant):
    result = verify("", "", _docs(applicant), consent=True)
    failed = {c["id"] for c in result["checks"] if c["status"] == "fail"}
    expected = EXPECTED[applicant]
    if expected:
        assert expected <= failed, f"{applicant}: expected {expected}, got {failed}"
        assert result["status"] == "action_required"
    else:
        assert failed == set(), f"{applicant}: unexpected failures {failed}"
        assert result["status"] == "verified"


def test_kyc_requires_consent():
    result = verify("27XUIXG0767D1ZP", "", {}, consent=False)
    assert any(c["id"] == "consent" and c["status"] == "fail" for c in result["checks"])
