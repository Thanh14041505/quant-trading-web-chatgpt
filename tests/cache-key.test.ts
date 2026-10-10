import { describe, expect, it } from "vitest"
import { buildCacheKey } from "@/data/cache/cache-key"

describe("cache key", () => {
  it("creates deterministic provider-aware keys", () => {
    expect(buildCacheKey({ providerId: "mock", kind: "marketData", symbol: "hah", timeframe: "1D" }))
      .toBe("marketData:mock:HAH:1D:*:*:*")
  })

  it("separates different date ranges", () => {
    const first = buildCacheKey({ providerId: "p", kind: "marketData", symbol: "HAH", timeframe: "1D", startDate: "2026-01-01", endDate: "2026-06-30" })
    const second = buildCacheKey({ providerId: "p", kind: "marketData", symbol: "HAH", timeframe: "1D", startDate: "2026-07-01", endDate: "2026-10-08" })
    expect(first).not.toBe(second)
  })
})
