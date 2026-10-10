import { Command, Menu, Moon, Search, Sun, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sidebar } from "@/components/layout/sidebar"
import { APP_CONFIG } from "@/config/app.config"
import { getSelectedProviderId, listMarketDataProviders } from "@/data/providers/provider-registry"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"
import type { useTheme } from "@/hooks/useTheme"

export function Topbar({ themeApi }: { themeApi: ReturnType<typeof useTheme> }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [query, setQuery] = useState("")
  const location = useLocation()
  const isOnline = useOnlineStatus()
  const providerName = useMemo(() => listMarketDataProviders().find((provider) => provider.id === getSelectedProviderId())?.name ?? "Mock Market Data", [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (event.key === "Escape") {
        setCommandOpen(false)
        setQuery("")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const filteredRoutes = useMemo(() => APP_CONFIG.routes.filter((route) => route.label.toLowerCase().includes(query.toLowerCase())), [query])

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-panel)_88%,transparent)] px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen((value) => !value)} aria-label="Open navigation"><Menu className="size-4" /></Button>
          <span className="text-sm font-semibold">VN Quant</span>
        </div>
        <button className="hidden items-center gap-2 text-xs text-[var(--app-text-muted)] transition hover:text-[var(--app-text)] md:flex" onClick={() => setCommandOpen(true)}>
          <Command className="size-3.5" /> Press <kbd className="rounded border border-[var(--app-border)] px-1.5 py-0.5">⌘K</kbd> for quick navigation
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={isOnline ? "success" : "warning"}>{isOnline ? providerName : "Offline · cache mode"}</Badge>
          <Button variant="ghost" size="icon" onClick={() => setCommandOpen(true)} aria-label="Quick navigation"><Search className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => themeApi.setTheme(themeApi.theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {themeApi.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)}><div className="h-full w-72 bg-[var(--app-panel)] shadow-xl" onClick={(event) => event.stopPropagation()}><Sidebar mobile /></div></div>}

      {commandOpen && <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/45 px-4 pt-[14vh]" onClick={() => setCommandOpen(false)}>
        <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-2 border-b border-[var(--app-border)] px-4"><Search className="size-4 text-[var(--app-text-muted)]" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Go to…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--app-text-muted)]" /><Button variant="ghost" size="icon" onClick={() => { setCommandOpen(false); setQuery("") }}><X className="size-4" /></Button></div>
          <div className="p-2">{filteredRoutes.map((route) => <Link key={route.path} to={route.path} onClick={() => { setCommandOpen(false); setQuery("") }} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-slate-500/8 ${location.pathname === route.path ? "text-blue-500" : ""}`}><span>{route.label}</span><span className="text-xs text-[var(--app-text-muted)]">{route.path}</span></Link>)}{filteredRoutes.length === 0 && <div className="px-3 py-6 text-center text-sm text-[var(--app-text-muted)]">No matching route.</div>}</div>
        </div>
      </div>}
    </>
  )
}
