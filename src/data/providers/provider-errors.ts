export type DataProviderErrorCode =
  | "INVALID_CONFIGURATION"
  | "NETWORK_ERROR"
  | "DATA_SOURCE_CORS_UNSUPPORTED"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "INVALID_DATA"
  | "TIMEOUT"

export class DataProviderError extends Error {
  readonly code: DataProviderErrorCode
  readonly status?: number
  readonly url?: string

  constructor(message: string, code: DataProviderErrorCode, options?: { status?: number; url?: string }) {
    super(message)
    this.name = "DataProviderError"
    this.code = code
    this.status = options?.status
    this.url = options?.url
  }
}
