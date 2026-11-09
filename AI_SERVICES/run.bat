@echo off
REM One-command start (Windows): double-click this file, or run "run.bat" in a terminal.
REM Creates the virtualenv on first run, then serves the app on http://localhost:8000
cd /d "%~dp0"

if not exist .venv (
  echo First run: creating .venv and installing packages ^(2-5 minutes^)...
  REM The OCR engine supports Python 3.9-3.12; the "py" launcher picks an installed one.
  py -3.12 -m venv .venv 2>nul || py -3.11 -m venv .venv 2>nul || py -3.10 -m venv .venv 2>nul || py -3.9 -m venv .venv 2>nul || python -m venv .venv
  if not exist .venv\Scripts\python.exe (
    echo Python 3.9-3.12 is required. Install Python 3.12 from https://www.python.org/downloads/ and run again.
    pause
    exit /b 1
  )
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt
)

if not exist .env copy .env.example .env >nul
echo.
echo Customer app : http://localhost:8000
echo Back-office  : http://localhost:8000/admin   (PIN 2026)
echo Stop         : Ctrl+C
echo.
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
pause
