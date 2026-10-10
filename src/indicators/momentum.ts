import type { OHLCV } from "@/models/market"
import { ema } from "./trend"
import { clamp, rollingMax, rollingMean, rollingMin, rollingSum, safeDiv } from "./utils"

export function rsi(values: number[], period = 14): number[] {
  const result = Array(values.length).fill(Number.NaN)
  if (values.length <= period) return result
  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1]
    gainSum += Math.max(delta, 0)
    lossSum += Math.max(-delta, 0)
  }
  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1]
    avgGain = ((avgGain * (period - 1)) + Math.max(delta, 0)) / period
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-delta, 0)) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const line = values.map((_, i) => (Number.isFinite(fastEma[i]) && Number.isFinite(slowEma[i]) ? fastEma[i] - slowEma[i] : Number.NaN))
  const signal = ema(line, signalPeriod)
  const histogram = line.map((value, i) => value - signal[i])
  return { line, signal, histogram }
}

export function roc(values: number[], period: number): number[] {
  return values.map((value, i) => i >= period ? ((value / values[i - period]) - 1) * 100 : Number.NaN)
}

export function moneyFlowIndex(data: OHLCV[], period = 14): number[] {
  const typical = data.map((bar) => (bar.high + bar.low + bar.close) / 3)
  const positive = Array(data.length).fill(0)
  const negative = Array(data.length).fill(0)
  for (let i = 1; i < data.length; i += 1) {
    const raw = typical[i] * data[i].volume
    if (typical[i] > typical[i - 1]) positive[i] = raw
    else if (typical[i] < typical[i - 1]) negative[i] = raw
  }
  const positiveSum = rollingSum(positive, period)
  const negativeSum = rollingSum(negative, period)
  return positiveSum.map((value, i) => {
    const ratio = safeDiv(value, negativeSum[i])
    if (!Number.isFinite(ratio)) return 50
    return clamp(100 - 100 / (1 + ratio), 0, 100)
  })
}

export function stochastic(data: OHLCV[], period = 14, smooth = 3) {
  const highs = rollingMax(data.map((bar) => bar.high), period)
  const lows = rollingMin(data.map((bar) => bar.low), period)
  const k = data.map((bar, i) => clamp(safeDiv(bar.close - lows[i], highs[i] - lows[i]) * 100, 0, 100))
  const d = rollingMean(k, smooth)
  return { k, d }
}

export function calculateMomentumIndicators(data: OHLCV[]) {
  const close = data.map((bar) => bar.close)
  const macdValues = macd(close)
  const stoch = stochastic(data)
  return {
    rsi7: rsi(close, 7),
    rsi14: rsi(close, 14),
    rsi21: rsi(close, 21),
    macd: macdValues.line,
    macdSignal: macdValues.signal,
    macdHistogram: macdValues.histogram,
    roc5: roc(close, 5),
    roc20: roc(close, 20),
    mfi14: moneyFlowIndex(data, 14),
    stochasticK14: stoch.k,
    stochasticD3: stoch.d,
  }
}
