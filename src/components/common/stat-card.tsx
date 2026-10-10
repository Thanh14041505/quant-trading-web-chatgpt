import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function StatCard({ label, value, change, icon }: { label: string; value: string; change?: string; icon: ReactNode }) {
  const positive = change?.startsWith("+")
  const negative = change?.startsWith("-")
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          {change && <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-500" : negative ? "text-red-500" : "text-[var(--app-text-muted)]"}`}>
            {positive && <ArrowUpRight className="size-3.5" />}{negative && <ArrowDownRight className="size-3.5" />}{change}
          </div>}
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-2.5 text-[var(--app-text-muted)]">{icon}</div>
      </CardContent>
    </Card>
  )
}
