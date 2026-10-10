import { CachedMarketDataProvider } from "@/data/cache/cached-provider"
import { loadHttpProviderConfig } from "./provider-config"
import { HttpJsonMarketDataProvider } from "./httpJsonProvider"
import type { MarketDataProvider } from "./market-data-provider"
import { MockMarketDataProvider } from "./mockProvider"

export const PROVIDER_SELECTION_STORAGE_KEY = "quant-active-provider"

const mockProvider = new MockMarketDataProvider()

function buildHttpProvider() {
  const config = loadHttpProviderConfig()
  return {
    provider: new HttpJsonMarketDataProvider(config),
    cacheNamespace: [config.baseUrl, config.historicalPath, config.marketIndexPath, config.companyPath, config.fundamentalsPath].join("|") || "http-json",
  }
}

export function getRawMarketDataProvider(id: string): MarketDataProvider {
  if (id === "http-json") return buildHttpProvider().provider
  return mockProvider
}

export function getMarketDataProvider(id: string): MarketDataProvider {
  if (id === "http-json") {
    const built = buildHttpProvider()
    return new CachedMarketDataProvider(built.provider, built.cacheNamespace)
  }
  return new CachedMarketDataProvider(mockProvider, mockProvider.id)
}

export function getSelectedProviderId(): string {
  try {
    return sessionStorage.getItem(PROVIDER_SELECTION_STORAGE_KEY) ?? "mock"
  } catch {
    return "mock"
  }
}

export function setSelectedProviderId(id: string) {
  sessionStorage.setItem(PROVIDER_SELECTION_STORAGE_KEY, id)
}

export function listMarketDataProviders(): Array<Pick<MarketDataProvider, "id" | "name">> {
  return [
    { id: mockProvider.id, name: mockProvider.name },
    { id: "http-json", name: "CORS JSON Provider" },
  ]
}
