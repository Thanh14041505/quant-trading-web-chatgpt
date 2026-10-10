# PHASE 10 — BACKTEST IMPLEMENTATION REPORT

## Status

Implemented on the Phase 9 project base. The backtest page, event-driven engine, Web Worker, metrics, visualizations, trade ledger, CSV export, and integrity warnings are included.

## What was implemented

### 1. Event-driven long-only simulation

- A signal is evaluated at the close of historical session `T` using only the stock and benchmark bars available through `T`.
- The earliest execution is the next available stock session's open (`T+1`). Signals are generated from a historical prefix; future bars are not passed to the T+ engine.
- The actual next-open fill is checked again against the minimum risk/reward threshold. A gap that makes the trade no longer eligible is skipped.
- Stop-loss is checked before targets. If a daily candle touches the stop and one or more targets, the model assumes the stop was reached first.
- Exit choices: partial TP1 then TP2, TP2-only, or time stop. Remaining positions are liquidated at the final in-range close so final equity is realized.

### 2. Strategies

- `TPLUS_MULTI_SETUP_v1`
- `TPLUS_BREAKOUT_v1`
- `TPLUS_PULLBACK_v1`
- `TPLUS_DIVERGENCE_v1`
- `TPLUS_MEAN_REVERSION_v1`

The T+ engine now accepts optional `allowedSetups`, so a single-setup backtest evaluates that setup explicitly rather than filtering the winning multi-setup result after the fact. Normal scanner use retains the existing default behavior.

### 3. Position sizing and transaction costs

- Shared starting cash across the selected symbols.
- Risk-based sizing using entry-to-stop distance.
- Configurable risk budget per trade, maximum single-position percentage, portfolio exposure ceiling, maximum concurrent positions, and lot size.
- Configurable commission on buys and sells, selling tax on sell notional, and adverse slippage on both sides.
- Position sizing is constrained by cash, position cap, exposure cap, lot size, and available slots.

### 4. Exits and trade analytics

- Stop loss, TP1 partial exit, TP2, time stop, and end-of-test liquidation.
- MAE/MFE per trade, net P/L, net return, risk multiple, commissions, tax, shares filled, and holding sessions.
- TP1/TP2/SL hit-rate metrics.

### 5. Performance results

- Total return, CAGR, maximum drawdown, Sharpe, Sortino, win rate, average win/loss, expectancy in VND and R, profit factor, trades, average holding period, exposure, time in market, turnover, TP hit rates, SL hit rate, and average MAE/MFE.
- Equity curve, drawdown curve, monthly returns, trade return distribution, market-regime performance, exit reason distribution, and MAE/MFE plot.
- Trade ledger shows up to the latest 100 closed trades; complete ledger can be downloaded as CSV.

### 6. Browser execution and UX

- Backtest computation runs in a Web Worker, with stage/progress messages and Cancel.
- Historical data loading is bounded to four concurrent symbol requests. Cancelling stops further requests from being scheduled and terminates an active worker.
- Last completed result is saved in the existing Memory + IndexedDB cache with a 24-hour TTL.
- Provider load errors are retained without duplicating a generic missing-history error for the same symbol.

### 7. Integrity and known limitations

- OHLCV validation rejects invalid, non-finite, inconsistent, duplicate, or out-of-order data instead of silently repairing it.
- Benchmark series is filtered to the selected end date and validated. If benchmark context is unavailable or insufficiently warmed up, regime fallback warnings are added.
- Current fundamentals are intentionally not used to backtest Hold. A point-in-time fundamentals feed with publication/announcement dates is required to avoid fundamental leakage.
- V1 is long-only. It does not model historical corporate actions, delisted/unavailable historical-universe membership, exchange price limits, settlement restrictions, partial fills, intraday paths, or broker-specific microstructure. Survivorship and universe completeness therefore remain limitations.
- Daily candles cannot reveal the true order of intraday stop/target touches; stop-first is the conservative deterministic assumption.
- Mock Provider data is synthetic. A smoke run on the built-in mock data produced zero qualifying trades; the engine deliberately does not relax Phase 6 entry rules just to manufacture trades. Zero trades is an allowed outcome and is not evidence of strategy performance.

## Files added/modified

- `src/quant/backtest/types.ts`
- `src/quant/backtest/backtest-engine.ts`
- `src/quant/backtest/backtest.worker.ts`
- `src/quant/backtest/index.ts`
- `src/quant/backtest/README.md`
- `src/quant/tplus/types.ts` — optional `allowedSetups` input
- `src/quant/tplus/tplus-engine.ts` — restrict setup candidates when requested
- `src/quant/index.ts`
- `src/pages/backtest/backtest-page.tsx`
- `tests/backtest-engine.test.ts`
- `tsconfig.quant.json`
- `README.md`

## Verification

### Passed

- `tsc -p tsconfig.quant.json --pretty false`.
- Focused strict TypeScript check including the new backtest test source, using a temporary ambient declaration for Vitest types; temporary checker files were removed after the check.
- TypeScript transpile/syntax checks for the Backtest page, Worker entry and test file.
- Runtime simulation checks: TP1/TP2 handling, stop-first intrabar policy, invalid candle chronology rejection, transaction costs, time-stop behavior, and rejecting next-open gaps that violate minimum R:R.
- End-to-end quant-layer smoke run returned finite metrics and equity points. The built-in synthetic mock run processed its requested symbols without runtime errors, but emitted no trades under the current signal/eligibility rules.

### Not verified in this environment

`npm install`, the full Vite production build, and the actual Vitest test runner were not completed because dependencies are not installed in the sandbox and package installation has timed out in this environment. The focused TypeScript/runtime checks above do not replace a full local build/test run.

## Suggested local verification

```bash
npm install
npm run build
npm test
npm run dev
```
