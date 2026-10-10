import { CheckCircle2, Database, KeyRound, Loader2, PlugZap, RefreshCw, Trash2, WifiOff } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "@/components/common/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { APP_CONFIG } from "@/config/app.config"
import { DEFAULT_HTTP_PROVIDER_CONFIG, clearHttpProviderConfig, loadHttpProviderConfig, saveHttpProviderConfig } from "@/data/providers/provider-config"
import { CachedMarketDataProvider } from "@/data/cache/cached-provider"
import { clientCache } from "@/data/cache/client-cache"
import { HttpJsonMarketDataProvider } from "@/data/providers/httpJsonProvider"
import { getMarketDataProvider, getSelectedProviderId, listMarketDataProviders, setSelectedProviderId } from "@/data/providers/provider-registry"
import type { DataProviderConfig } from "@/models/provider"

const ACTIVE_PROVIDER_KEY = "quant-active-provider"

function getStatusVariant(status?: string) {
  if (status === "CONNECTED") return "success" as const
  if (status === "ERROR") return "danger" as const
  return "muted" as const
}

export function SettingsPage() {
  const [activeProvider, setActiveProvider] = useState(() => getSelectedProviderId() || APP_CONFIG.defaultProvider)
  const [httpConfig, setHttpConfig] = useState<DataProviderConfig>(() => loadHttpProviderConfig())
  const [keySaved, setKeySaved] = useState(Boolean(loadHttpProviderConfig().apiKey))
  const [testResult, setTestResult] = useState<{ status: string; note?: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [symbol, setSymbol] = useState("HAH")
  const [sampleRows, setSampleRows] = useState<Array<{ date: string; close: number; volume: number }>>([])
  const [sampleLoading, setSampleLoading] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState<{ memoryEntries: number; indexedDbEntries: number; available: boolean } | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine)

  const selectedProvider = useMemo(
    () => listMarketDataProviders().find((provider) => provider.id === activeProvider),
    [activeProvider],
  )

  const updateHttpConfig = (patch: Partial<DataProviderConfig>) => {
    setHttpConfig((current) => ({ ...current, ...patch }))
  }

  const saveProvider = () => {
    saveHttpProviderConfig(httpConfig)
    setSelectedProviderId(activeProvider)
    setKeySaved(Boolean(httpConfig.apiKey))
    setTestResult(null)
  }

  const clearProvider = () => {
    clearHttpProviderConfig()
    setHttpConfig({ ...DEFAULT_HTTP_PROVIDER_CONFIG })
    setKeySaved(false)
    setTestResult(null)
  }

  const selectProvider = (id: string) => {
    setActiveProvider(id)
    sessionStorage.setItem(ACTIVE_PROVIDER_KEY, id)
    setSelectedProviderId(id)
    setTestResult(null)
    setSampleRows([])
    setSampleError(null)
  }

  const getConfiguredProvider = () => activeProvider === "http-json"
    ? new CachedMarketDataProvider(new HttpJsonMarketDataProvider(httpConfig))
    : getMarketDataProvider(activeProvider)

  const testConnection = async () => {
    setTestLoading(true)
    try {
      const result = await getConfiguredProvider().testConnection()
      setTestResult(result)
    } finally {
      setTestLoading(false)
    }
  }

  const refreshCacheStats = async () => {
    const stats = await clientCache.stats()
    setCacheStats(stats)
  }

  const clearCache = async () => {
    setCacheBusy(true)
    try {
      await clientCache.clearAll()
      await refreshCacheStats()
      setSampleRows([])
    } finally {
      setCacheBusy(false)
    }
  }

  useEffect(() => {
    void refreshCacheStats()
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const fetchSample = async (cacheMode: "default" | "force-refresh" = "default") => {
    const normalizedSymbol = symbol.trim().toUpperCase()
    if (!normalizedSymbol) return
    setSampleLoading(true)
    setSampleError(null)
    try {
      const data = await getConfiguredProvider().getHistoricalPrices({ symbol: normalizedSymbol, timeframe: "1D", cacheMode })
      setSampleRows(data.slice(-5).reverse().map((row) => ({ date: row.date, close: row.close, volume: row.volume })))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch market data."
      setSampleError(message)
      setSampleRows([])
    } finally {
      setSampleLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client configuration"
        title="Settings"
        description="Configure market data. The Vercel Python functions in /api can call VNStock server-side."
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PlugZap className="size-4" /> Data Provider</CardTitle>
            <CardDescription>Choose the source used by the application. Mock remains available for offline development.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {listMarketDataProviders().map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => selectProvider(provider.id)}
                  className={`rounded-lg border p-4 text-left transition ${activeProvider === provider.id ? "border-blue-500 bg-blue-500/5" : "border-[var(--app-border)] hover:bg-[var(--app-panel-muted)]"}`}
                >
                  <div className="text-sm font-semibold">{provider.name}</div>
                  <div className="mt-1 text-xs text-[var(--app-text-muted)]">{provider.id === "mock" ? "Synthetic OHLCV for development" : "Browser fetch + JSON normalization + validation"}</div>
                </button>
              ))}
            </div>

            {activeProvider === "http-json" && (
              <div className="space-y-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium">Base URL</label>
                    <Input value={httpConfig.baseUrl} onChange={(event) => updateHttpConfig({ baseUrl: event.target.value })} placeholder="Leave blank to use this app’s /api functions" inputMode="url" />
                    <p className="mt-1 text-[11px] text-[var(--app-text-muted)]">For the deployed Vercel app, leave blank to call the same-origin Python functions. Local Vite alone does not execute Python routes; use <code>vercel dev</code>.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium">Auth</label>
                    <select value={httpConfig.authScheme ?? "bearer"} onChange={(event) => updateHttpConfig({ authScheme: event.target.value as DataProviderConfig["authScheme"] })} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm">
                      <option value="bearer">Bearer token</option>
                      <option value="api-key-header">API key header</option>
                      <option value="none">No auth</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium">API key header</label>
                    <Input value={httpConfig.apiKeyHeader ?? "X-API-Key"} onChange={(event) => updateHttpConfig({ apiKeyHeader: event.target.value })} disabled={httpConfig.authScheme !== "api-key-header"} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium">API Key / Token</label>
                    <Input value={httpConfig.apiKey ?? ""} onChange={(event) => { updateHttpConfig({ apiKey: event.target.value }); setKeySaved(false) }} type="password" placeholder="Optional: VNStock key (server environment key is preferred)" autoComplete="off" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["Health path", "healthPath"],
                    ["Historical OHLCV path", "historicalPath"],
                    ["Company path", "companyPath"],
                    ["Fundamentals path", "fundamentalsPath"],
                    ["Index history path", "marketIndexPath"],
                  ] as const).map(([label, key]) => (
                    <div key={key} className={key === "historicalPath" ? "sm:col-span-2" : ""}>
                      <label className="mb-1.5 block text-xs font-medium">{label}</label>
                      <Input value={httpConfig[key]} onChange={(event) => updateHttpConfig({ [key]: event.target.value })} />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveProvider}><KeyRound className="size-3.5" /> Save provider</Button>
                  <Button variant="outline" onClick={testConnection} disabled={testLoading}>
                    {testLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Test connection
                  </Button>
                  <Button variant="ghost" onClick={clearProvider}><Trash2 className="size-3.5" /> Reset HTTP config</Button>
                </div>
                {keySaved && <div className="text-xs text-emerald-500">Credentials stored in this browser session only.</div>}
              </div>
            )}

            {testResult && (
              <div className="rounded-lg border border-[var(--app-border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Provider status</div>
                  <Badge variant={getStatusVariant(testResult.status)}>
                    {testResult.status === "CONNECTED" ? <CheckCircle2 className="mr-1 size-3" /> : <WifiOff className="mr-1 size-3" />}
                    {testResult.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">{testResult.note}</p>
              </div>
            )}

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--app-text-muted)]">
              Preferred credential setup: add <code>VNSTOCK_API_KEY</code> under Vercel Project → Settings → Environment Variables. It stays server-side. The browser key field is a convenience fallback; any key sent by the browser can be seen in DevTools/network requests, so use it only for a private personal deployment.
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="size-4" /> Data smoke test</CardTitle>
              <CardDescription>Fetch a small OHLCV sample through the currently selected provider.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol" className="w-28" />
                <Button onClick={() => void fetchSample("default")} disabled={sampleLoading} className="flex-1">{sampleLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />} Load cached / live</Button>
                <Button variant="outline" onClick={() => void fetchSample("force-refresh")} disabled={sampleLoading}>
                  <RefreshCw className="size-3.5" /> Refresh live
                </Button>
              </div>
              {sampleError && <div className="rounded-md bg-red-500/10 p-3 text-xs text-red-500">{sampleError}</div>}
              {sampleRows.length > 0 && (
                <div className="overflow-hidden rounded-md border border-[var(--app-border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--app-panel-muted)] text-[var(--app-text-muted)]"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Close</th><th className="px-3 py-2 text-right">Volume</th></tr></thead>
                    <tbody>{sampleRows.map((row) => <tr key={row.date} className="border-t border-[var(--app-border)]"><td className="px-3 py-2">{row.date}</td><td className="px-3 py-2 text-right">{row.close.toLocaleString()}</td><td className="px-3 py-2 text-right">{row.volume.toLocaleString()}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {!sampleRows.length && !sampleError && <div className="text-xs text-[var(--app-text-muted)]">Provider: {selectedProvider?.name ?? activeProvider}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Local Data</CardTitle>
              <CardDescription>Two-layer cache for faster scans and degraded/offline use.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-[var(--app-border)] p-3">
                <div><div className="text-sm font-medium">Network</div><div className="text-xs text-[var(--app-text-muted)]">{isOnline ? "Online — live refresh available" : "Offline — cached data only"}</div></div>
                <Badge variant={isOnline ? "success" : "warning"}>{isOnline ? "ONLINE" : "OFFLINE"}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--app-border)] p-3">
                <div><div className="text-sm font-medium">Memory cache</div><div className="text-xs text-[var(--app-text-muted)]">Current browser session</div></div>
                <Badge variant="muted">{cacheStats?.memoryEntries ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--app-border)] p-3">
                <div><div className="text-sm font-medium">IndexedDB</div><div className="text-xs text-[var(--app-text-muted)]">Persistent local market-data cache</div></div>
                <Badge variant={cacheStats?.available ? "success" : "warning"}>{cacheStats?.available ? `${cacheStats.indexedDbEntries} entries` : "UNAVAILABLE"}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => void refreshCacheStats()}>
                  <RefreshCw className="size-3.5" /> Refresh cache info
                </Button>
                <Button variant="ghost" onClick={() => void clearCache()} disabled={cacheBusy}>
                  {cacheBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Clear all
                </Button>
              </div>
              <div className="text-[11px] leading-5 text-[var(--app-text-muted)]">Fresh cache is preferred. When live data is unavailable, stale cached data may be used as a fallback and is never presented as fresh.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
