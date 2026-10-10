import type { CompanyInfo, DataProviderHealth, FundamentalData, OHLCV } from "@/models/market"

export type DataRequestCacheMode = "default" | "force-refresh" | "cache-only"

export interface HistoricalPriceRequest {
  symbol: string
  startDate?: string
  endDate?: string
  timeframe?: "1D" | "1W" | "1M"
  cacheMode?: DataRequestCacheMode
}

export interface MarketDataProvider {
  readonly id: string
  readonly name: string
  getHistoricalPrices(request: HistoricalPriceRequest): Promise<OHLCV[]>
  getCompanyInfo(symbol: string): Promise<CompanyInfo>
  getFundamentals(symbol: string): Promise<FundamentalData>
  getMarketIndex(symbol: string, request?: Omit<HistoricalPriceRequest, "symbol">): Promise<OHLCV[]>
  testConnection(): Promise<DataProviderHealth>
}
