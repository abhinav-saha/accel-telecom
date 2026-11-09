"""Paths, settings and environment loading (no external dotenv dependency)."""
from __future__ import annotations

import datetime as dt
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
KYC_DIR = DATA_DIR / "kyc_documents"
FRONTEND_DIR = ROOT / "frontend"
VAR_DIR = ROOT / "var"
DB_PATH = Path(os.getenv("UDYAM_DB_PATH", str(VAR_DIR / "udyam.db")))

# The dataset README fixes "today" for all date-based checks.
TODAY = dt.date(2026, 7, 15)
ADDRESS_PROOF_MAX_AGE_DAYS = 90
GST_RATE = 0.18


def _load_env_file() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
ADMIN_PIN = os.getenv("ADMIN_PIN", "2026")
# KYC documents are read on this machine by default (accurate on the specimens, and images never
# leave the server). Set KYC_USE_LLM=true to read them with the LLM's vision model instead.
KYC_USE_LLM = os.getenv("KYC_USE_LLM", "false").strip().lower() in ("1", "true", "yes")

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
