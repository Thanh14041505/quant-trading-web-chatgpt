import { clientCache } from "@/data/cache/client-cache"
import { DEFAULT_CACHE_POLICIES } from "@/models/cache"
import type { ScannerConfig, ScannerRunResult } from "./types"

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${key}:${stable(record[key])}`).join("|")}}`
  }
  return JSON.stringify(value)
}

export function scannerCacheKey(providerId: string, config: ScannerConfig) {
  return clientCache.buildKey({
    providerId,
    kind: "scannerResults",
    extra: `${config.engine}|${stable({ ...config, mode: undefined })}`,
  })
}

export async function readScannerCache(providerId: string, config: ScannerConfig) {
  return clientCache.get<ScannerRunResult>(scannerCacheKey(providerId, config), "scannerResults")
}

export async function writeScannerCache(providerId: string, config: ScannerConfig, payload: ScannerRunResult) {
  return clientCache.set({
    kind: "scannerResults",
    providerId,
    ttlMs: DEFAULT_CACHE_POLICIES.scannerResults.ttlMs,
    payload,
    keyParts: { extra: `${config.engine}|${stable({ ...config, mode: undefined })}` },
    metadata: { source: "scanner", engine: config.engine },
  })
}
