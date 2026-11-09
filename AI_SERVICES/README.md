# Udyam Digital: Accel Business SMB onboarding (YTL Hackathon 2026 · Track A)

A working prototype of a **digital-first acquisition and onboarding journey** for small businesses. On a phone and in their own language, an owner can discover the right bundle, see one transparent monthly price, finish KYC and track activation, without a sales visit.

Everything runs on **free tiers**. With no API key at all, the app still works end to end (rule-based language understanding + on-device OCR).

| Deliverable | Where |
|---|---|
| Working prototype (code) | this repository: `frontend/` (web app) + `backend/` (Python API) |
| Solution architecture diagram | [docs/architecture.png](docs/architecture.png) ([SVG](docs/architecture.svg)) |
| Business case (10 slides, on the SYNC template) | [docs/Udyam_Digital_Business_Case.pptx](docs/Udyam_Digital_Business_Case.pptx) |
| 1-page privacy & security note | [docs/privacy_note.pdf](docs/privacy_note.pdf) |
| 3-minute demo video script | [docs/demo_script.md](docs/demo_script.md) |

---

## Run it on your computer

### 1. Install once

| You need | Why | Get it |
|---|---|---|
| **Python 3.9-3.12** (3.12 recommended) | Runs the backend. The OCR engine does not support 3.13+ yet. | <https://www.python.org/downloads/>. On Windows, tick **"Add python.exe to PATH"** during setup. |
| **Google Chrome** (or Edge) | Best browser for the app; voice input needs it | <https://www.google.com/chrome/> |
| Internet connection | First-time package download (~400 MB) and page styling (Tailwind CDN) | |

Nothing else (no Node, no database server, no Docker).

### 2. Start the app

Unzip `udyam-digital.zip`, then:

**macOS / Linux**: open Terminal in the `udyam-digital` folder and run
```bash
./run.sh
```

**Windows**: double-click **`run.bat`** (or run `run.bat` in Command Prompt inside the folder).

The first run creates a virtual environment in `.venv` and installs the packages (2-5 minutes). Later runs start in a few seconds. When you see `Uvicorn running on ...`, open:

- Customer app: <http://localhost:8000>
- Back-office for sales & partners: <http://localhost:8000/admin> (PIN `2026`)

Stop the server with `Ctrl+C`. To use another port on macOS/Linux, run `PORT=8001 ./run.sh`.

### 3. Troubleshooting

| Problem | Fix |
|---|---|
| `Python 3.9-3.12 is required` | Install Python 3.12 and run again. If an older attempt failed, delete the `.venv` folder first. |
| `permission denied: ./run.sh` | Run `chmod +x run.sh` once, or start it with `bash run.sh`. |
| `address already in use` | Something else uses port 8000: stop it, or use `PORT=8001 ./run.sh`. |
| Page loads without colours/layout | No internet: the CSS framework loads from a CDN. |
| Microphone button does nothing | Use Chrome/Edge on `localhost` and allow microphone access. |
| Start from a clean slate (no old chats/orders) | Stop the server and delete the `var` folder. |

### Optional: switch on GenAI (free)

The app works fully without any key. To add GenAI:

1. Get a free Gemini key at <https://aistudio.google.com/apikey> (sign in with a Google account, then "Create API key").
2. Open the `.env` file in the project folder (created on first run; on macOS it is hidden, so press `Cmd+Shift+.` in Finder or open it from your editor) and set `GEMINI_API_KEY=your_key`.
3. Stop the server (`Ctrl+C`) and start it again. The side panel should show **"GenAI on: gemini · gemini-3.5-flash-lite"**.

Keep the key private: never commit or share `.env` (it is excluded from git and from the submission zip).

With a key, the advisor understands open-ended messages in any of the 10 languages, answers product questions, and writes the "why this bundle" explanation in the owner's language. Groq (`GROQ_API_KEY`) works as an alternative. The badge on the left panel shows which mode is active.

- **Model:** `gemini-3.5-flash-lite` by default. It answers in about 2 seconds and has its own free quota. Larger models such as `gemini-3.5-flash` allow only about 20 free requests per day, which a single demo can use up.
- **KYC documents are read locally by default** with RapidOCR. It is accurate on all 12 specimens and document images never leave the machine. Set `KYC_USE_LLM=true` in `.env` to use the LLM's vision model instead.
- **Quota safety:** if the free quota runs out (HTTP 429), the app pauses LLM calls (up to 15 minutes), carries on in rules mode and shows "GenAI paused" in the side panel. A demo never stalls.

---

## What the prototype does (mapped to the brief)

