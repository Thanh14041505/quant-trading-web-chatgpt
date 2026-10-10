import type { ReactNode } from "react"

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-[var(--app-border)] pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-500">{eyebrow}</div>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-[var(--app-text-muted)]">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
