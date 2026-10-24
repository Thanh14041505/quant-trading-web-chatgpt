import { useCallback, useEffect, useMemo, useState } from "react"
import { getMarketDataProvider, getSelectedProviderId } from "@/data/providers/provider-registry"
import { scanUniverse, readScannerCache, writeScannerCache, readScannerExcel, writeScannerExcel, removeScannerExcel } from "@/quant/scanner"
import type { ScannerConfig, ScannerProgress, ScannerRunResult } from "@/quant/scanner"
import { clientCache } from "@/data/cache/client-cache"

type XlsxWorkerResponse =
  | { type: "SUCCESS"; requestId: string; buffer: ArrayBuffer }
  | { type: "ERROR"; requestId: string; message: string }

function buildTplusExcelInWorker(result: ScannerRunResult): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../quant/scanner/tplus-xlsx.worker.ts", import.meta.url), { type: "module" })
    const requestId = "tplus-" + Date.now().toString()
    const cleanUp = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<XlsxWorkerResponse>) => {
      const message = event.data
      if (message.requestId !== requestId) return
      cleanUp()
      if (message.type === "SUCCESS") resolve(new Uint8Array(message.buffer))
      else reject(new Error(message.message))
    }
    worker.onerror = (event: ErrorEvent) => {
      cleanUp()
      reject(new Error(event.message || "T+ Excel worker failed"))
    }
    worker.postMessage({ type: "BUILD", requestId, result })
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useScanner(config: ScannerConfig) {
  const providerId = getSelectedProviderId()
  const provider = useMemo(() => getMarketDataProvider(providerId), [providerId])
  const [result, setResult] = useState<ScannerRunResult | null>(null)
  const [progress, setProgress] = useState<ScannerProgress | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null)
  const [isPreparingExcel, setIsPreparingExcel] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  const cacheConfig = useMemo(() => ({ ...config, mode: undefined }), [config])

  const prepareExcel = useCallback(async (
    payload: ScannerRunResult,
    artifactConfig: ScannerConfig,
    reuseExisting = true,
  ) => {
    if (payload.engine !== "TPLUS") return
    setExcelError(null)
    setIsPreparingExcel(true)
    try {
      if (reuseExisting) {
        const cached = await readScannerExcel(providerId, artifactConfig)
        if (cached.envelope?.payload instanceof Blob) {
          setExcelBlob(cached.envelope.payload)
          return
        }
      }
      const bytes = await buildTplusExcelInWorker(payload)
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      await writeScannerExcel(providerId, artifactConfig, blob)
      setExcelBlob(blob)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to prepare the T+ XLSX workbook."
      setExcelError(message)
      setExcelBlob(null)
    } finally {
      setIsPreparingExcel(false)
    }
  }, [providerId])

  useEffect(() => {
    let cancelled = false
    void readScannerCache(providerId, cacheConfig).then((cached) => {
      if (cancelled || !cached.envelope) return
      const payload = cached.envelope.payload
      setResult({ ...payload, dataMode: cached.status === "HIT_FRESH" ? "CACHED" : "STALE_CACHE" })
      setProgress(payload.progress)
      if (payload.engine === "TPLUS") void prepareExcel(payload, cacheConfig, true)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [cacheConfig, providerId, prepareExcel])

  const run = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    const runConfig: ScannerConfig = { ...config, mode: forceRefresh ? "FORCE_REFRESH" : (config.mode ?? "DEFAULT") }
    try {
      if (forceRefresh) {
        const previous = await readScannerCache(providerId, runConfig)
        if (previous.envelope) {
          await clientCache.remove(previous.envelope.key, "scannerResults")
        }
        await removeScannerExcel(providerId, runConfig)
        setResult(null)
        setProgress(null)
        setExcelBlob(null)
        setExcelError(null)
      }
      if (!forceRefresh && runConfig.mode !== "CACHE_ONLY") {
        const cached = await readScannerCache(providerId, runConfig)
        if (cached.status === "HIT_FRESH" && cached.envelope) {
          setResult({ ...cached.envelope.payload, dataMode: "CACHED" })
          setProgress(cached.envelope.payload.progress)
          if (cached.envelope.payload.engine === "TPLUS") void prepareExcel(cached.envelope.payload, runConfig, true)
          return cached.envelope.payload
        }
      }
      const scan = await scanUniverse(provider, runConfig, setProgress)
      await writeScannerCache(providerId, runConfig, scan)
      setResult(scan)
      if (scan.engine === "TPLUS") void prepareExcel(scan, runConfig, false)
      return scan
    } catch (cause) {
      const causeError = cause instanceof Error ? cause : new Error("Scanner failed")
      setError(causeError)
      const stale = await readScannerCache(providerId, runConfig)
      if (stale.envelope) {
        const fallback = { ...stale.envelope.payload, dataMode: "STALE_CACHE" as const }
        setResult(fallback)
        setProgress(fallback.progress)
        if (fallback.engine === "TPLUS") void prepareExcel(fallback, runConfig, true)
        return fallback
      }
      throw causeError
    } finally {
      setIsLoading(false)
    }
  }, [config, provider, providerId, prepareExcel])

  const downloadExcel = useCallback(() => {
    if (!excelBlob || !result || result.engine !== "TPLUS") return false
    const stamp = (result.generatedAt || new Date().toISOString()).replace(/[:.]/g, "-")
    downloadBlob(excelBlob, "vn_quant_tplus_" + stamp + ".xlsx")
    return true
  }, [excelBlob, result])

  return {
    providerId, result, progress, isLoading, error, run,
    excelReady: Boolean(excelBlob),
    isPreparingExcel,
    excelError,
    downloadExcel,
  }
}
