import type { HTMLAttributes } from "react"
import { cn } from "@/utils/cn"

export function Badge({ className, variant = "default", ...props }: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "success" | "warning" | "danger" | "muted" }) {
  const styles = {
    default: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    danger: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
    muted: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  }
  return <div className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", styles[variant], className)} {...props} />
}