| Brief asks for | What we built |
|---|---|
| **Advisor**: GenAI assistant that asks about the business and recommends a bundle, explaining why | Chat with quick-reply chips, free text or **voice** (Web Speech API) in **10 languages**. It asks 8 questions (type, city, staff, sites, GST, current internet, needs, budget). Typing a **GSTIN auto-fills** the business from the mock registry. A **deterministic rules engine** builds the bundle (city tier, min employees/sites, GSTIN requirement, product dependencies, budget). The LLM only understands and explains, so it can never recommend an ineligible product. You can refine in chat: "remove CCTV", "add 4 cameras", "make it cheaper". |
| **Quote & checkout**: one transparent monthly price with toggles | Single monthly price (+GST), first bill, setup fee and go-live date. Add-ons toggle on/off with quantity steppers. Choose **12/24/36 months** (longer = cheaper, within the catalogue price band). Switch connectivity (e.g. 5G AirFiber where fibre isn't available). "Not available for you" items explain why. Share on WhatsApp. |
| **Smart KYC**: upload + extraction + validation, mocked GSTIN/Udyam lookups, clear consent screen | DPDP consent screen (itemised purposes, retention, rights, withdraw = erase), then GSTIN/Udyam lookup with live checksum validation. Camera upload or "DigiLocker (simulated)" for the specimen files. OCR pipeline: blur check → deskew → watermark removal → OCR → GSTIN checksum repair. 20+ checks against the registries, each with a plain "what to fix". Simulated Aadhaar OTP e-sign. |
| **Tracker**: order status the owner can check instead of calling | Timeline with ETAs from `typical_install_days`, per-product status, installer (local partner or field team), one support number, WhatsApp-style update feed. Lookup by order ID + last 4 digits of the mobile. |
| *Stretch:* voice / WhatsApp front end | Voice input and spoken replies in the browser; WhatsApp share of the quote and WhatsApp-style updates. |
| *Stretch:* back-office for sales/partners with leads the advisor could not close | `/admin`: funnel, segments, drop reasons → digital fix, **advisor hand-offs** (abandoned sessions, KYC issues, callback requests) routed to partner / inside sales / field sales. |
| *Stretch:* propensity score for which leads to call | Logistic regression on lead-time features only (no leakage), **hold-out AUC 0.745**. Ranked call list of dropped leads with next-best action per drop reason. |

### Smart KYC on the 12 specimen applicants (no LLM, local OCR)

| Applicant | Result | Finding |
|---|---|---|
| K01 | ⛔ | GSTIN **cancelled** in registry; Udyam number blank on certificate |
| K02 | ✅ | Tilted photo auto-straightened (~7°), all checks pass |
| K03 | ✅ | Not confused with the same-name business in Bengaluru |
| K04 | ⛔ | GST certificate **too blurry**: re-upload |
| K05 | ⛔ | Udyam certificate **missing** |
| K06 | ⛔ | GSTIN on certificate **fails checksum**; registry match suggested |
| K07 | ⛔ | Legal name on certificate **differs from registry** (edited) |
| K08-K10 | ✅ | All checks pass |
| K11 | ⛔ | Electricity bill **257 days old** (limit 90, "today" = 2026-07-15) |
| K12 | ✅ | Not confused with same-name firms in 3 other cities |

---

## Demo walkthrough

1. Open <http://localhost:8000>, pick **हिंदी**, tap *Start*.
2. Type `नागपुर में मेरा डेंटल क्लिनिक है, 10 लोग काम करते हैं` and the advisor fills type, city and staff. Tap through the rest.
   Or type a GSTIN such as `27XUIXG0767D1ZP` to auto-fill a business.
3. See the bundle (~₹6,815/month), tap *Customise & buy*, toggle add-ons, try 24 months.
4. KYC: accept consent → *Fetch* GSTIN → **Documents**: choose `K07`, tap *Fetch via DigiLocker*, then *Verify*. The edited certificate gets caught. Switch to `K03` → verified → enter any name, a 10-digit mobile and any 6-digit OTP → order placed.
5. Tracker: tap *Simulate next day* to watch services go live.
6. Open `/admin` (PIN `2026`) to see the funnel, the ranked call list and your abandoned session under *Advisor hand-offs*.

Judges' scenarios to try: no-GST kirana asking for WhatsApp (excluded, with reason), tier-2 clinic with 25 staff (no 1 Gbps fibre: tier-1 only), "no fibre in my area" (5G AirFiber), budget "Under ₹1,500" (extras trimmed), 6-site restaurant chain (SD-WAN + per-site failover).

---

## Project structure

The code is split into two folders: **`frontend/`** runs in the browser, **`backend/`** is the Python server. The frontend talks to the backend only through JSON calls to `/api/...`. For a one-command demo, the backend also serves the frontend files (at `/` and `/frontend/...`), so a single server runs both.

```
frontend/                  ← what the user sees (HTML, CSS, JavaScript)
  index.html     customer app shell (advisor, quote, KYC, tracker)
  app.js         customer app logic: screens, chat, voice, calls to /api/*
  styles.css     shared styles
  admin.html     back-office dashboard for sales & partners (HTML + JS)

backend/                   ← Python API server (FastAPI)
  main.py        FastAPI routes, consent/erasure, masking, security headers
  config.py      paths, settings, .env loading
  advisor.py     dialogue manager, rule NLU (Hindi/Hinglish), LLM NLU, refinement
  rules.py       eligibility, dependencies, bundle builder, term pricing, quote
  i18n.py        question bank in 10 languages, chips (EN/HI/MR)
  registry.py    GSTIN checksum, mock GSTIN/Udyam lookups, masking helpers
  ocr.py         blur check, deskew, watermark removal, RapidOCR (optional LLM vision)
  kyc.py         20+ cross-document checks with fix-it messages
  orders.py      orders, ETAs, partner assignment, tracker view
  analytics.py   funnel/segment KPIs, propensity model, call list, hand-offs
  llm.py         Gemini / Groq free-tier client with silent fallback
  db.py          SQLite: sessions, orders, consent audit log, retention purge
  data.py        loads the CSVs (catalogue, registries, leads)

data/                      ← provided synthetic dataset (catalogue, registries, leads, KYC specimens)
tests/                     ← automated tests (pytest)
docs/                      ← architecture, privacy note, business case deck, demo script, screenshots
scripts/make_submission.sh ← builds a clean dist/udyam-digital.zip
run.sh / run.bat           ← one-command start (macOS-Linux / Windows)
```

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

57 tests, about 70 seconds. They run against a throwaway database and never call an LLM:

| File | What it proves |
|---|---|
| `tests/test_rules.py` | 10 customer scenarios: every recommended product is eligible (tier, size, GSTIN, dependencies), budget is respected, 1 Gbps fibre is tier-1 only, no-fibre gets AirFiber, longer contracts are never dearer |
| `tests/test_kyc.py` | All 12 specimen applicants (K01-K12) get the expected verdict and the planted problems are caught |
| `tests/test_api.py` | Full journey over HTTP: advisor → quote → consent gate → KYC → e-sign → order → tracker, plus back-office PIN |
| `tests/test_registry.py` | GSTIN checksum holds for all 3,534 registry records, typos are caught, identifiers are masked |
| `tests/test_advisor_nlu.py` | English, Hinglish and Devanagari sentences fill the right profile fields without an LLM; a question is never read as "yes"; bad quick-reply values don't crash |
| `tests/test_llm.py` | When the free quota runs out (HTTP 429) the app pauses LLM calls and keeps working in rules mode |

## Building the submission zip

```bash
./scripts/make_submission.sh      # → dist/udyam-digital.zip (~11 MB)
```

The zip holds the code, data, docs and tests. It excludes the virtualenv, `.env` (API keys), runtime data and caches.

**Tech stack:** Python 3.9 · FastAPI · scikit-learn · RapidOCR (ONNX) + OpenCV · SQLite · vanilla JS + Tailwind (CDN) · Google Gemini 3.5 Flash-Lite / Groq (free tier, optional) · Web Speech API.

## Privacy in one paragraph

Consent is taken before any document is touched. Images are processed in memory and never stored. Raw extracted fields are deleted right after verification, and only masked identifiers and check results are kept. GSTIN, ID numbers and phone numbers are masked in the UI, logs and back-office. Identifiers travel in POST bodies, never URLs. Abandoned sessions are purged after 30 days. Details: [docs/privacy_note.pdf](docs/privacy_note.pdf).

## Known limitations (prototype)

- DigiLocker, Aadhaar e-sign, UPI and WhatsApp delivery are **simulated**. The pilot would integrate the real APIs.
- Static UI text is in English and Hindi; advisor questions are in 10 languages; quick-reply labels are in EN/HI/MR (other languages show English labels).
- Without an LLM key, free-text understanding is keyword-based. Quick-reply chips always work.
- The Tailwind Play CDN is used for speed of building; production would compile CSS.

All businesses, people and identifiers are fictional (synthetic hackathon data).
