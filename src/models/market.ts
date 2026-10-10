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
}

export interface DataProviderHealth {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR"
  provider: string
  lastSync?: string
  note?: string
}
