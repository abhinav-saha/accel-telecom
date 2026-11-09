"""End-to-end journey through the HTTP API: advisor -> quote -> consent -> KYC -> e-sign -> order -> tracker."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _answer(client, sid, value):
    r = client.post("/api/chat/message", json={"session_id": sid, "value": value})
    assert r.status_code == 200
    return r.json()


def test_full_customer_journey(client):
    start = client.post("/api/chat/start", json={"language": "hi"}).json()
    sid = start["session_id"]
    assert start["slot"] == "business_type"

    for value in ("clinic", "Nagpur", "10", "1", "yes", "Home broadband", "email,security,uptime"):
        _answer(client, sid, value)
    final = _answer(client, sid, "0")
    assert final["recommendation"] and final["quote"]["valid"]
    assert final["quote"]["monthly"] > 0

    items = [{"product_id": i["product_id"], "qty": i["qty"], "on": i["on"]} for i in final["recommendation"]["items"]]
    q = client.post("/api/quote", json={"session_id": sid, "items": items, "term": 24}).json()["quote"]
    assert q["term"] == 24 and q["monthly"] <= final["quote"]["monthly"]

    # Documents cannot be processed before consent
    r = client.post("/api/kyc/sample", json={"session_id": sid, "applicant": "K03"})
    assert r.status_code == 403
    client.post("/api/kyc/consent", json={"session_id": sid, "purposes": {"kyc": True, "updates": True, "marketing": False}})

    docs = client.post("/api/kyc/sample", json={"session_id": sid, "applicant": "K03"}).json()["documents"]
    assert all("XXXX" in d["fields"].get("gstin", "XXXX") for d in docs)   # masked in responses
    kyc = client.post("/api/kyc/verify", json={"session_id": sid}).json()
    assert kyc["status"] == "verified"

    assert client.post("/api/kyc/esign", json={"session_id": sid, "otp": "123456"}).status_code == 200
    order = client.post("/api/orders", json={"session_id": sid, "name": "Joseph", "phone": "9876543210"}).json()
    assert order["id"].startswith("UD") and order["phone_masked"] == "XXXXXX3210"

    assert client.get(f"/api/orders/{order['id']}?phone4=0000").status_code == 404   # wrong phone
    tracked = client.get(f"/api/orders/{order['id']}?phone4=3210").json()
    advanced = client.post(f"/api/orders/{order['id']}/advance?days=20").json()
    assert advanced["progress"] == 100 and tracked["progress"] < 100


def test_gstin_lookup_uses_post_body(client):
    r = client.post("/api/registry/gstin", json={"value": "27XUIXG0767D1ZP"}).json()
    assert r["found"] and r["trade_name"] == "Ganesh Woodcraft"


def test_back_office_requires_pin(client):
    assert client.get("/api/admin/summary").status_code == 401
    s = client.get("/api/admin/summary", headers={"x-admin-pin": "2026"}).json()
    assert s["kpis"]["leads"] == 5000 and s["kpis"]["activated"] == 368
    assert s["model"]["auc"] > 0.7
