import { describe, expect, it, vi } from "vitest"
import { CachedMarketDataProvider } from "@/data/cache/cached-provider"
import type { MarketDataProvider } from "@/data/providers/market-data-provider"

function makeProvider(fetchSpy: ReturnType<typeof vi.fn>): MarketDataProvider {
  return {
    id: "test-provider",
    name: "Test Provider",
    getHistoricalPrices: fetchSpy,
    getCompanyInfo: vi.fn(),
    getFundamentals: vi.fn(),
    getMarketIndex: vi.fn(),
    testConnection: vi.fn(),
  }
}

describe("cached market data provider", () => {
  it("uses the cache after the first network request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue([
      { symbol: "HAH", date: "2026-10-08", open: 1, high: 2, low: 1, close: 1.5, volume: 100 },
    ])
    const provider = new CachedMarketDataProvider(makeProvider(fetchSpy), "test")

    await provider.getHistoricalPrices({ symbol: "HAH", timeframe: "1D" })
    await provider.getHistoricalPrices({ symbol: "HAH", timeframe: "1D" })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(provider.getLastCacheResolution()).toBe("FRESH_CACHE")
  })

  it("force refresh bypasses a fresh cache", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce([{ symbol: "HAH", date: "2026-10-08", open: 1, high: 2, low: 1, close: 1.5, volume: 100 }])
      .mockResolvedValueOnce([{ symbol: "HAH", date: "2026-10-08", open: 2, high: 3, low: 2, close: 2.5, volume: 200 }])
    const provider = new CachedMarketDataProvider(makeProvider(fetchSpy), "force")

    await provider.getHistoricalPrices({ symbol: "HAH", timeframe: "1D" })
    const refreshed = await provider.getHistoricalPrices({ symbol: "HAH", timeframe: "1D", cacheMode: "force-refresh" })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(refreshed[0].close).toBe(2.5)
  })
})
