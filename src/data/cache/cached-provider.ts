import { buildCacheKey } from "@/data/cache/cache-key"
import { clientCache } from "@/data/cache/client-cache"
import { DEFAULT_CACHE_POLICIES } from "@/models/cache"
import type { CacheEntryKind } from "@/models/cache"
import type { CompanyInfo, FundamentalData, OHLCV } from "@/models/market"
import type { DataRequestCacheMode, MarketDataProvider, HistoricalPriceRequest } from "@/data/providers/market-data-provider"

export type CacheMode = DataRequestCacheMode

export interface CacheAwareRequestOptions {
  cacheMode?: CacheMode
}

function getCacheMode(request?: CacheAwareRequestOptions) {
  return request?.cacheMode ?? "default"
}

function getOfflineStatus() {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

export type CacheResolution = "FRESH_CACHE" | "STALE_CACHE_FALLBACK" | "NETWORK" | "CACHE_ONLY"

export class CachedMarketDataProvider implements MarketDataProvider {
  readonly id: string
  readonly name: string
  readonly cacheProviderId: string
  private readonly source: MarketDataProvider
  private lastResolution: CacheResolution = "NETWORK"

  constructor(source: MarketDataProvider, cacheNamespace?: string) {
    this.source = source
    this.id = source.id
    this.name = source.name
    this.cacheProviderId = `${source.id}|${cacheNamespace?.trim() || source.id}`
  }

  async getHistoricalPrices(request: HistoricalPriceRequest & CacheAwareRequestOptions): Promise<OHLCV[]> {
    return this.getOrFetch(
      "marketData",
      {
        symbol: request.symbol,
        timeframe: request.timeframe,
        startDate: request.startDate,
        endDate: request.endDate,
      },
      getCacheMode(request),
      () => this.source.getHistoricalPrices(request),
      DEFAULT_CACHE_POLICIES.marketData.ttlMs,
    )
  }

  async getCompanyInfo(symbol: string): Promise<CompanyInfo> {
    return this.getOrFetch("companyInfo", { symbol }, "default", () => this.source.getCompanyInfo(symbol), DEFAULT_CACHE_POLICIES.companyInfo.ttlMs)
  }

  async getFundamentals(symbol: string): Promise<FundamentalData> {
    return this.getOrFetch("fundamentals", { symbol }, "default", () => this.source.getFundamentals(symbol), DEFAULT_CACHE_POLICIES.fundamentals.ttlMs)
  }

  async getMarketIndex(symbol: string, request: Omit<HistoricalPriceRequest, "symbol"> = {}): Promise<OHLCV[]> {
    const mode = getCacheMode(request as CacheAwareRequestOptions)
    return this.getOrFetch(
      "marketIndex",
      {
        symbol,
        timeframe: request.timeframe,
        startDate: request.startDate,
        endDate: request.endDate,
      },
      mode,
      () => this.source.getMarketIndex(symbol, request),
      DEFAULT_CACHE_POLICIES.marketIndex.ttlMs,
    )
  }

  testConnection() {
    return this.source.testConnection()
  }

  async cacheStats() {
    return clientCache.stats()
  }

  cacheKey(kind: CacheEntryKind, parts: { symbol?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    return buildCacheKey({ providerId: this.cacheProviderId, kind, ...parts })
  }

  getLastCacheResolution() {
    return this.lastResolution
  }

  private async getOrFetch<T>(
    kind: CacheEntryKind,
    keyParts: { symbol?: string; timeframe?: string; startDate?: string; endDate?: string },
    mode: CacheMode,
    fetcher: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const key = buildCacheKey({ providerId: this.cacheProviderId, kind, ...keyParts })
    const cached = await clientCache.get<T>(key, kind)

    if (mode !== "force-refresh" && cached.status === "HIT_FRESH") {
      this.lastResolution = "FRESH_CACHE"
      return cached.envelope!.payload
    }

    const offline = getOfflineStatus()
    if ((mode === "cache-only" || offline) && cached.envelope) {
      this.lastResolution = mode === "cache-only" ? "CACHE_ONLY" : "STALE_CACHE_FALLBACK"
      return cached.envelope.payload
    }

    if (mode === "cache-only") {
      throw new Error(`CACHE_MISS: No cached ${kind} data is available for ${keyParts.symbol ?? "request"}.`)
    }

    if (offline) {
      throw new Error(`OFFLINE_CACHE_MISS: No cached ${kind} data is available for ${keyParts.symbol ?? "request"}.`)
    }

    try {
      const data = await fetcher()
      this.lastResolution = "NETWORK"
      await clientCache.set({
        kind,
        providerId: this.cacheProviderId,
        ttlMs,
        payload: data,
        keyParts,
        metadata: { source: "network" },
      })
      return data
    } catch (error) {
      if (cached.envelope) {
        this.lastResolution = "STALE_CACHE_FALLBACK"
        return cached.envelope.payload
      }
      throw error
    }
  }
}
