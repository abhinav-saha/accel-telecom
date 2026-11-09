from backend.data import gstin_registry
from backend.registry import (lookup_gstin, lookup_udyam, mask_gstin, mask_phone, proprietor_name,
                              validate_gstin_format, validate_udyam_format)


def test_every_registry_gstin_passes_checksum():
    bad = [g for g in gstin_registry() if not validate_gstin_format(g)["valid"]]
    assert bad == []


def test_typo_in_gstin_is_detected():
    # K06's certificate: one digit differs from the registry record 08YKZXS5189L1ZO
    result = validate_gstin_format("08YKZXS8189L1Z0")
    assert not result["valid"]
    assert "Check character" in result["errors"][0]


def test_lookup_reports_cancelled_status():
    r = lookup_gstin("37IHKXV5167L1ZS")
    assert r["found"] and r["status"] == "Cancelled" and not r["active"]


def test_udyam_lookup_and_format():
    assert lookup_udyam("UDYAM-MH-00-9516696")["city"] == "Nagpur"
    assert not validate_udyam_format("UDYAM-MH-9516696")["valid"]


def test_masking_hides_identifiers():
    assert mask_gstin("27XUIXG0767D1ZP") == "27XXXXXXXX7D1ZP"
    assert mask_phone("98765 43210") == "XXXXXX3210"


def test_proprietor_name_parsing():
    assert proprietor_name("Joseph Singh (Prop. Ganesh Woodcraft)") == "Joseph Singh"
    assert proprietor_name("Kaveri Stays LLP") == ""
