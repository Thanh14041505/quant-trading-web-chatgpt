import type { CompanyInfo, DataProviderHealth, FundamentalData, OHLCV } from "@/models/market"
import type { DataProviderConfig, ProviderTestResult } from "@/models/provider"
import type { HistoricalPriceRequest, MarketDataProvider } from "./market-data-provider"
import { DataProviderError } from "./provider-errors"
import { assertUsableOHLCV, validateOHLCVRows } from "../validation/market-data-validator"

const DEFAULT_TIMEOUT_MS = 55_000

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function asDate(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) {
    const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

function pick(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  if (!record) return []
  for (const key of ["data", "result", "results", "items", "rows", "records", "payload"]) {
    if (Array.isArray(record[key])) return record[key]
    const nested = asRecord(record[key])
    if (nested) {
      const nestedRows = extractRows(nested)
      if (nestedRows.length > 0) return nestedRows
    }
  }
  return []
}

function renderPath(template: string, params: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(params[key] ?? ""))
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/$/, "")
  const trimmedPath = path.trim()
  if (!trimmedPath) return trimmedBase
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath
  return `${trimmedBase}/${trimmedPath.replace(/^\//, "")}`
}

function buildHeaders(config: DataProviderConfig): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  if (!config.apiKey) return headers
  if (config.authScheme === "api-key-header") {
    headers[config.apiKeyHeader?.trim() || "X-API-Key"] = config.apiKey
    return headers
  }
  if (config.authScheme === "none") return headers
  headers.Authorization = `Bearer ${config.apiKey}`
  return headers
}

function providerHealth(result: ProviderTestResult, name: string): DataProviderHealth {
  return {
    status: result.status,
    provider: name,
    lastSync: result.lastSync,
    note: result.note,
  }
}

export class HttpJsonMarketDataProvider implements MarketDataProvider {
  readonly id: string
  readonly name: string
  private readonly config: DataProviderConfig
  private readonly timeoutMs: number

  constructor(config: DataProviderConfig, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.config = { ...config, baseUrl: config.baseUrl.trim() }
    this.id = config.id
    this.name = config.name
    this.timeoutMs = timeoutMs
  }

  private assertConfiguration() {
    if (this.config.baseUrl.trim() && !/^https?:\/\//i.test(this.config.baseUrl)) {
      throw new DataProviderError("Provider base URL must start with http:// or https://.", "INVALID_CONFIGURATION")
    }
  }

  private async requestJson(path: string, query?: Record<string, string | undefined>): Promise<{ payload: unknown; url: string; latencyMs: number }> {
    this.assertConfiguration()
    const baseUrl = this.config.baseUrl.trim()
    let url: URL
    if (baseUrl) {
      url = new URL(joinUrl(baseUrl, path))
    } else {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined
      if (!origin) throw new DataProviderError("A base URL is required outside a browser. In Vercel, leave it blank to use same-origin /api functions.", "INVALID_CONFIGURATION")
      url = new URL(path.startsWith("/") ? path : `/${path}`, origin)
    }
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const started = performance.now()

    try {
      let response: Response
      try {
        response = await fetch(url.toString(), {
          method: "GET",
          mode: "cors",
          headers: buildHeaders(this.config),
          signal: controller.signal,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new DataProviderError(`Request timed out after ${this.timeoutMs} ms.`, "TIMEOUT", { url: url.toString() })
        }
        throw new DataProviderError(
          "Browser could not read the provider response. The endpoint may not support CORS, may be offline, or may be blocked by the network.",
          "DATA_SOURCE_CORS_UNSUPPORTED",
          { url: url.toString() },
        )
      }

      const latencyMs = Math.round(performance.now() - started)
      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok) {
        throw new DataProviderError(`Provider returned HTTP ${response.status}.`, "HTTP_ERROR", { status: response.status, url: url.toString() })
      }
      if (!contentType.toLowerCase().includes("json")) {
        throw new DataProviderError("Provider response was not JSON.", "INVALID_JSON", { status: response.status, url: url.toString() })
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new DataProviderError("Provider returned invalid JSON.", "INVALID_JSON", { status: response.status, url: url.toString() })
      }
      return { payload, url: url.toString(), latencyMs }
    } finally {
      clearTimeout(timeout)
    }
  }

