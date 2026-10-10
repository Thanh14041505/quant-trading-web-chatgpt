import { useCallback, useMemo, useState } from "react"
import { getMarketDataProvider, getSelectedProviderId } from "@/data/providers/provider-registry"
import { scanUniverse, readScannerCache, writeScannerCache } from "@/quant/scanner"
import type { ScannerConfig, ScannerProgress, ScannerRunResult } from "@/quant/scanner"

export function useScanner(config: ScannerConfig) {
  const providerId = getSelectedProviderId()
  const provider = useMemo(() => getMarketDataProvider(providerId), [providerId])
  const [result, setResult] = useState<ScannerRunResult | null>(null)
  const [progress, setProgress] = useState<ScannerProgress | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const run = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    const runConfig = { ...config, mode: forceRefresh ? "FORCE_REFRESH" as const : (config.mode ?? "DEFAULT" as const) }
    try {
      if (!forceRefresh && runConfig.mode !== "CACHE_ONLY") {
        const cached = await readScannerCache(providerId, runConfig)
        if (cached.status === "HIT_FRESH" && cached.envelope) {
          setResult({ ...cached.envelope.payload, dataMode: "CACHED" })
          setProgress(cached.envelope.payload.progress)
          return cached.envelope.payload
        }
      }
      const scan = await scanUniverse(provider, runConfig, setProgress)
      await writeScannerCache(providerId, runConfig, scan)
      setResult(scan)
      return scan
    } catch (cause) {
      const causeError = cause instanceof Error ? cause : new Error("Scanner failed")
      setError(causeError)
      const stale = await readScannerCache(providerId, runConfig)
      if (stale.envelope) {
        const fallback = { ...stale.envelope.payload, dataMode: "STALE_CACHE" as const }
        setResult(fallback)
        setProgress(fallback.progress)
        return fallback
      }
      throw causeError
    } finally {
      setIsLoading(false)
    }
  }, [config, provider, providerId])

  return { providerId, result, progress, isLoading, error, run }
}
