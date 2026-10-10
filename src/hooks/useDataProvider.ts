import { useMutation, useQuery } from "@tanstack/react-query"
import { getMarketDataProvider, getSelectedProviderId } from "@/data/providers/provider-registry"
import type { HistoricalPriceRequest } from "@/data/providers/market-data-provider"

export function useProviderHealth(providerId: string) {
  return useQuery({
    queryKey: ["provider-health", providerId],
    queryFn: () => getMarketDataProvider(providerId).testConnection(),
    staleTime: 60_000,
    retry: 0,
    enabled: Boolean(providerId),
  })
}

export function useTestProvider(providerId: string) {
  return useMutation({
    mutationFn: () => getMarketDataProvider(providerId).testConnection(),
  })
}

export function useHistoricalPrices(request: HistoricalPriceRequest, enabled = true) {
  const providerId = getSelectedProviderId()
  return useQuery({
    queryKey: ["historical-prices", providerId, request],
    queryFn: () => getMarketDataProvider(providerId).getHistoricalPrices(request),
    staleTime: 5 * 60_000,
    retry: 0,
    enabled,
  })
}
