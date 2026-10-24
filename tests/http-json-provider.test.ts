import { describe, expect, it, vi } from "vitest"
import { HttpJsonMarketDataProvider } from "@/data/providers/httpJsonProvider"
import { DataProviderError } from "@/data/providers/provider-errors"
import type { DataProviderConfig } from "@/models/provider"

const config: DataProviderConfig = {
  id: "test-http",
  name: "Test HTTP Provider",
  baseUrl: "https://example.com",
  apiKey: "secret",
  authScheme: "bearer",
  apiKeyHeader: "X-API-Key",
  historicalPath: "/history/{symbol}",
  companyPath: "/company/{symbol}",
  fundamentalsPath: "/fundamentals/{symbol}",
  marketIndexPath: "/index/{symbol}",
  healthPath: "/health",
}

describe("HttpJsonMarketDataProvider", () => {
  it("normalizes common OHLCV field names", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { time: "2026-10-08", o: "40", h: "42", l: "39", c: "41", v: "123456" },
    ] }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const provider = new HttpJsonMarketDataProvider(config)
    const data = await provider.getHistoricalPrices({ symbol: "HAH", timeframe: "1D" })

    expect(data[0]).toEqual({ symbol: "HAH", date: "2026-10-08", open: 40, high: 42, low: 39, close: 41, volume: 123456, value: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ mode: "cors" })
  })

  it("maps browser fetch failures to the CORS/network error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const provider = new HttpJsonMarketDataProvider(config)

    await expect(provider.getHistoricalPrices({ symbol: "HAH" })).rejects.toMatchObject<Partial<DataProviderError>>({
      code: "DATA_SOURCE_CORS_UNSUPPORTED",
    })
  })
  it("keeps unknown company exchange and sector as N/A instead of guessing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      symbol: "TEST",
      name: "N/A",
      exchange: "N/A",
      sector: "N/A",
    }), { status: 200, headers: { "content-type": "application/json" } })))
    const provider = new HttpJsonMarketDataProvider(config)
    const company = await provider.getCompanyInfo("TEST")
    expect(company.exchange).toBe("N/A")
    expect(company.sector).toBe("N/A")
  })

  it("preserves upstream timeout details from the OHLCV endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "VNSTOCK_UPSTREAM_TIMEOUT",
      error: "VNSTOCK_UPSTREAM_TIMEOUT: KBS OHLCV timed out for HAH",
    }), { status: 502, headers: { "content-type": "application/json" } })))
    const provider = new HttpJsonMarketDataProvider(config)

    await expect(provider.getHistoricalPrices({ symbol: "HAH" })).rejects.toThrow("VNSTOCK_UPSTREAM_TIMEOUT")
  })

})
