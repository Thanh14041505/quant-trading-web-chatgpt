export type DataProviderStatus = "CONNECTED" | "DISCONNECTED" | "ERROR"

export interface DataProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey?: string
  apiKeyHeader?: string
  authScheme?: "none" | "bearer" | "api-key-header"
  historicalPath: string
  companyPath: string
  fundamentalsPath: string
  marketIndexPath: string
  healthPath: string
}

export interface ProviderTestResult {
  status: DataProviderStatus
  provider: string
  url?: string
  latencyMs?: number
  lastSync?: string
  note?: string
  code?: string
}

export interface DataQualityIssue {
  level: "warning" | "error"
  code: string
  message: string
  row?: number
  date?: string
}

export interface DataValidationReport {
  acceptedRows: number
  originalRows: number
  droppedRows: number
  warnings: DataQualityIssue[]
  errors: DataQualityIssue[]
}
