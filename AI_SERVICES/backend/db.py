"""Tiny SQLite store for advisor sessions, consents, KYC results and orders.

Only masked identifiers and extracted fields are stored - never raw document
images (they are processed in memory and discarded).
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

from .config import DB_PATH

_lock = threading.Lock()
_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_conn.executescript(
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, created REAL, updated REAL, data TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, session_id TEXT, created REAL, phone_last4 TEXT, data TEXT
    );
    CREATE TABLE IF NOT EXISTS audit (
        ts REAL, session_id TEXT, event TEXT, detail TEXT
    );
    """
)


def save_session(sid: str, data: Dict[str, Any]) -> None:
    now = time.time()
    with _lock:
        _conn.execute(
            "INSERT INTO sessions(id, created, updated, data) VALUES(?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET updated=excluded.updated, data=excluded.data",
            (sid, data.get("created", now), now, json.dumps(data)),
        )
        _conn.commit()


def load_session(sid: str) -> Optional[Dict[str, Any]]:
    row = _conn.execute("SELECT data FROM sessions WHERE id=?", (sid,)).fetchone()
    return json.loads(row["data"]) if row else None


def all_sessions() -> List[Dict[str, Any]]:
    rows = _conn.execute("SELECT id, created, updated, data FROM sessions ORDER BY updated DESC").fetchall()
    out = []
    for r in rows:
        d = json.loads(r["data"])
        d["id"], d["updated"] = r["id"], r["updated"]
        out.append(d)
    return out


def save_order(order: Dict[str, Any]) -> None:
    with _lock:
        _conn.execute(
            "INSERT INTO orders(id, session_id, created, phone_last4, data) VALUES(?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            (order["id"], order.get("session_id"), order.get("created_ts", time.time()),
             order.get("phone_last4", ""), json.dumps(order)),
        )
        _conn.commit()


def load_order(oid: str) -> Optional[Dict[str, Any]]:
    row = _conn.execute("SELECT data FROM orders WHERE id=?", (oid.upper(),)).fetchone()
    return json.loads(row["data"]) if row else None


def all_orders() -> List[Dict[str, Any]]:
    return [json.loads(r["data"]) for r in _conn.execute("SELECT data FROM orders ORDER BY created DESC")]


def audit(session_id: str, event: str, detail: str = "") -> None:
    """Audit trail of consent and KYC events - detail must already be masked."""
    with _lock:
        _conn.execute("INSERT INTO audit VALUES(?,?,?,?)", (time.time(), session_id, event, detail))
        _conn.commit()


def audit_for(session_id: str) -> List[Dict[str, Any]]:
    rows = _conn.execute("SELECT ts, event, detail FROM audit WHERE session_id=? ORDER BY ts", (session_id,))
    return [dict(r) for r in rows]


def purge_abandoned(max_age_days: int = 30) -> int:
    """Retention rule: delete sessions with no order after `max_age_days`."""
    cutoff = time.time() - max_age_days * 86400
    with _lock:
        cur = _conn.execute(
            "DELETE FROM sessions WHERE updated < ? AND id NOT IN (SELECT session_id FROM orders WHERE session_id IS NOT NULL)",
            (cutoff,))
        _conn.commit()
        return cur.rowcount
