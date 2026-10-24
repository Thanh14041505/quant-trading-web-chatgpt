export type CacheEntryKind =
  | "marketData"
  | "marketIndex"
  | "companyInfo"
  | "fundamentals"
  | "scannerResults"
  | "scannerExports"
  | "backtestResults"

export type CacheLookupStatus = "HIT_FRESH" | "HIT_STALE" | "MISS"

export interface CacheKeyParts {
  providerId: string
  kind: CacheEntryKind
  symbol?: string
  timeframe?: string
  startDate?: string
  endDate?: string
  extra?: string
}

export interface CacheEnvelope<T> {
  key: string
  version: 1
  kind: CacheEntryKind
  providerId: string
  createdAt: string
  expiresAt: string
  lastAccessedAt: string
  payload: T
  metadata?: Record<string, string | number | boolean | null>
}

export interface CacheLookup<T> {
  status: CacheLookupStatus
  envelope?: CacheEnvelope<T>
  ageMs?: number
  ttlRemainingMs?: number
}

export interface CacheStats {
  memoryEntries: number
  indexedDbEntries: number
  available: boolean
  dbName: string
  dbVersion: number
}

export interface CachePolicy {
  ttlMs: number
  allowStaleWhenOffline: boolean
}

export const DEFAULT_CACHE_POLICIES: Record<CacheEntryKind, CachePolicy> = {
  marketData: { ttlMs: 15 * 60_000, allowStaleWhenOffline: true },
  marketIndex: { ttlMs: 15 * 60_000, allowStaleWhenOffline: true },
  companyInfo: { ttlMs: 7 * 24 * 60 * 60_000, allowStaleWhenOffline: true },
  fundamentals: { ttlMs: 24 * 60 * 60_000, allowStaleWhenOffline: true },
  scannerResults: { ttlMs: 30 * 24 * 60 * 60_000, allowStaleWhenOffline: true },
  scannerExports: { ttlMs: 30 * 24 * 60 * 60_000, allowStaleWhenOffline: true },
  backtestResults: { ttlMs: 24 * 60 * 60_000, allowStaleWhenOffline: true },
}
