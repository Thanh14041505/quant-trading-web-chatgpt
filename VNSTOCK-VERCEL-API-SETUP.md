# VNStock Python Functions for Quant Trading Web

This integration follows the existing project's file-based Vercel pattern: each Python handler under `/api` becomes a route, while `_vnstock_util.py` normalizes VNStock responses. See Vercel's current Python Functions docs: https://vercel.com/docs/functions/runtimes/python/api-directory

## Routes

- `GET /api/health` — function health only; this does not prove VNStock is reachable.
- `GET /api/ohlcv?symbol=HAH&start=2025-01-01&end=2026-10-08` — daily OHLCV.
- `GET /api/market_index?symbol=VNINDEX&start=2025-01-01&end=2026-10-08` — index OHLCV.
- `GET /api/company?symbol=HAH` — company overview best-effort normalization.
- `GET /api/fundamentals?symbol=HAH` — supported ratio fields; unavailable fields remain null.
- `POST /api/scan` — bounded sequential batch of up to 8 symbols.

Handlers accept both `start`/`end` and `startDate`/`endDate`, so they match the current React provider contract.

## Credential setup

Recommended for a deployed personal project:

1. In Vercel, open the project → Settings → Environment Variables.
2. Add `VNSTOCK_API_KEY` with the credential value.
3. Redeploy after changing environment variables.
4. Leave the Settings API key field empty; the backend reads the environment variable.

CORS allows same-origin requests by default. If the API must be called from a different frontend origin, set `ALLOWED_ORIGINS` in Vercel to a comma-separated allow-list of exact origins (for example `https://your-app.vercel.app`). CORS is not authentication; protect a personal deployment with Vercel Deployment Protection or another server-side access control.

The HTTP provider also supports `X-VNSTOCK-KEY` for a personal-use fallback. This sends the key from the browser, so it is visible in browser DevTools/network requests. Prefer the server environment variable and don't use the browser fallback for a public app.

## Local development

`npm run dev` starts Vite only; it does not execute Python files under `/api`. Use the Vercel CLI in the project root (`npx vercel dev`) to run the static frontend and Python Functions together. Once linked/configured, it typically serves the app at `http://localhost:3000`. You can also deploy a Preview and test `/api/health` there.

## Dependency caution — current as of 2026-10-10

PyPI currently shows the `vnstock` project as quarantined by PyPI admins since 2026-09-24, with a notice that it cannot be installed or modified until a security review is complete: https://pypi.org/project/vnstock/4.0.8/

To avoid silently creating a broken deployment or bypassing that review, this patch includes `.python-version` set to `3.12` but does not add a new `requirements.txt` or `pyproject.toml` dependency manifest. Copy the known-working dependency manifests from the user's existing `quant-trading-web` project into this project, and preserve the dependency source/version that actually builds there. The target project cannot import VNStock unless the Vercel Python runtime has a compatible package available. If a fresh Vercel build cannot install VNStock, use the already-working deployed API project as a remote provider until the package maintainer/PyPI resolves the quarantine. Do not assume `pip install vnstock` will work in a new build today.

## Vercel routing and duration

`vercel.json` preserves the SPA fallback and configures Python handlers with a 60-second maximum duration. Vercel documents `api/index.py` as mapping to `/api`, so this project uses `api/market_index.py` for the explicit `/api/market_index` endpoint. Single-symbol endpoints are the main integration path. `/api/scan` is provided for batch/debug use; the current React scanner still requests each symbol through `/api/ohlcv` and does not yet call `/api/scan`.

## Verification performed

- Python syntax compilation for all files in `api/`.
- Pure helper checks for symbol aliases and default date formats.
- No live VNStock request was run in this environment; only a successful upstream smoke test from Vercel/local Vercel CLI can verify credential, installed package version, source endpoint, and current provider availability.
