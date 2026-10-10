import { describe, expect, it } from "vitest"
import type { OHLCV } from "@/models/market"
import { calculateFeatures } from "@/quant/features"
import { rsi } from "@/indicators/momentum"
import { calculateVolumeProfile } from "@/indicators/volumeProfile"
import { calculateMultiTimeframeIchimoku } from "@/indicators/ichimoku"

function fixture(length = 260, symbol = "TEST"): OHLCV[] {
  return Array.from({ length }, (_, i) => {
    const close = 100 + i * 0.25 + Math.sin(i / 7) * 2
    return {
      symbol,
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000 + i * 1000,
    }
  })
}

describe("Phase 4 feature engine", () => {
  it("calculates a complete normalized feature snapshot", () => {
    const result = calculateFeatures(fixture())
    expect(result.snapshot.symbol).toBe("TEST")
    expect(Number.isFinite(result.snapshot.trend.ema50)).toBe(true)
    expect(Number.isFinite(result.snapshot.trend.atr14)).toBe(true)
    expect(Number.isFinite(result.snapshot.momentum.rsi14)).toBe(true)
    expect(Number.isFinite(result.snapshot.volume.rvol20)).toBe(true)
    expect(result.snapshot.priceStructure.hh).toBe(true)
    expect(result.indicators.dates).toHaveLength(260)
    expect(result.volumeProfile.approximate).toBe(true)
  })

  it("keeps RSI bounded", () => {
    const values = rsi(fixture().map((bar) => bar.close), 14).filter(Number.isFinite)
    expect(values.every((value) => value >= 0 && value <= 100)).toBe(true)
  })

  it("returns an ordered daily/weekly/monthly ichimoku structure", () => {
    const daily = fixture(120)
    const weekly = fixture(120, "TEST-W")
    const monthly = fixture(120, "TEST-M")
    const multi = calculateMultiTimeframeIchimoku({ daily, weekly, monthly })
    expect(multi.daily.tenkan9.length).toBe(120)
    expect(multi.weekly?.kijun26.length).toBe(120)
    expect(multi.monthly?.senkouB.length).toBe(120)
  })

  it("returns a volume profile with an ordered value area", () => {
    const profile = calculateVolumeProfile(fixture())
    expect(profile.poc).toBeGreaterThanOrEqual(profile.val)
    expect(profile.poc).toBeLessThanOrEqual(profile.vah)
    expect(profile.bins.length).toBe(24)
  })
})
