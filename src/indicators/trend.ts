import type { OHLCV } from "@/models/market"
import { linearSlope, rollingMean, rollingMax, rollingMin, safeDiv } from "./utils"

export function sma(values: number[], period: number): number[] {
  return rollingMean(values, period)
}

export function ema(values: number[], period: number): number[] {
  const result = Array(values.length).fill(Number.NaN)
  if (period <= 0) return result
  const alpha = 2 / (period + 1)
  let seedSum = 0
  let seedCount = 0
  let previous = Number.NaN
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (!Number.isFinite(value)) continue
    if (!Number.isFinite(previous)) {
      seedSum += value
      seedCount += 1
      if (i >= period - 1 && seedCount >= period) {
        previous = seedSum / seedCount
        result[i] = previous
      }
      continue
    }
    previous = alpha * value + (1 - alpha) * previous
    result[i] = previous
  }
  return result
}

function directionalMovement(high: number[], low: number[], close: number[]) {
  const tr = Array(close.length).fill(Number.NaN)
  const plusDm = Array(close.length).fill(0)
  const minusDm = Array(close.length).fill(0)
  for (let i = 1; i < close.length; i += 1) {
    const upMove = high[i] - high[i - 1]
    const downMove = low[i - 1] - low[i]
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  }
  return { tr, plusDm, minusDm }
}

function wildersAverage(values: number[], period: number): number[] {
  const result = Array(values.length).fill(Number.NaN)
  let seed = 0
  let count = 0
  let previous = Number.NaN
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (!Number.isFinite(value)) continue
    if (!Number.isFinite(previous)) {
      seed += value
      count += 1
      if (count === period) {
        previous = seed / period
        result[i] = previous
      }
    } else {
      previous = ((previous * (period - 1)) + value) / period
      result[i] = previous
    }
  }
  return result
}

export function adx(high: number[], low: number[], close: number[], period = 14) {
  const { tr, plusDm, minusDm } = directionalMovement(high, low, close)
  const atr = wildersAverage(tr.slice(1), period).map((value) => value)
  const plus = wildersAverage(plusDm.slice(1), period)
  const minus = wildersAverage(minusDm.slice(1), period)
  const diPlus = Array(close.length).fill(Number.NaN)
  const diMinus = Array(close.length).fill(Number.NaN)
  const dx = Array(close.length).fill(Number.NaN)

  for (let i = 1; i < close.length; i += 1) {
    const idx = i - 1
    diPlus[i] = safeDiv(100 * (plus[idx] ?? Number.NaN), atr[idx] ?? Number.NaN)
    diMinus[i] = safeDiv(100 * (minus[idx] ?? Number.NaN), atr[idx] ?? Number.NaN)
    const sum = diPlus[i] + diMinus[i]
    dx[i] = Number.isFinite(sum) ? safeDiv(100 * Math.abs(diPlus[i] - diMinus[i]), sum) : Number.NaN
  }
  const adxShifted = wildersAverage(dx.slice(1), period)
  const adxResult = Array(close.length).fill(Number.NaN)
  for (let i = 1; i < close.length; i += 1) adxResult[i] = adxShifted[i - 1]
  return { adx: adxResult, diPlus, diMinus }
}

export function atr(high: number[], low: number[], close: number[], period = 14): number[] {
  const tr = Array(close.length).fill(Number.NaN)
  for (let i = 1; i < close.length; i += 1) {
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  }
  const averaged = wildersAverage(tr.slice(1), period)
  const result = Array(close.length).fill(Number.NaN)
  for (let i = 1; i < close.length; i += 1) result[i] = averaged[i - 1]
  return result
}

export function slopePercent(series: number[], period: number): number[] {
  const result = Array(series.length).fill(Number.NaN)
  for (let i = period - 1; i < series.length; i += 1) {
    const window = series.slice(i - period + 1, i + 1)
    const slope = linearSlope(window)
    const base = window[0]
    result[i] = safeDiv(slope * (period - 1), base) * 100
  }
  return result
}

export function calculateTrendIndicators(data: OHLCV[]) {
  const close = data.map((bar) => bar.close)
  const high = data.map((bar) => bar.high)
  const low = data.map((bar) => bar.low)
  const adxValues = adx(high, low, close, 14)
  const ema20 = ema(close, 20)
  const ema50 = ema(close, 50)
  const ema200 = ema(close, 200)
  const atr14 = atr(high, low, close, 14)
  return {
    ema10: ema(close, 10),
    ema20,
    ema50,
    ema100: ema(close, 100),
    ema200,
    sma20: sma(close, 20),
    sma50: sma(close, 50),
    sma200: sma(close, 200),
    adx14: adxValues.adx,
    diPlus14: adxValues.diPlus,
    diMinus14: adxValues.diMinus,
    ema20Slope20: slopePercent(ema20, 20),
    ema50Slope20: slopePercent(ema50, 20),
    ema200Slope20: slopePercent(ema200, 20),
    atr14,
    rollingHigh20: rollingMax(high, 20),
    rollingLow20: rollingMin(low, 20),
  }
}
