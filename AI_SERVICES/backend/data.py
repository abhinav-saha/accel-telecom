"""Loads the synthetic dataset once and exposes typed lookups."""
from __future__ import annotations

import csv
from collections import Counter, defaultdict
from functools import lru_cache
from typing import Dict, List

from .config import DATA_DIR

SEGMENTS = {
    "micro": "Micro retail & services",
    "prof": "Professional offices",
    "multi": "Small multi-site businesses",
    "mfg": "Small manufacturers",
}
SEGMENT_CODE = {v: k for k, v in SEGMENTS.items()}


def _read(name: str) -> List[dict]:
    with open(DATA_DIR / name, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


@lru_cache(maxsize=1)
def catalogue() -> Dict[str, dict]:
    out = {}
    for r in _read("product_catalogue.csv"):
        out[r["product_id"]] = {
            "id": r["product_id"],
            "category": r["category"],
            "name": r["product_name"],
            "description": r["description"],
            "unit": r["unit"],
            "price_min": int(r["price_min_inr_per_month"]),
            "price_max": int(r["price_max_inr_per_month"]),
            "setup_fee": int(r["one_time_setup_inr"]),
            "min_contract": int(r["min_contract_months"]),
            "tiers": [int(t) for t in r["available_city_tiers"].split(";") if t],
            "min_employees": int(r["min_employees"]),
            "min_sites": int(r["min_sites"]),
            "requires_gstin": r["requires_gstin"] == "Y",
            "requires_one_of": [p for p in r["requires_one_of"].split("|") if p],
            "install_days": int(r["typical_install_days"]),
            "segments": [s for s in r["target_segments"].split(";") if s],
        }
    return out


@lru_cache(maxsize=1)
def gstin_registry() -> Dict[str, dict]:
    return {r["gstin"]: r for r in _read("mock_gstin_registry.csv")}


@lru_cache(maxsize=1)
def udyam_registry() -> Dict[str, dict]:
    return {r["udyam_number"]: r for r in _read("mock_udyam_registry.csv")}


@lru_cache(maxsize=1)
def leads() -> List[dict]:
    return _read("smb_leads.csv")


@lru_cache(maxsize=1)
def city_tiers() -> Dict[str, int]:
    tiers = {}
    for r in leads():
        tiers[r["city"]] = int(r["city_tier"])
    return dict(sorted(tiers.items()))


@lru_cache(maxsize=1)
def city_states() -> Dict[str, str]:
    return {r["city"]: r["state"] for r in leads()}


@lru_cache(maxsize=1)
def business_type_segments() -> Dict[str, str]:
    """Most common segment for each business type seen in the leads data."""
    counts: Dict[str, Counter] = defaultdict(Counter)
    for r in leads():
        counts[r["business_type"].lower()][SEGMENT_CODE[r["segment"]]] += 1
    return {bt: c.most_common(1)[0][0] for bt, c in counts.items()}
