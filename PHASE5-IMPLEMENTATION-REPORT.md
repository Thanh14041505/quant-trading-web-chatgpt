# PHASE 5 — MARKET REGIME ENGINE IMPLEMENTATION REPORT

## Status

Implemented on top of Phase 4.

## Regimes

The engine classifies the market into:

- `BULL`
- `BULL_PULLBACK`
- `SIDEWAYS`
- `DISTRIBUTION`
- `BEAR`
- `PANIC`

## Architecture

```text
VNINDEX OHLCV
      |
      v
Phase 4 Feature Engine
      |
      +--> Trend
      +--> Momentum
      +--> Volume / RVOL
      +--> Price Structure
      |
      +-------------------+
                          |
Optional Breadth ----------+--> Market Regime Engine
Optional Sector Strength --+          |
                                      v
                           Regime + Components
                           Confidence + Reasons
                           Warnings + Metrics
```

The regime engine is a pure calculation layer. It does not fetch data and does not know which provider produced the data.

## Composite scoring

Initial component weights:

```yaml
trend: 0.30
breadth: 0.25
momentum: 0.15
volatility: 0.15
participation: 0.15
```

The weights are centralized in the engine and can be extracted into strategy configuration in a later enhancement.

## Trend component

Uses:
- price vs EMA20 / EMA50 / EMA200
- EMA20 / EMA50 / EMA200 slope
- ADX14
- DI+ vs DI-

## Breadth component

Optional inputs:
- % stocks above EMA20
- % stocks above EMA50
- advance count
- decline count
- advance/decline ratio
- optional sector participation

When breadth is unavailable, the component returns a neutral score of `50` rather than manufacturing data.

## Momentum component

Uses:
- RSI14
- ROC20
- 5-session return
- 20-session return

Overbought/oversold extremes are treated as context/warnings, not as automatic buy/sell signals.

## Volatility component

Uses:
- ATR14 as % of index price
- 1-day return shock

Large volatility expansion and sharp sell-offs reduce the regime health score.

## Participation component

Uses:
- index RVOL20
- DI direction
- optional sector breadth
- high-volume sell-off penalty

## Regime classification rules

### PANIC
Triggered by severe daily sell-off + volume expansion or a severe downtrend combined with collapsed breadth.

### BEAR
Requires a bearish moving-average structure plus negative EMA50 slope and weak breadth.

### DISTRIBUTION
Identifies a market that is still structurally elevated but has deteriorating breadth and is near recent highs.

### BULL_PULLBACK
Identifies a market still above EMA200 with positive 20-session momentum where price is temporarily below EMA20 while breadth remains healthy.

### BULL
Requires a strong composite score, healthy trend, healthy breadth and price above EMA200.

### SIDEWAYS
Fallback state when the market does not satisfy the directional regimes above.

These rules are intentionally explicit and explainable. They are not intended to be treated as statistically calibrated probabilities.

## Confidence

The engine returns:

- `LOW`
- `MEDIUM`
- `HIGH`

Confidence represents consistency/strength of the regime classification. It is **not** a calibrated probability of winning.

## Explainability

Each regime snapshot contains:

```text
score
component scores
metrics
reasons[]
warnings[]
strongestSectors[]
weakestSectors[]
```

Example reason codes:

```text
INDEX_TREND_ALIGNED
INDEX_ABOVE_EMA200
EMA20_SLOPE_POSITIVE
ADX_TRENDING
BREADTH_ABOVE_EMA50_HEALTHY
ADVANCE_DECLINE_POSITIVE
20D_MOMENTUM_POSITIVE
```

Example warnings:

```text
INDEX_RSI_EXTENDED
INDEX_DAILY_SELL_OFF
VOLATILITY_EXPANSION
BREADTH_WEAK
DISTRIBUTION_RISK
BEAR_TREND
PANIC_RISK
```

## Breadth and sector dashboard integration

The Dashboard now consumes the real Phase 5 engine.

With the Mock Provider, a small sample universe is used to demonstrate the breadth/sector pipeline. The UI explicitly labels this as sample/demo data.

With a real provider, the dashboard does **not** invent market-wide breadth when no universe dataset is available. Breadth remains unavailable until a proper universe feed exists.

## Files added

```text
src/quant/regime/types.ts
src/quant/regime/market-regime-engine.ts
src/quant/regime/index.ts
src/quant/regime/README.md
src/hooks/useMarketRegime.ts
tests/market-regime-engine.test.ts
```

Additional integration changes:

```text
src/pages/dashboard/dashboard-page.tsx
src/data/providers/mockProvider.ts
src/quant/index.ts
```

## Verification

Focused TypeScript compilation for:

- market models
- all Phase 4 indicators
- Feature Engine
- Market Regime Engine

passes successfully.

The full project TypeScript/Vite build could not be completed in this environment because the npm dependency tree is not installed locally and package installation previously timed out. Therefore a production build is **not claimed as verified here**.

## Known limitations

1. Real market-wide breadth requires a provider/universe endpoint; the engine only consumes it when supplied.
2. Sector rotation is only as reliable as the sector-mapped universe provided to the engine.
3. Regime thresholds are initial rule-based parameters and should be validated with historical backtests before being used as trading constraints.
4. The current Dashboard setup cards are still Phase 6 fixtures; Phase 5 only provides the market context.

## Next phase

PHASE 6 — T+ ENGINE.
