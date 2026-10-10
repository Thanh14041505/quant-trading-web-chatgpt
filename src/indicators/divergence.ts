import type { OHLCV } from "@/models/market"
import { rollingMin, rollingMax } from "./utils"

function divergenceAgainstPriorExtreme(data: OHLCV[], oscillator: number[], lookback = 20) {
  const bullish = Array(data.length).fill(false)
  const bearish = Array(data.length).fill(false)
  const closes = data.map((bar) => bar.close)
  const lows = data.map((bar) => bar.low)
  const highs = data.map((bar) => bar.high)
  for (let i = lookback; i < data.length; i += 1) {
    const previousLow = rollingMin(lows.slice(0, i), lookback).at(-1)
    const previousHigh = rollingMax(highs.slice(0, i), lookback).at(-1)
    if (Number.isFinite(previousLow) && lows[i] < previousLow!) {
      const previousIndex = lows.slice(Math.max(0, i - lookback), i).reduce((bestIndex, value, offset, arr) => value <= arr[bestIndex] ? offset : bestIndex, 0) + Math.max(0, i - lookback)
      if (Number.isFinite(oscillator[i]) && Number.isFinite(oscillator[previousIndex]) && oscillator[i] > oscillator[previousIndex]) bullish[i] = true
    }
    if (Number.isFinite(previousHigh) && highs[i] > previousHigh!) {
      const previousIndex = highs.slice(Math.max(0, i - lookback), i).reduce((bestIndex, value, offset, arr) => value >= arr[bestIndex] ? offset : bestIndex, 0) + Math.max(0, i - lookback)
      if (Number.isFinite(oscillator[i]) && Number.isFinite(oscillator[previousIndex]) && oscillator[i] < oscillator[previousIndex]) bearish[i] = true
    }
  }
  return { bullish, bearish, closes }
}

export function calculateDivergence(data: OHLCV[], rsi14: number[], macdLine: number[], lookback = 20) {
  const rsi = divergenceAgainstPriorExtreme(data, rsi14, lookback)
  const macd = divergenceAgainstPriorExtreme(data, macdLine, lookback)
  return { rsiBullish: rsi.bullish, rsiBearish: rsi.bearish, macdBullish: macd.bullish, macdBearish: macd.bearish }
}
