import { describe, expect, it } from "vitest"
import type { OHLCV } from "@/models/market"
import { aggregateOhlcv, calculateEma, selectChartRange } from "@/components/charts/chart-series"

const daily: OHLCV[] = [
  { symbol: "ABC", date: "2026-09-28", open: 10, high: 12, low: 9, close: 11, volume: 100, value: 1100 },
  { symbol: "ABC", date: "2026-09-29", open: 11, high: 13, low: 10, close: 12, volume: 200, value: 2400 },
  { symbol: "ABC", date: "2026-10-01", open: 12, high: 14, low: 11, close: 13, volume: 300, value: 3900 },
  { symbol: "ABC", date: "2026-10-02", open: 13, high: 15, low: 12, close: 14, volume: 400, value: 5600 },
]

describe("stock chart series", () => {
  it("keeps daily bars unchanged", () => {
    expect(aggregateOhlcv(daily, "1D")).toEqual(daily)
  })

  it("aggregates OHLCV correctly to weekly candles", () => {
    const weekly = aggregateOhlcv(daily, "1W")
    expect(weekly).toHaveLength(1)
    expect(weekly[0]).toMatchObject({ open: 10, high: 15, low: 9, close: 14, volume: 1000, value: 13000 })
  })

  it("aggregates monthly bars and preserves last close", () => {
    const monthly = aggregateOhlcv(daily, "1M")
    expect(monthly).toHaveLength(2)
    expect(monthly[0]).toMatchObject({ date: "2026-09-29", open: 10, close: 12, volume: 300 })
    expect(monthly[1]).toMatchObject({ date: "2026-10-02", open: 12, close: 14, volume: 700 })
  })

  it("calculates EMA with an SMA seed", () => {
    const ema = calculateEma([10, 12, 14, 16], 3)
    expect(Number.isNaN(ema[0])).toBe(true)
    expect(Number.isNaN(ema[1])).toBe(true)
    expect(ema[2]).toBe(12)
    expect(ema[3]).toBeCloseTo(14)
  })

  it("selects range size based on chart interval", () => {
    const values = Array.from({ length: 100 }, (_, index) => index)
    expect(selectChartRange(values, "3M", "1D").data).toHaveLength(63)
    expect(selectChartRange(values, "3M", "1W").data).toHaveLength(13)
    expect(selectChartRange(values, "ALL", "1D").data).toHaveLength(100)
  })
})
