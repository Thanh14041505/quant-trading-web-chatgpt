import { BarChart3, FlaskConical, Gauge, LineChart, Settings2 } from "lucide-react"
import { NavLink } from "react-router-dom"
import { APP_CONFIG } from "@/config/app.config"

const icons = {
  "/dashboard": Gauge,
  "/tplus": LineChart,
  "/hold": BarChart3,
  "/backtest": FlaskConical,
  "/settings": Settings2,
} as const

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  return (
    <aside className={mobile ? "flex w-full flex-col" : "hidden w-60 shrink-0 border-r border-[var(--app-border)] bg-[var(--app-panel)] md:flex md:flex-col"}>
      <div className="flex h-16 items-center gap-3 border-b border-[var(--app-border)] px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"><LineChart className="size-4" /></div>
        <div>
          <div className="text-sm font-semibold">VN Quant</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Research Terminal</div>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {APP_CONFIG.routes.map((route) => {
          const Icon = icons[route.path as keyof typeof icons]
          return <NavLink key={route.path} to={route.path} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-[var(--app-text-muted)] hover:bg-slate-500/8 hover:text-[var(--app-text)]"}`}>
            <Icon className="size-4" />
            <span>{route.label}</span>
          </NavLink>
        })}
      </nav>
      <div className="mt-auto border-t border-[var(--app-border)] p-4 text-[10px] leading-5 text-[var(--app-text-muted)]">
        <div className="font-semibold text-[var(--app-text)]">Frontend-only V1</div>
        Browser calculations · IndexedDB · External API
      </div>
    </aside>
  )
}
