import type { CompanyInfo, OHLCV } from "@/models/market"
import type { MarketDataProvider } from "@/data/providers/market-data-provider"
import { calculateFeatures } from "@/quant/features"
import { calculateHoldSignal } from "@/quant/hold"
import { calculateMarketRegime } from "@/quant/regime"
import { calculateTplusSignal } from "@/quant/tplus"
import { buildTplusExecutionDiagnostics } from "./tplus-diagnostics"
import type { ScannerConfig, ScannerError, ScannerProgress, ScannerRow, ScannerRunResult, TplusScannerRow, HoldScannerRow } from "./types"
import type { MarketRegimeSnapshot } from "@/quant/regime"

const DEFAULT_CONCURRENCY = 4

function calculateAverageValue20(data: OHLCV[]) {
  const values = data.slice(-20).map((bar) => Number.isFinite(bar.value) ? bar.value! : bar.close * bar.volume)
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function normalizeSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
}

function unavailableCompany(symbol: string): CompanyInfo {
  return { symbol, name: symbol, exchange: "N/A", sector: "N/A" }
}

function matchesUniverse(row: ScannerRow, config: ScannerConfig) {
  const universe = config.universe
  if (!universe) return true
  if (row.averageValue20 < universe.minAverageValue20) return false
  if (universe.exchanges?.length && row.company.exchange !== "N/A" && !universe.exchanges.includes(row.company.exchange)) return false
  if (universe.sectors?.length && !["N/A", "Unknown"].includes(row.company.sector) && !universe.sectors.includes(row.company.sector)) return false
  return true
}

export function filterAndRankRows(rows: ScannerRow[], config: ScannerConfig) {
  const filtered = rows.filter((row) => row.status === "SUCCESS" && matchesUniverse(row, config)).filter((row) => {
    if (row.engine === "TPLUS") {
      const rules = config.tplus
      if (!row.signal || (rules?.minScore != null && row.signal.score < rules.minScore)) return false
      if (rules?.actions?.length && !rules.actions.includes(row.signal.action)) return false
      if (rules?.setups?.length && !rules.setups.includes(row.signal.setup)) return false
      if (rules?.regimes?.length && !rules.regimes.includes(row.signal.marketRegime)) return false
      return true
    }
    const rules = config.hold
    if (!row.signal || (rules?.minScore != null && row.signal.score < rules.minScore)) return false
    if (rules?.actions?.length && !rules.actions.includes(row.signal.action)) return false
    return true
  })

  return [...filtered].sort((a, b) => {
    const scoreA = a.signal?.score ?? -Infinity
    const scoreB = b.signal?.score ?? -Infinity
    if (scoreB !== scoreA) return scoreB - scoreA
    return b.averageValue20 - a.averageValue20
  })
}

async function runConcurrent<T>(items: string[], concurrency: number, task: (item: string) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await task(items[index])
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, worker)
  await Promise.all(workers)
  return results
}

function makeScannerError(symbol: string, error: unknown): ScannerError {
  const message = error instanceof Error ? error.message : "Unknown scanner error"
  const code = message.startsWith("OFFLINE_") ? "OFFLINE" : message.startsWith("CORS_") ? "CORS" : "DATA_ERROR"
  return { symbol, code, message }
}

async function loadMarketContext(provider: MarketDataProvider, mode: ScannerConfig["mode"]): Promise<{ regime: MarketRegimeSnapshot; indexData: OHLCV[] }> {
  const indexData = await provider.getMarketIndex("VNINDEX", { timeframe: "1D", cacheMode: mode === "FORCE_REFRESH" ? "force-refresh" : mode === "CACHE_ONLY" ? "cache-only" : "default" })
  if (indexData.length < 60) throw new Error("MARKET_CONTEXT_INSUFFICIENT_HISTORY")
  return { indexData, regime: calculateMarketRegime({ indexData, indexSymbol: "VNINDEX" }) }
}

function progressBase(total: number): ScannerProgress {
  return { total, processed: 0, success: 0, failed: 0, cached: 0, fresh: 0 }
}

