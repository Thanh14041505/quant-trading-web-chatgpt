import type { CompanyInfo, FundamentalData, OHLCV } from "@/models/market"
import type { FeatureEngineResult, FeatureSnapshot } from "@/indicators/types"
import type { MarketRegimeSnapshot } from "@/quant/regime"
import type { TradingSignal } from "@/quant/tplus"
import type { HoldSignal } from "@/quant/hold"

export type ScannerEngine = "TPLUS" | "HOLD"
export type ScanMode = "DEFAULT" | "FORCE_REFRESH" | "CACHE_ONLY"
export type ScannerResultStatus = "SUCCESS" | "FAILED"

export interface UniverseFilterConfig {
  minAverageValue20: number
  exchanges?: CompanyInfo["exchange"][]
  sectors?: string[]
}

export interface ScannerConfig {
  engine: ScannerEngine
  symbols: string[]
  universeSource?: "CONFIGURED" | "CUSTOM"
  mode?: ScanMode
  concurrency?: number
  universe?: UniverseFilterConfig
  tplus?: {
    minScore?: number
    actions?: TradingSignal["action"][]
    setups?: TradingSignal["setup"][]
    regimes?: TradingSignal["marketRegime"][]
  }
  hold?: {
    minScore?: number
    actions?: HoldSignal["action"][]
  }
}

export interface ScannerRowBase {
  symbol: string
  company: CompanyInfo
  averageValue20: number
  status: ScannerResultStatus
  error?: string
  feature?: FeatureSnapshot
  /** Full price history and indicator series retained for detail-level Excel exports. */
  history?: OHLCV[]
  featureDetails?: FeatureEngineResult
  fundamentals?: FundamentalData
  tplusSignal?: TradingSignal
  holdSignal?: HoldSignal
  detailWarnings?: string[]
}

export interface TplusScannerRow extends ScannerRowBase {
  engine: "TPLUS"
  signal?: TradingSignal
}

export interface HoldScannerRow extends ScannerRowBase {
  engine: "HOLD"
  signal?: HoldSignal
  fundamentals?: FundamentalData
}

export type ScannerRow = TplusScannerRow | HoldScannerRow

export interface ScannerError {
  symbol: string
  code: string
  message: string
}

export interface ScannerProgress {
  total: number
  processed: number
  success: number
  failed: number
  cached: number
  fresh: number
}

export interface ScannerRunResult {
  /** Increment when the persisted snapshot/export schema changes. */
  schemaVersion: 2
  engine: ScannerEngine
  providerId: string
  generatedAt: string
  /** Includes every symbol scanned, including failures, not only visible ranked rows. */
  rows: ScannerRow[]
  requestedSymbols: string[]
  scanConfig: ScannerConfig
  marketIndexHistory?: OHLCV[]
  errors: ScannerError[]
  progress: ScannerProgress
  marketRegime?: MarketRegimeSnapshot
  dataMode: "LIVE" | "CACHED" | "STALE_CACHE"
  universeSource: "CONFIGURED" | "CUSTOM"
}
