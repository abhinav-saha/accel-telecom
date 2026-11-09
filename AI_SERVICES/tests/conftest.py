"""Shared test setup: point the app at a throwaway SQLite file before it is imported."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["UDYAM_DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="udyam-test-")) / "test.db")
# Tests must be deterministic: never call a real LLM even if .env has a key.
os.environ["GEMINI_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
