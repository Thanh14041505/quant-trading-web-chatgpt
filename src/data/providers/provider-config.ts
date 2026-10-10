import type { DataProviderConfig } from "@/models/provider"

export const DEFAULT_HTTP_PROVIDER_CONFIG: DataProviderConfig = {
  id: "http-json",
  name: "CORS JSON Provider",
  // Empty base URL means same-origin Vercel Functions.
  baseUrl: "",
  apiKey: "",
  apiKeyHeader: "X-VNSTOCK-KEY",
  authScheme: "api-key-header",
  historicalPath: "/api/ohlcv",
  companyPath: "/api/company",
  fundamentalsPath: "/api/fundamentals",
  marketIndexPath: "/api/market_index",
  healthPath: "/api/health",
}

const STORAGE_KEY = "quant-provider-config-v2"

export function loadHttpProviderConfig(): DataProviderConfig {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_HTTP_PROVIDER_CONFIG }
    return { ...DEFAULT_HTTP_PROVIDER_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_HTTP_PROVIDER_CONFIG }
  }
}

export function saveHttpProviderConfig(config: DataProviderConfig) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...config,
    apiKey: config.apiKey ?? "",
  }))
}

export function clearHttpProviderConfig() {
  sessionStorage.removeItem(STORAGE_KEY)
}
