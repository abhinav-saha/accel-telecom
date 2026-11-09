"""The bundle engine must always respect the catalogue rules (eligibility, dependencies, budget)."""
import pytest

from backend import rules

SCENARIOS = {
    "kirana_no_gst_tight_budget": dict(segment="micro", city_tier=2, employees=2, sites=1, has_gstin=False,
                                       needs=["payments", "whatsapp", "cctv"], budget=1500),
    "kirana_no_gst": dict(segment="micro", city_tier=2, employees=2, sites=1, has_gstin=False,
                          needs=["payments", "whatsapp", "cctv"]),
    "salon_no_fibre": dict(segment="micro", city_tier=2, employees=4, sites=1, has_gstin=True,
                           needs=["wifi", "cctv", "uptime"], no_fibre=True),
    "restaurant_chain_6_sites": dict(segment="multi", city_tier=1, employees=60, sites=6, has_gstin=True,
                                     needs=["payments", "cctv", "uptime", "wifi", "calls"]),
    "factory_120": dict(segment="mfg", city_tier=2, employees=120, sites=1, has_gstin=True,
                        needs=["machines", "security", "vehicles"]),
    "factory_no_gst": dict(segment="mfg", city_tier=2, employees=15, sites=1, has_gstin=False,
                           needs=["machines", "security"]),
    "clinic_tier1_25": dict(segment="prof", city_tier=1, employees=25, sites=1, has_gstin=True,
                            needs=["email", "security", "calls"]),
    "clinic_tier2_25": dict(segment="prof", city_tier=2, employees=25, sites=1, has_gstin=True,
                            needs=["email", "security"]),
    "ca_firm_no_gst": dict(segment="prof", city_tier=1, employees=4, sites=1, has_gstin=False,
                           needs=["calls", "whatsapp", "website"]),
    "coaching_2_sites": dict(segment="prof", city_tier=2, employees=8, sites=2, has_gstin=True,
                             needs=["email", "website", "whatsapp"]),
}


def _on(rec):
    return [i for i in rec["items"] if i["on"]]


@pytest.mark.parametrize("name", SCENARIOS)
def test_every_recommended_product_is_eligible(name):
    profile = SCENARIOS[name]
    rec = rules.recommend(profile)
    ids = [i["product_id"] for i in _on(rec)]
    for pid in ids:
        assert rules.eligibility_issues(pid, profile, ids) == [], f"{pid} not eligible in {name}"
    quote = rules.build_quote(rec["items"], profile, rec["term"])
    assert quote["valid"], quote["issues"]


@pytest.mark.parametrize("name", SCENARIOS)
def test_bundle_always_has_connectivity(name):
    rec = rules.recommend(SCENARIOS[name])
    assert set(i["product_id"] for i in _on(rec)) & set(rules.CONNECTIVITY_CORE)


def test_gst_only_products_are_excluded_with_a_reason():
    rec = rules.recommend(SCENARIOS["kirana_no_gst"])
    excluded = {x["product_id"]: x["why_not"] for x in rec["excluded"]}
    assert "P15" in excluded and "GSTIN" in excluded["P15"]


def test_one_gig_fibre_is_tier1_only():
    assert rules.recommend(SCENARIOS["clinic_tier1_25"])["connectivity"] == "P03"
    assert rules.recommend(SCENARIOS["clinic_tier2_25"])["connectivity"] != "P03"


def test_budget_trims_extras():
    profile = SCENARIOS["kirana_no_gst_tight_budget"]
    rec = rules.recommend(profile)
    assert rules.build_quote(rec["items"], profile, rec["term"])["monthly"] <= profile["budget"]
    assert rec["budget_trimmed"]


def test_no_fibre_gets_airfiber():
    assert rules.recommend(SCENARIOS["salon_no_fibre"])["connectivity"] == "P04"


def test_multi_site_gets_sdwan_and_per_site_quantities():
    rec = rules.recommend(SCENARIOS["restaurant_chain_6_sites"])
    qty = {i["product_id"]: i["qty"] for i in _on(rec)}
    assert "P10" in qty and qty[rec["connectivity"]] == 6


def test_contract_term_respects_minimum_contract():
    rec = rules.recommend(SCENARIOS["factory_120"])  # leased line 100 needs 24 months
    quote = rules.build_quote(rec["items"], SCENARIOS["factory_120"], 12)
    assert quote["term"] >= 24 and 12 not in quote["allowed_terms"]


def test_longer_contract_is_never_more_expensive():
    profile = SCENARIOS["coaching_2_sites"]
    rec = rules.recommend(profile)
    prices = [rules.build_quote(rec["items"], profile, t)["monthly"] for t in (12, 24, 36)]
    assert prices[0] >= prices[1] >= prices[2]
