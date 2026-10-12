export interface OHLCV {
  symbol: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  value?: number
}

export interface CompanyInfo {
  symbol: string
  name: string
  exchange: "HOSE" | "HNX" | "UPCOM"
  sector: string
  industry?: string
  industryCode?: string
  industryLevel?: number
  profileSector?: string
  sectorSource?: string
  listingDate?: string
  issuedShares?: number
}

export interface FundamentalData {
  symbol: string
  roe?: number
  roa?: number
  roic?: number
  grossMargin?: number
  operatingMargin?: number
  netMargin?: number
  operatingCashFlow?: number
  freeCashFlow?: number
  interestCoverage?: number
  pe?: number
  pb?: number
  evEbitda?: number
  peg?: number
  dividendYield?: number
  historicalPe?: number
  historicalPb?: number
  sectorMedianPe?: number
  sectorMedianPb?: number
  revenueGrowth?: number
  epsGrowth?: number
  revenueCagr?: number
  profitCagr?: number
  debtToEquity?: number
  netDebt?: number
  inventory?: number
  npl?: number
  nim?: number
  provisioning?: number
  casa?: number
  brokerageShareGrowth?: number
  marginLendingGrowth?: number
  proprietaryTradingGrowth?: number
  projectPipeline?: number
  legalStatus?: "Clear" | "Watch" | "At Risk"
  catalysts?: string[]
  risks?: string[]
  evEbitda?: number
  peg?: number
  dividendYield?: number
  historicalPe?: number
  historicalPb?: number
  sectorMedianPe?: number
  sectorMedianPb?: number
  sectorBenchmarkScope?: string
  sectorPeerCount?: number
  revenueCagr?: number
  profitCagr?: number
  operatingCashFlow?: number
  freeCashFlow?: number
  netDebt?: number
  inventory?: number
  latestPeriod?: string
  reportedPeriods?: { ratios?: string[]; incomeStatement?: string[]; balanceSheet?: string[]; cashFlow?: string[] }
  source?: string
  dataAvailable?: boolean
  notes?: string[]
  reports?: { ratios?: Record<string, unknown>[]; incomeStatement?: Record<string, unknown>[]; balanceSheet?: Record<string, unknown>[]; cashFlow?: Record<string, unknown>[] }
}

export interface DataProviderHealth {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR"
  provider: string
  lastSync?: string
  note?: string
}
