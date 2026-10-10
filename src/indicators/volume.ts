import type { OHLCV } from "@/models/market"
import { linearSlope, rollingMean, rollingSum, safeDiv } from "./utils"
import type { IndicatorBundle } from "./types"
import { moneyFlowIndex } from "./momentum"

export function obv(data: OHLCV[]): number[] {
  const result = Array(data.length).fill(0)
  for (let i = 1; i < data.length; i += 1) {
    if (data[i].close > data[i - 1].close) result[i] = result[i - 1] + data[i].volume
    else if (data[i].close < data[i - 1].close) result[i] = result[i - 1] - data[i].volume
    else result[i] = result[i - 1]
  }
  return result
}

export function cmf(data: OHLCV[], period = 20): number[] {
  const mfv = data.map((bar) => {
    const range = bar.high - bar.low
    const multiplier = safeDiv((2 * bar.close) - bar.high - bar.low, range, 0)
    return multiplier * bar.volume
  })
  const volume = data.map((bar) => bar.volume)
  const result = Array(data.length).fill(Number.NaN)
  const mfvSum = rollingSum(mfv, period)
  const volumeSum = rollingSum(volume, period)
  for (let i = 0; i < data.length; i += 1) result[i] = safeDiv(mfvSum[i], volumeSum[i])
  return result
}

export function clv(data: OHLCV[]): number[] {
  return data.map((bar) => safeDiv((2 * bar.close) - bar.high - bar.low, bar.high - bar.low, 0))
}

function classifyVsa(data: OHLCV[], rvol20: number[], cmf20: number[]): IndicatorBundle["volume"]["vsa"][number][] {
  return data.map((bar, i) => {
    if (i < 20) return "NONE"
    const range = bar.high - bar.low
    const body = Math.abs(bar.close - bar.open)
    const spreadRatio = safeDiv(range, Math.max(Math.abs(bar.open), 1))
    const rv = rvol20[i]
    const money = cmf20[i]
    const upperWick = bar.high - Math.max(bar.open, bar.close)
    const lowerWick = Math.min(bar.open, bar.close) - bar.low

    if (rv > 2 && bar.close > bar.open && spreadRatio > 0.02) return "CLIMAX_UP"
    if (rv > 2 && bar.close < bar.open && spreadRatio > 0.02) return "CLIMAX_DOWN"
    if (rv > 1.5 && body <= range * 0.25 && lowerWick > body * 1.5 && Number.isFinite(money) && money > 0) return "ABSORPTION"
    if (rv < 0.65 && upperWick > body * 1.8 && Number.isFinite(money) && money < 0) return "NO_DEMAND"
    if (rv < 0.65 && lowerWick > body * 1.8 && Number.isFinite(money) && money > 0) return "NO_SUPPLY"
    return "NONE"
  })
}

export function calculateVolumeIndicators(data: OHLCV[]) {
  const volumes = data.map((bar) => bar.volume)
  const volumeAvg20 = rollingMean(volumes, 20)
  const volumeAvg60 = rollingMean(volumes, 60)
  const rvol20 = volumes.map((volume, i) => safeDiv(volume, volumeAvg20[i]))
  const rvol60 = volumes.map((volume, i) => safeDiv(volume, volumeAvg60[i]))
  const obvValues = obv(data)
  const obvSlope20 = obvValues.map((_, i) => i >= 19 ? linearSlope(obvValues.slice(i - 19, i + 1)) : Number.NaN)
  const cmf20 = cmf(data, 20)
  const clvValues = clv(data)
  const upVolume = data.map((bar, i) => i === 0 ? bar.volume : bar.close > data[i - 1].close ? bar.volume : 0)
  const downVolume = data.map((bar, i) => i === 0 ? 0 : bar.close < data[i - 1].close ? bar.volume : 0)
  const vsa = classifyVsa(data, rvol20, cmf20)
  return {
    rvol20,
    rvol60,
    obv: obvValues,
    obvSlope20,
    cmf20,
    mfi14: moneyFlowIndex(data, 14),
    clv: clvValues,
    upVolume,
    downVolume,
    vsa,
  }
}
