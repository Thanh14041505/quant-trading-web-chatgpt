import { useQueries, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { calculateFeatures } from "@/quant/features"
import { calculateBreadthFromFeatures, calculateMarketRegime } from "@/quant/regime"
import type { FeatureSnapshot, FeatureEngineResult } from "@/indicators/types"
import type { MarketRegimeSnapshot, SectorStrengthSnapshot, StockBreadthInput } from "@/quant/regime"
import { getMarketDataProvider, getSelectedProviderId } from "@/data/providers/provider-registry"

const DEMO_BREADTH_SYMBOLS = ["HAH", "GMD", "DXP", "PHP", "VCB", "SSI", "VHM", "HPG", "FPT"] as const

interface SectorAccumulator {
  sector: string
  returns: number[]
}

function aggregateSectorStrength(items: Array<{ sector: string; feature: FeatureSnapshot }>): SectorStrengthSnapshot[] {
  const groups = new Map<string, SectorAccumulator>()
  for (const item of items) {
    const existing = groups.get(item.sector) ?? { sector: item.sector, returns: [] }
    existing.returns.push(item.feature.momentum.roc20)
    groups.set(item.sector, existing)
  }
  return [...groups.values()]
    .map((group) => ({
      sector: group.sector,
      return20: group.returns.reduce((sum, value) => sum + value, 0) / Math.max(1, group.returns.length),
    }))
    .sort((a, b) => b.return20 - a.return20)
}

export function useMarketRegime() {
  const providerId = getSelectedProviderId()
  const provider = useMemo(() => getMarketDataProvider(providerId), [providerId])
  const indexQuery = useQuery({
    queryKey: ["market-regime", providerId, "VNINDEX"],
    queryFn: () => provider.getMarketIndex("VNINDEX", { timeframe: "1D" }),
    staleTime: 5 * 60_000,
  })
  const stockQueries = useQueries({
    queries: DEMO_BREADTH_SYMBOLS.map((symbol) => ({
      queryKey: ["market-regime-breadth", providerId, symbol],
      queryFn: () => provider.getHistoricalPrices({ symbol, timeframe: "1D" }),
      staleTime: 5 * 60_000,
      enabled: providerId === "mock",
    })),
  })
  const companyQueries = useQueries({
    queries: DEMO_BREADTH_SYMBOLS.map((symbol) => ({
      queryKey: ["market-regime-company", providerId, symbol],
      queryFn: () => provider.getCompanyInfo(symbol),
      staleTime: 24 * 60 * 60_000,
      enabled: providerId === "mock",
    })),
  })

  const breadthInputs = useMemo<StockBreadthInput[]>(() => {
    if (providerId !== "mock") return []
    return stockQueries
      .map((query, index): StockBreadthInput | null => {
        const prices = query.data ?? []
        if (prices.length < 30) return null
        const featureResult: FeatureEngineResult = calculateFeatures(prices)
        const previousClose = prices.at(-2)?.close
        return { symbol: String(DEMO_BREADTH_SYMBOLS[index]), previousClose, feature: featureResult.snapshot }
      })
      .filter((value): value is StockBreadthInput => value !== null)
  }, [providerId, stockQueries])

  const regime = useMemo<MarketRegimeSnapshot | null>(() => {
    if (!indexQuery.data?.length) return null
    const breadth = providerId === "mock" && breadthInputs.length
      ? calculateBreadthFromFeatures(breadthInputs)
      : undefined
    const sectorStrength = breadthInputs.length
      ? aggregateSectorStrength(breadthInputs.map((item) => {
          const symbolIndex = DEMO_BREADTH_SYMBOLS.indexOf(item.symbol as typeof DEMO_BREADTH_SYMBOLS[number])
          return {
            sector: companyQueries[symbolIndex]?.data?.sector ?? "Other",
            feature: item.feature,
          }
        }))
      : []
    return calculateMarketRegime({
      indexData: indexQuery.data,
      indexSymbol: "VNINDEX",
      breadth,
      sectorStrength,
    })
  }, [breadthInputs, companyQueries, indexQuery.data, providerId])

  const refresh = async () => {
    await Promise.all([
      indexQuery.refetch(),
      ...stockQueries.map((query) => query.refetch()),
      ...companyQueries.map((query) => query.refetch()),
    ])
  }

  return {
    providerId,
    regime,
    isLoading: indexQuery.isLoading || stockQueries.some((query) => query.isLoading) || companyQueries.some((query) => query.isLoading),
    isError: indexQuery.isError,
    error: indexQuery.error,
    breadthIsSample: providerId === "mock" && breadthInputs.length > 0,
    refresh,
  }
}