  private mapOHLCVRows(symbol: string, payload: unknown): OHLCV[] {
    const rows = extractRows(payload)
    const mapped: OHLCV[] = []
    rows.forEach((raw) => {
      const record = asRecord(raw)
      if (!record) return
      const date = asDate(pick(record, ["date", "time", "datetime", "timestamp", "tradingDate"]))
      const open = asNumber(pick(record, ["open", "o", "Open"]))
      const high = asNumber(pick(record, ["high", "h", "High"]))
      const low = asNumber(pick(record, ["low", "l", "Low"]))
      const close = asNumber(pick(record, ["close", "c", "Close", "adjClose", "adjustedClose"]))
      const volume = asNumber(pick(record, ["volume", "v", "Volume"]))
      const value = asNumber(pick(record, ["value", "tradingValue", "valueTraded", "amount"]))

      if (!date || open === undefined || high === undefined || low === undefined || close === undefined || volume === undefined) return
      mapped.push({ symbol: symbol.toUpperCase(), date, open, high, low, close, volume, value })
    })
    return mapped
  }

  private async getOHLCV(pathTemplate: string, request: HistoricalPriceRequest): Promise<OHLCV[]> {
    const path = renderPath(pathTemplate, {
      symbol: request.symbol.toUpperCase(),
      timeframe: request.timeframe ?? "1D",
    })
    const response = await this.requestJson(path, {
      symbol: request.symbol.toUpperCase(),
      // Support the project's Python function query names and generic aliases.
      start: request.startDate,
      end: request.endDate,
      startDate: request.startDate,
      endDate: request.endDate,
      timeframe: request.timeframe ?? "1D",
    })
    const mapped = this.mapOHLCVRows(request.symbol, response.payload)
    const validated = validateOHLCVRows(mapped)
    if (mapped.length === 0) {
      throw new DataProviderError("Provider returned no recognizable OHLCV rows.", "INVALID_DATA", { url: response.url })
    }
    try {
      return assertUsableOHLCV(validated)
    } catch (error) {
      throw new DataProviderError(error instanceof Error ? error.message : "Invalid market data.", "INVALID_DATA", { url: response.url })
    }
  }

  async getHistoricalPrices(request: HistoricalPriceRequest): Promise<OHLCV[]> {
    return this.getOHLCV(this.config.historicalPath, request)
  }

  async getCompanyInfo(symbol: string): Promise<CompanyInfo> {
    const path = renderPath(this.config.companyPath, { symbol: symbol.toUpperCase() })
    const response = await this.requestJson(path, { symbol: symbol.toUpperCase() })
    const record = asRecord(response.payload) ?? asRecord(extractRows(response.payload)[0])
    if (!record) throw new DataProviderError("Provider returned no company object.", "INVALID_DATA", { url: response.url })
    const name = String(pick(record, ["name", "companyName", "company_name"]) ?? symbol.toUpperCase())
    const exchangeRaw = String(pick(record, ["exchange", "exchangeCode", "floor"]) ?? "").trim().toUpperCase()
    const exchange: CompanyInfo["exchange"] = exchangeRaw.includes("HNX")
      ? "HNX"
      : exchangeRaw.includes("UPCOM")
        ? "UPCOM"
        : exchangeRaw.includes("HOSE") || exchangeRaw === "HSX" || exchangeRaw.includes("HO CHI MINH")
          ? "HOSE"
          : "N/A"
    const sector = String(pick(record, ["sectorGroup", "sector_group", "sector", "industry", "industryName"]) ?? "N/A")
    const industry = pick(record, ["industry", "industryName", "industry_name", "icb_name"])
    const industryCode = pick(record, ["industryCode", "industry_code", "icb_code"])
    const industryLevel = asNumber(pick(record, ["industryLevel", "industry_level", "icb_level"]))
    const profileSector = pick(record, ["profileSector", "profile_sector"])
    const sectorSource = pick(record, ["sectorSource", "sector_source"])
    const listingDate = pick(record, ["listingDate", "listing_date"])
    const issuedShares = asNumber(pick(record, ["issuedShares", "issued_shares", "issued_share"]))
    return {
      symbol: symbol.toUpperCase(), name, exchange, sector,
      ...(industry != null ? { industry: String(industry) } : {}),
      ...(industryCode != null ? { industryCode: String(industryCode) } : {}),
      ...(industryLevel != null ? { industryLevel } : {}),
      ...(profileSector != null ? { profileSector: String(profileSector) } : {}),
      ...(sectorSource != null ? { sectorSource: String(sectorSource) } : {}),
      ...(listingDate != null ? { listingDate: String(listingDate) } : {}),
      ...(issuedShares != null ? { issuedShares } : {}),
    }
  }