export async function scanUniverse(provider: MarketDataProvider, config: ScannerConfig, onProgress?: (progress: ScannerProgress) => void): Promise<ScannerRunResult> {
  const symbols = normalizeSymbols(config.symbols)
  if (!symbols.length) throw new Error("SCANNER_EMPTY_UNIVERSE")
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY
  const mode = config.mode ?? "DEFAULT"
  const marketContext = await loadMarketContext(provider, mode)
  const regime = marketContext.regime
  const progress = progressBase(symbols.length)
  const errors: ScannerError[] = []
  const allRows: ScannerRow[] = []

  const results = await runConcurrent(symbols, concurrency, async (symbol) => {
    try {
      // OHLCV is the critical input for T+. Do not spend a second upstream
      // request on company profile data unless a company-based filter is in use.
      // Even then, unavailable metadata must not fail a valid OHLCV scan.
      const needsCompany = config.engine === "HOLD" || Boolean(
        config.universe?.exchanges?.length || config.universe?.sectors?.length
      )
      let companyUnavailable = false
      const cacheMode = mode === "FORCE_REFRESH" ? "force-refresh" : mode === "CACHE_ONLY" ? "cache-only" : "default"
      const pricesPromise = provider.getHistoricalPrices({ symbol, timeframe: "1D", cacheMode })
      const companyPromise: Promise<CompanyInfo> = needsCompany
        ? provider.getCompanyInfo(symbol).catch((error) => {
            if (config.engine === "HOLD") throw error
            companyUnavailable = true
            return unavailableCompany(symbol)
          })
        : Promise.resolve(unavailableCompany(symbol))
      const [company, prices] = await Promise.all([companyPromise, pricesPromise])
      if (prices.length < 60) throw new Error("INSUFFICIENT_HISTORY")
      const features = calculateFeatures(prices, { benchmark: marketContext.indexData })
      const averageValue20 = calculateAverageValue20(prices)
      if (config.engine === "TPLUS") {
        const engine = calculateTplusSignal({ data: prices, features, regime })
        const executionDiagnostics = buildTplusExecutionDiagnostics({
          history: prices,
          features,
          signal: engine.signal,
          candidate: engine.candidate ?? undefined,
        })
        const row: TplusScannerRow = {
          engine: "TPLUS",
          symbol,
          company,
          averageValue20,
          status: "SUCCESS",
          signal: engine.signal,
          setupCandidate: engine.candidate ?? undefined,
          executionDiagnostics,
          feature: features.snapshot,
          volumeProfile: features.volumeProfile,
          history: prices,
          detailWarnings: companyUnavailable ? ["COMPANY_INFO_UNAVAILABLE"] : undefined,
        }
        progress.success += 1
        return row
      }
      const fundamentals = await provider.getFundamentals(symbol)
      const engine = calculateHoldSignal({ company, fundamentals, features, data: prices })
      const row: HoldScannerRow = { engine: "HOLD", symbol, company, averageValue20, status: "SUCCESS", signal: engine.signal, fundamentals, feature: features.snapshot, history: prices, featureDetails: features }
      progress.success += 1
      return row
    } catch (error) {
      const scanError = makeScannerError(symbol, error)
      errors.push(scanError)
      progress.failed += 1
      return {
        engine: config.engine,
        symbol,
        company: { symbol, name: symbol, exchange: "HOSE", sector: "Other" },
        averageValue20: 0,
        status: "FAILED",
        error: scanError.message,
      } as ScannerRow
    } finally {
      progress.processed += 1
      onProgress?.({ ...progress })
    }
  })

  allRows.push(...results)

  // Add peer-relative valuation context from the successful Hold scan itself.
  // This is explicitly a scanned-universe median, not a market-wide sector median.
  if (config.engine === "HOLD") {
    const peerGroups = new Map<string, HoldScannerRow[]>()
    for (const row of allRows) {
      if (row.engine !== "HOLD" || row.status !== "SUCCESS" || !row.fundamentals) continue
      const sector = row.company.sector || "Other"
      const group = peerGroups.get(sector) ?? []
      group.push(row)
      peerGroups.set(sector, group)
    }
    const median = (values: number[]) => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
      if (!sorted.length) return undefined
      const middle = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    }
    for (const group of peerGroups.values()) {
      const peerCount = group.length
      const pe = median(group.map((row) => row.fundamentals?.pe).filter((value): value is number => value != null && value > 0))
      const pb = median(group.map((row) => row.fundamentals?.pb).filter((value): value is number => value != null && value > 0))
      for (const row of group) {
        if (!row.fundamentals) continue
        row.fundamentals = {
          ...row.fundamentals,
          sectorMedianPe: pe,
          sectorMedianPb: pb,
          sectorPeerCount: peerCount,
          sectorBenchmarkScope: "CURRENT_HOLD_SCAN_UNIVERSE",
        }
      }
    }
  }

  return {
    schemaVersion: 3,
    engine: config.engine,
    providerId: provider.id,
    generatedAt: new Date().toISOString(),
    rows: allRows,
    requestedSymbols: symbols,
    scanConfig: { ...config, mode: undefined },
    marketIndexHistory: marketContext.indexData,
    errors,
    progress: { ...progress },
    marketRegime: regime,
    dataMode: mode === "CACHE_ONLY" ? "CACHED" : "LIVE",
    universeSource: config.universeSource ?? "CONFIGURED",
  }
}
