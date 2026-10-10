# PHASE 6 — T+ ENGINE IMPLEMENTATION REPORT

## Status

**PHASE 6 IMPLEMENTED**

Base: Phase 5 Market Regime Engine.

## Implemented

### 1. T+ engine architecture

```text
Market Regime
      ↓
Setup Detection
      ↓
Setup Validation
      ↓
Multi-factor Scoring
      ↓
Entry Zone / Trigger
      ↓
Invalidation / Stop Loss
      ↓
TP1 / TP2
      ↓
R:R
      ↓
Trade Quality
      ↓
Confidence
      ↓
Final Action
```

### 2. Supported setups

- BREAKOUT
- PULLBACK
- MOMENTUM_CONTINUATION
- RSI_DIVERGENCE_REVERSAL
- VSA_REVERSAL
- MEAN_REVERSION

### 3. Scoring

Default weights remain aligned with the master prompt:

```yaml
trend_structure: 0.20
relative_strength: 0.15
setup_quality: 0.20
volume_money_flow: 0.15
momentum: 0.10
market_regime: 0.10
price_location: 0.05
liquidity_risk: 0.05
```

Weights are centralized in `DEFAULT_TPLUS_CONFIG` and can be overridden through engine configuration.

### 4. Decision outputs

The engine separates:

- `opportunityScore`
- `tradeQuality`
- `confidence`
- `action`

Confidence is qualitative and is **not** treated as calibrated win probability.

### 5. Risk plan

The engine calculates:

- Entry Zone
- Trigger
- Invalidation / Stop Loss
- TP1
- TP2
- Risk per share
- Reward to TP1 / TP2
- R:R to TP1 / TP2

Stop logic uses structure + ATR instead of a universal percentage stop.

### 6. Actions

The T+ engine can return:

- BUY
- WATCH
- WAIT
- NO_TRADE

Other global action values remain available in the shared `TradingSignal` model for future engines.

`BUY` is intentionally gated by score, trade quality, minimum R:R and hostile market-regime checks.

### 7. Explainability

Signals include:

- positive reason codes
- risk codes
- trigger
- strategy version
- score decomposition
- market regime

Example score decomposition:

```text
Trend / Structure
Relative Strength
Setup Quality
Volume / Money Flow
Momentum
Market Regime
Price Location
Liquidity / Risk
----------------------
Total Opportunity Score
```

### 8. Phase 4–5 integration

Stock Detail now calculates T+ using:

```text
OHLCV
  ↓
Feature Engine
  ↓
Market Regime
  ↓
T+ Engine
```

The Stock Detail page displays:

- Action
- Setup
- Opportunity Score
- Trade Quality
- Entry
- Trigger
- SL
- TP1
- TP2
- R:R
- Reasons / Risks
- Score decomposition

The T+ Scanner page remains a presentation fixture intentionally; universe-wide ranking/filtering is part of **Phase 8 — Scanners**.

## Look-ahead considerations

The engine validates chronological data and relies on the Phase 4 feature engine for current-time features. Phase 4 divergence/structure calculations use historical data available up to the current bar rather than future confirmation candles.

The engine does not introduce a future-candle execution assumption. Backtest execution timing will be enforced separately in Phase 10.

## Testing

Added:

```text
tests/tplus-engine.test.ts
```

Coverage includes:

- structured signal output
- score bounds
- separation of quality and confidence
- R:R gating of BUY
- chronological-data enforcement

A dependency-free TypeScript source check was also added:

```text
tsconfig.quant.json
```

This validates the quant/model layer without requiring React/browser dependencies.

## Verification

### PASS

```bash
tsc -p tsconfig.quant.json --pretty false
```

### Not fully runnable in the current sandbox

The project-wide check requires installed frontend dependencies (`react`, `@tanstack/react-query`, `react-router-dom`, `lucide-react`, etc.). `node_modules` is not available in the working environment and package installation is not reliably available, so a full `npm run build` / Vitest run was not claimed as passed.

## Files added / modified

```text
src/quant/tplus/types.ts
src/quant/tplus/tplus-engine.ts
src/quant/tplus/index.ts
src/quant/index.ts
src/pages/stock/stock-page.tsx
src/pages/tplus/tplus-page.tsx
tests/tplus-engine.test.ts
tsconfig.quant.json
src/quant/README.md
```

## Future / Phase 8 notes

The engine is intentionally single-symbol. Phase 8 should add:

- universe loading
- parallel scanning
- Web Worker execution
- client-side ranking
- filter/sort
- cached scanner results
- progress reporting
- per-symbol failure isolation

## Enhancement added

The Stock Detail T+ panel includes a score decomposition so users can inspect **why** an opportunity score is high or low instead of receiving an opaque number.
