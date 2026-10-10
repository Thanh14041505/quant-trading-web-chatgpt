import { describe, expect, it } from "vitest"
import { validateOHLCVRows } from "@/data/validation/market-data-validator"
import type { OHLCV } from "@/models/market"

describe("validateOHLCVRows", () => {
  it("sorts rows and drops duplicate symbol/date rows", () => {
    const rows: OHLCV[] = [
      { symbol: "hah", date: "2026-10-02", open: 40, high: 42, low: 39, close: 41, volume: 100 },
      { symbol: "HAH", date: "2026-10-01", open: 38, high: 40, low: 37, close: 39, volume: 90 },
      { symbol: "HAH", date: "2026-10-01", open: 38, high: 40, low: 37, close: 39, volume: 90 },
    ]
    const result = validateOHLCVRows(rows)

    expect(result.data.map((row) => row.date)).toEqual(["2026-10-01", "2026-10-02"])
    expect(result.report.droppedRows).toBe(1)
    expect(result.report.warnings.some((item) => item.code === "DUPLICATE_DATE")).toBe(true)
  })

  it("flags invalid OHLC without silently correcting it", () => {
    const rows: OHLCV[] = [
      { symbol: "GMD", date: "2026-10-08", open: 70, high: 65, low: 60, close: 64, volume: 100 },
    ]
    const result = validateOHLCVRows(rows)

    expect(result.data).toHaveLength(0)
    expect(result.report.errors[0]?.code).toBe("INVALID_HIGH")
  })
})
