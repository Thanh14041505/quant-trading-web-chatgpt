# VNStock Local Adapter for Quant Trading Web

A small local FastAPI adapter that exposes the official/community `vnstock` Python library through CORS-enabled JSON endpoints expected by the Quant Trading Web app. It does **not** deploy a server and does not use Render/Railway/Postgres/Redis.

## Important architecture note

`vnstock` is a Python library, not a hosted generic REST URL that can be pasted directly into the React settings page. This adapter runs locally on your PC and bridges Python DataFrames to JSON. The React app remains a frontend app; the optional local adapter is a separate process.

It is intended for local personal research. It is bound to `127.0.0.1` and should not be exposed to the public internet.

## 1. Prerequisites

- Python 3.12 recommended.
- The Quant Trading Web Vite app runs locally on `http://localhost:5173`.
- Your VNStock Community API key from `https://vnstocks.com/login`.

## 2. Install on Windows PowerShell

Open a **second** PowerShell window (leave the frontend's `npm run dev` running) and move to the folder containing this adapter:

```powershell
cd path\to\vnstock-local-adapter
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell blocks activation, you can avoid changing the execution policy by invoking the venv's Python directly:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 3. Configure your VNStock API key

If your VNStock key is already stored in the VNStock Python configuration on **this same Windows user account**, skip this step.

Otherwise run:

```powershell
python setup_vnstock_key.py
```

Paste the key into the hidden prompt. The script uses VNStock's `change_api_key()` and `check_status()` helpers. The key is not placed in React, localStorage, or a browser request.

Alternative: copy `.env.example` to `.env`, put the key in `VNSTOCK_API_KEY`, and keep `.env` local. Do not commit or share `.env`; a real key can grant quota to your account.

## 4. Start the adapter

From the adapter folder, with the venv active:

```powershell
uvicorn main:app --host 127.0.0.1 --port 8000
```

Keep that terminal open. You should see Uvicorn listening on `http://127.0.0.1:8000`.

Quick checks in a browser:

- `http://127.0.0.1:8000/` — adapter status
- `http://127.0.0.1:8000/docs` — local interactive docs
- `http://127.0.0.1:8000/api/health` — health endpoint
- `http://127.0.0.1:8000/api/stocks/HAH/history?startDate=2026-01-01&endDate=2026-10-09&timeframe=1D` — OHLCV sample
- `http://127.0.0.1:8000/api/stocks/HAH/quote` — latest quote endpoint

The history endpoint will return an error if the upstream source, API key, symbol, or quota is unavailable; that is different from the local health endpoint succeeding.

## 5. Connect the existing React app

Open `http://localhost:5173/settings`.

1. Choose **CORS JSON Provider**.
2. Set **Base URL** to `http://127.0.0.1:8000`.
3. Set **Auth Scheme** to `No auth` (the key is configured inside the local Python library; do not paste it into the React API Key field).
4. Keep the default paths:
   - Health: `/api/health`
   - Historical OHLCV: `/api/stocks/{symbol}/history`
   - Company: `/api/stocks/{symbol}/company`
   - Fundamentals: `/api/stocks/{symbol}/fundamentals`
   - Index History: `/api/index/{symbol}/history`
5. Save the provider and click **Test Connection**.
6. In Data Smoke Test, enter `HAH` and choose **Fetch Sample**.

A successful health check means the local adapter is running. Fetch Sample is the meaningful check that proves the VNStock upstream is returning parsable data.

## 6. Available endpoints

- `GET /api/health`
- `GET /api/stocks/{symbol}/history?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&timeframe=1D`
- `GET /api/index/{symbol}/history?...`
- `GET /api/stocks/{symbol}/quote`
- `GET /api/quotes?symbols=HAH,GMD,VCB` (batch quote)
- `GET /api/stocks/{symbol}/company`
- `GET /api/stocks/{symbol}/fundamentals`

Historical rows are normalized to `{ symbol, date, open, high, low, close, volume, value? }`. Responses are JSON under `data` so the existing HTTP JSON provider can read them.

## 7. Rate limits and real-time expectations

The VNStock Community tier currently documents a limit of up to 60 requests/minute with a registered key. The adapter caches history for 20 seconds, quotes for 3 seconds, company info for 6 hours and fundamentals for 1 hour, and spaces upstream calls by default. This protects quota but means a scan across hundreds/thousands of symbols can take time; start with a custom list of 10–30 symbols.

`/quote` is the endpoint for latest quote snapshots. The current Quant Trading Web provider interface primarily consumes OHLCV/fundamentals; adding an always-refreshing live quote panel or WebSocket-style stream is a separate app enhancement. The Community library uses source-dependent REST updates and should not be treated as a guaranteed exchange-direct feed or zero-latency WebSocket.

## 8. Local vs Vercel deployment

This adapter is for the local Vite app. A publicly deployed HTTPS Vercel site cannot be expected to fetch `http://127.0.0.1:8000` from every visitor's machine. For a Vercel-hosted deployment, use a compatible hosted HTTPS API with supported CORS, or deliberately deploy a secured HTTPS adapter. That would be a separate architecture decision.

## Troubleshooting

- `Could not import vnstock`: activate the adapter virtual environment and reinstall `requirements.txt`.
- API key/rate issue: run `python setup_vnstock_key.py`, then `check_status()` in that script. The free Community quota is limited.
- `DATA_SOURCE_CORS_UNSUPPORTED`: make sure the adapter is running at `127.0.0.1:8000`; default CORS permits Vite localhost origins only.
- `/api/health` works but Fetch Sample fails: local app-to-adapter connectivity is okay; inspect the JSON error in `/api/stocks/HAH/history` and check upstream credential, source availability, or quota.
- Fundamental field is absent: this adapter only maps common metrics where available; unknown/missing values remain absent instead of being fabricated.

## Fast path with helper scripts

From a PowerShell terminal opened in this folder:

```powershell
.\install.ps1
.\setup-key.ps1   # skip if your key is already configured for this Python environment
.\start-adapter.ps1
```

After installation, `start-adapter.ps1` uses the project's `.venv` interpreter without needing to activate it.
