# VNStock + Vercel Python Functions — Implementation Report

Date: 2026-10-10

## Summary

Integrated Vercel file-based Python Functions into the existing Quant Trading Web app. Frontend calculations, scanners, client cache, and backtesting remain in the browser. Python functions fetch/normalize upstream market data through VNStock and return JSON.

## Files added

- `api/_http_util.py` — shared JSON, CORS, date parsing, and cache headers.
- `api/_vnstock_util.py` — VNStock key configuration, symbol normalization, OHLCV conversion, and best-effort company/fundamental adapters.
- `api/health.py` — `GET /api/health`.
- `api/ohlcv.py` — `GET /api/ohlcv?symbol=HAH&start=YYYY-MM-DD&end=YYYY-MM-DD`.
- `api/market_index.py` — `GET /api/market_index?symbol=VNINDEX&start=...&end=...`.
- `api/company.py` — `GET /api/company?symbol=HAH`.
- `api/fundamentals.py` — `GET /api/fundamentals?symbol=HAH`.
- `api/scan.py` — `POST /api/scan` with an eight-symbol cap and sequential fetches.

The explicit index-data route is named `market_index.py`. Vercel documents `api/index.py` as the index route `/api`, so the more explicit filename avoids ambiguity. See Vercel documentation: https://vercel.com/docs/functions/runtimes/python/api-directory

## API compatibility

The shared adapter prefers VNStock v4+ Unified UI calls (`Market`, `Reference`, `Fundamental`) and falls back to the source-specific `Vnstock`, `Quote`, `Company`, or `Finance` APIs used by earlier projects. Actual method/source availability still depends on the installed VNStock version and its upstream sources.

## Frontend integration

- Default HTTP provider `baseUrl` is empty, which resolves API paths against the current site origin.
- Default endpoints are `/api/health`, `/api/ohlcv`, `/api/market_index`, `/api/company`, `/api/fundamentals`.
- HTTP OHLCV requests send both `start`/`end` and `startDate`/`endDate` query aliases.
- Settings explains that `npm run dev` starts Vite only; use `vercel dev` or a Preview deployment to run Python Functions.
- The app still defaults to Mock until the user selects the HTTP JSON provider in Settings.
- Server-side `VNSTOCK_API_KEY` is preferred. `X-VNSTOCK-KEY` is supported as a personal-use fallback and is visible to the browser user.

## Credentials and security

1. Add `VNSTOCK_API_KEY` in Vercel Project → Settings → Environment Variables.
2. Redeploy after changing environment variables.
3. Leave the browser API key field empty when using the server environment key.
4. `ALLOWED_ORIGINS` optionally allows exact cross-origin origins. Same-origin requests need no CORS allow-list.
5. CORS is not authentication. Protect a personal deployment with Vercel Deployment Protection or an equivalent server-side access-control layer so public clients cannot consume the owner's upstream quota.

Never put the credential in `VITE_*`, commit it to Git, or expose it in source code.

## Dependency caveat — important

As of 2026-10-10, PyPI marks `vnstock` as quarantined and says it cannot be installed or modified until a security review is complete. This patch includes `.python-version` set to `3.12`, but intentionally does not add a new `requirements.txt` or `pyproject.toml` dependency manifest. Copy the known-working dependency manifests from the user's existing `quant-trading-web` project into this project, and preserve the dependency source/version that actually builds there. The target project cannot import VNStock unless the Vercel Python runtime has a compatible package available. If a fresh Vercel build cannot install VNStock, use the already-working deployed API project as a remote provider until the package maintainer/PyPI resolves the quarantine. This report does not recommend bypassing PyPI's quarantine.

Reference: https://pypi.org/project/vnstock/4.0.8/

## Endpoint behavior

- `/api/health` confirms the function responds; it does not prove upstream VNStock access.
- `/api/ohlcv` and `/api/market_index` return normalized daily bars. Weekly/monthly chart aggregation stays client-side.
- `/api/company` and `/api/fundamentals` are best-effort adapters. Missing fields remain null; no fundamentals are fabricated.
- `/api/scan` is a bounded batch utility, but the React scanner still uses per-symbol `/api/ohlcv`; this integration does not yet switch Phase 8 scanning to batch mode.

## Verification performed in this environment

- `python -m compileall -q api`: PASS.
- Symbol normalization/date-default smoke tests: PASS.
- Pandas OHLCV normalization smoke test: PASS.
- TypeScript transpile/syntax checks for the modified provider and Settings files: PASS.
- Full `npm run build`, `npm test`, Vercel deployment, and live upstream VNStock API requests were not run from this environment. A real upstream sample is still needed to validate the installed package version, credentials, data source, quotas, and Vercel runtime.
