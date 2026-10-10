import type { CompanyInfo, DataProviderHealth, FundamentalData, OHLCV } from "@/models/market"
import type { HistoricalPriceRequest, MarketDataProvider } from "./market-data-provider"

const companyMap: Record<string, CompanyInfo> = {
  HAH: { symbol: "HAH", name: "Hai An Transport and Stevedoring", exchange: "HOSE", sector: "Shipping & Ports" },
  GMD: { symbol: "GMD", name: "Gemadept", exchange: "HOSE", sector: "Shipping & Ports" },
  DXP: { symbol: "DXP", name: "Doan Xa Port", exchange: "HNX", sector: "Shipping & Ports" },
  PHP: { symbol: "PHP", name: "Hai Phong Port", exchange: "UPCOM", sector: "Shipping & Ports" },
  VCB: { symbol: "VCB", name: "Vietcombank", exchange: "HOSE", sector: "Banks" },
  TCB: { symbol: "TCB", name: "Techcombank", exchange: "HOSE", sector: "Banks" },
  SSI: { symbol: "SSI", name: "SSI Securities", exchange: "HOSE", sector: "Securities" },
  VHM: { symbol: "VHM", name: "Vinhomes", exchange: "HOSE", sector: "Real Estate" },
  HPG: { symbol: "HPG", name: "Hoa Phat Group", exchange: "HOSE", sector: "Manufacturing" },
  FPT: { symbol: "FPT", name: "FPT Corporation", exchange: "HOSE", sector: "Technology" },
}

function seededRandom(seed: number) {
  let value = seed % 2147483647
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

function buildSeries(symbol: string, points = 220): OHLCV[] {
  const start = new Date(Date.now())
  start.setDate(start.getDate() - points * 2)
  const random = seededRandom(symbol.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0))
  const startingPrices: Record<string, number> = {
    HAH: 41.2, GMD: 69.5, DXP: 18.9, PHP: 31.4,
    VCB: 102.5, TCB: 42.6, SSI: 39.4, VHM: 72.8, HPG: 31.7, FPT: 152.0, VNINDEX: 1642.8,
  }
  let price = startingPrices[symbol] ?? 50
  const series: OHLCV[] = []

  for (let i = 0; i < points * 2; i += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const day = date.getDay()
    if (day === 0 || day === 6) continue

    const drift = 0.0004 + (random() - 0.5) * 0.025
    const open = price
    const close = Math.max(1, open * (1 + drift))
    const high = Math.max(open, close) * (1 + random() * 0.012)
    const low = Math.min(open, close) * (1 - random() * 0.012)
    const volume = Math.round(1_000_000 + random() * 4_000_000)
    price = close

    series.push({
      symbol,
      date: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
      value: Number((volume * close * 1000).toFixed(0)),
    })
  }

  return series.slice(-points)
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly id = "mock"
  readonly name = "Mock Provider"

  async getHistoricalPrices(request: HistoricalPriceRequest): Promise<OHLCV[]> {
    await Promise.resolve()
    return buildSeries(request.symbol, 240)
  }

  async getCompanyInfo(symbol: string): Promise<CompanyInfo> {
    await Promise.resolve()
    return companyMap[symbol] ?? {
      symbol,
      name: `${symbol} Mock Company`,
      exchange: "HOSE",
      sector: "Other",
    }
  }

  async getFundamentals(symbol: string): Promise<FundamentalData> {
    await Promise.resolve()
    const sector = companyMap[symbol]?.sector ?? "Other"
    const base: FundamentalData = {
      symbol,
      roe: 15.8,
      roa: 7.4,
      roic: 11.9,
      grossMargin: 31,
      operatingMargin: 14,
      netMargin: 10,
      operatingCashFlow: 1_850_000_000_000,
      freeCashFlow: 1_200_000_000_000,
      interestCoverage: 6.8,
      pe: 11.8,
      pb: 1.7,
      evEbitda: 9.8,
      peg: 0.72,
      dividendYield: 1.9,
      historicalPe: 13.5,
      historicalPb: 1.9,
      sectorMedianPe: 14.5,
      sectorMedianPb: 1.8,
      revenueGrowth: 18.2,
      epsGrowth: 21.4,
      revenueCagr: 15.1,
      profitCagr: 19.8,
      debtToEquity: 0.58,
      catalysts: ["EARNINGS_GROWTH", "INDUSTRY_DEMAND"],
      risks: [],
      legalStatus: "Clear",
    }
    if (sector === "Banks") {
      return { ...base, roe: 20.2, roa: 2.2, roic: undefined, grossMargin: undefined, operatingMargin: undefined, netMargin: 23, debtToEquity: 7.4, nim: 3.6, npl: 1.1, provisioning: 115, casa: 38, pe: 9.6, pb: 1.55, sectorMedianPe: 10.5, sectorMedianPb: 1.45, catalysts: ["CREDIT_GROWTH", "CASA"], risks: ["MACRO_CREDIT_RISK"] }
    }
    if (sector === "Securities") {
      return { ...base, roe: 18.4, pb: 1.75, brokerageShareGrowth: 7.5, marginLendingGrowth: 18, proprietaryTradingGrowth: 12, catalysts: ["EQUITY_MARKET_LIQUIDITY", "MARGIN_GROWTH"] }
    }
    if (sector === "Real Estate") {
      return { ...base, roe: 13.2, roic: 9.4, debtToEquity: 1.45, inventory: 82, netDebt: 8_500_000_000_000, projectPipeline: 74, legalStatus: "Watch", catalysts: ["PROJECT_HANDOVER"], risks: ["LEVERAGE", "LEGAL_EXECUTION"] }
    }
    if (sector === "Shipping & Ports") {
      return { ...base, roe: 17.6, roic: 14.1, debtToEquity: 0.42, evEbitda: 8.1, pb: 1.55, sectorMedianPe: 15, sectorMedianPb: 1.7, catalysts: ["PORT_THROUGHPUT", "FREIGHT_RATES"], risks: ["CYCLE_VOLATILITY"] }
    }
    if (sector === "Technology") {
      return { ...base, roe: 21.5, roic: 17.8, grossMargin: 38, operatingMargin: 18, revenueGrowth: 20.5, epsGrowth: 24.1, pe: 18.5, pb: 3.2, sectorMedianPe: 20, sectorMedianPb: 3.6, catalysts: ["DIGITAL_TRANSFORMATION", "EXPORT_GROWTH"] }
    }
    return base
  }

  async getMarketIndex(symbol: string): Promise<OHLCV[]> {
    return this.getHistoricalPrices({ symbol, timeframe: "1D" })
  }

  async testConnection(): Promise<DataProviderHealth> {
    await Promise.resolve()
    return {
      status: "CONNECTED",
      provider: this.name,
      lastSync: new Date().toISOString(),
      note: "Synthetic data source for development only.",
    }
  }
}
