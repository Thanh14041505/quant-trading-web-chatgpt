# Client-side backtest engine

- Long-only, event-driven daily-bar simulation. The signal is calculated at close T and the earliest fill is open T+1.
- Historical features/regime are calculated from the prefix available at each signal date; later bars are never passed to the signal engine.
- When daily OHLC shows both a stop and target touched in the same candle, stop loss is assumed first (conservative intrabar assumption).
- Position sizing is risk-based and constrained by lot size, cash, per-position cap, portfolio exposure cap, and maximum open positions.
- Commission applies to buys and sells; selling tax applies only to sell notional; slippage is applied adversely to both sides.
- Current fundamentals are deliberately not used for historical Hold backtests. A point-in-time fundamentals feed with announcement dates is required before that is statistically valid.
- This is a V1 simulator. It does not yet model exchange price limits, settlement restrictions, corporate actions, delisted historical universes, partial fills, or intraday path reconstruction. Results from mock data are software-validation output only.