  async getFundamentals(symbol: string): Promise<FundamentalData> {
    const path = renderPath(this.config.fundamentalsPath, { symbol: symbol.toUpperCase() })
    const response = await this.requestJson(path, { symbol: symbol.toUpperCase() })
    const record = asRecord(response.payload) ?? asRecord(extractRows(response.payload)[0])
    if (!record) throw new DataProviderError("Provider returned no fundamentals object.", "INVALID_DATA", { url: response.url })
    const optionalNumber = (...keys: string[]) => asNumber(pick(record, keys))
    const optionalString = (...keys: string[]) => {
      const value = pick(record, keys)
      return value == null ? undefined : String(value)
    }
    const optionalArray = (...keys: string[]) => {
      const value = pick(record, keys)
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined
    }
    return {
      symbol: symbol.toUpperCase(),
      roe: optionalNumber("roe", "ROE"), roa: optionalNumber("roa", "ROA"), roic: optionalNumber("roic", "ROIC"),
      grossMargin: optionalNumber("grossMargin", "gross_margin"), operatingMargin: optionalNumber("operatingMargin", "operating_margin"),
      netMargin: optionalNumber("netMargin", "net_margin"), operatingCashFlow: optionalNumber("operatingCashFlow", "operating_cash_flow"),
      freeCashFlow: optionalNumber("freeCashFlow", "free_cash_flow"), interestCoverage: optionalNumber("interestCoverage", "interest_coverage"),
      pe: optionalNumber("pe", "PE", "p_e"), pb: optionalNumber("pb", "PB", "p_b"), evEbitda: optionalNumber("evEbitda", "ev_ebitda"),
      peg: optionalNumber("peg", "PEG"), dividendYield: optionalNumber("dividendYield", "dividend_yield"),
      historicalPe: optionalNumber("historicalPe", "historical_pe"), historicalPb: optionalNumber("historicalPb", "historical_pb"),
      sectorMedianPe: optionalNumber("sectorMedianPe", "sector_median_pe"), sectorMedianPb: optionalNumber("sectorMedianPb", "sector_median_pb"),
      revenueGrowth: optionalNumber("revenueGrowth", "revenue_growth"), epsGrowth: optionalNumber("epsGrowth", "eps_growth"),
      revenueCagr: optionalNumber("revenueCagr", "revenue_cagr"), profitCagr: optionalNumber("profitCagr", "profit_cagr"),
      debtToEquity: optionalNumber("debtToEquity", "debt_to_equity", "d_e"), netDebt: optionalNumber("netDebt", "net_debt"),
      inventory: optionalNumber("inventory", "inventories"), npl: optionalNumber("npl", "NPL"), nim: optionalNumber("nim", "NIM"),
      provisioning: optionalNumber("provisioning", "provisioning_coverage"), casa: optionalNumber("casa", "CASA"),
      brokerageShareGrowth: optionalNumber("brokerageShareGrowth", "brokerage_share_growth"),
      marginLendingGrowth: optionalNumber("marginLendingGrowth", "margin_lending_growth"),
      proprietaryTradingGrowth: optionalNumber("proprietaryTradingGrowth", "proprietary_trading_growth"),
      projectPipeline: optionalNumber("projectPipeline", "project_pipeline"),
      legalStatus: (["Clear", "Watch", "At Risk"].includes(String(pick(record, ["legalStatus", "legal_status"]))) ? pick(record, ["legalStatus", "legal_status"]) : undefined) as FundamentalData["legalStatus"],
      catalysts: optionalArray("catalysts"), risks: optionalArray("risks"),
      sectorBenchmarkScope: optionalString("sectorBenchmarkScope", "sector_benchmark_scope"),
      sectorPeerCount: optionalNumber("sectorPeerCount", "sector_peer_count"),
      latestPeriod: optionalString("latestPeriod", "latest_period"), source: optionalString("source"),
      dataAvailable: Boolean(pick(record, ["dataAvailable", "data_available"])),
      notes: optionalArray("notes"),
      reportedPeriods: asRecord(pick(record, ["reportedPeriods", "reported_periods"])) as FundamentalData["reportedPeriods"],
      reports: asRecord(pick(record, ["reports"])) as FundamentalData["reports"],
    }
  }

  async getMarketIndex(symbol: string, request?: Omit<HistoricalPriceRequest, "symbol">): Promise<OHLCV[]> {
    return this.getOHLCV(this.config.marketIndexPath, { symbol, ...request, timeframe: request?.timeframe ?? "1D" })
  }

  async testConnection(): Promise<DataProviderHealth> {
    const started = performance.now()
    try {
      const response = await this.requestJson(this.config.healthPath)
      const result: ProviderTestResult = {
        status: "CONNECTED",
        provider: this.name,
        url: response.url,
        latencyMs: Math.round(performance.now() - started),
        lastSync: new Date().toISOString(),
        note: `HTTP ${this.name} endpoint responded successfully.`,
      }
      return providerHealth(result, this.name)
    } catch (error) {
      if (error instanceof DataProviderError) {
        return {
          status: "ERROR",
          provider: this.name,
          note: `${error.code}: ${error.message}`,
          lastSync: new Date().toISOString(),
        }
      }
      return {
        status: "ERROR",
        provider: this.name,
        note: error instanceof Error ? error.message : "Unknown provider error.",
        lastSync: new Date().toISOString(),
      }
    }
  }
}
