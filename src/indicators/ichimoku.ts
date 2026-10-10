import type { OHLCV } from "@/models/market"
import { rollingMax, rollingMin, safeDiv } from "./utils"

export function calculateIchimoku(data: OHLCV[]) {
  const highs = data.map((bar) => bar.high)
  const lows = data.map((bar) => bar.low)
  const closes = data.map((bar) => bar.close)
  const high9 = rollingMax(highs, 9)
  const low9 = rollingMin(lows, 9)
  const high26 = rollingMax(highs, 26)
  const low26 = rollingMin(lows, 26)
  const high52 = rollingMax(highs, 52)
  const low52 = rollingMin(lows, 52)
  const tenkan = data.map((_, i) => (high9[i] + low9[i]) / 2)
  const kijun = data.map((_, i) => (high26[i] + low26[i]) / 2)
  const senkouA = data.map((_, i) => (tenkan[i] + kijun[i]) / 2)
  const senkouB = data.map((_, i) => (high52[i] + low52[i]) / 2)
  const chikou = closes.map((_, i) => i >= 26 ? closes[i] : Number.NaN)
  const cloudThickness = senkouA.map((value, i) => Math.abs(value - senkouB[i]))
  const distanceToCloud = closes.map((close, i) => {
    const top = Math.max(senkouA[i], senkouB[i])
    const bottom = Math.min(senkouA[i], senkouB[i])
    if (close > top) return safeDiv(close - top, close) * 100
    if (close < bottom) return -safeDiv(bottom - close, close) * 100
    return 0
  })
  const tkSpread = tenkan.map((value, i) => safeDiv(value - kijun[i], closes[i]) * 100)
  const cloudPosition = closes.map((close, i) => {
    if (!Number.isFinite(senkouA[i]) || !Number.isFinite(senkouB[i])) return "UNKNOWN" as const
    const top = Math.max(senkouA[i], senkouB[i])
    const bottom = Math.min(senkouA[i], senkouB[i])
    if (close > top) return "ABOVE" as const
    if (close < bottom) return "BELOW" as const
    return "INSIDE" as const
  })
  const futureCloudDirection = senkouA.map((value, i) => {
    if (i < 5 || !Number.isFinite(value) || !Number.isFinite(senkouA[i - 5]) || !Number.isFinite(senkouB[i]) || !Number.isFinite(senkouB[i - 5])) return "FLAT" as const
    const aSlope = value - senkouA[i - 5]
    const bSlope = senkouB[i] - senkouB[i - 5]
    const net = aSlope + bSlope
    if (net > 0) return "UP" as const
    if (net < 0) return "DOWN" as const
    return "FLAT" as const
  })
  return { tenkan9: tenkan, kijun26: kijun, senkouA, senkouB, chikou26: chikou, cloudThickness, distanceToCloud, tkSpread, futureCloudDirection, cloudPosition }
}


export interface MultiTimeframeIchimokuInput {
  daily: OHLCV[]
  weekly?: OHLCV[]
  monthly?: OHLCV[]
}

export function calculateMultiTimeframeIchimoku(input: MultiTimeframeIchimokuInput) {
  return {
    daily: calculateIchimoku(input.daily),
    weekly: input.weekly?.length ? calculateIchimoku(input.weekly) : undefined,
    monthly: input.monthly?.length ? calculateIchimoku(input.monthly) : undefined,
  }
}
