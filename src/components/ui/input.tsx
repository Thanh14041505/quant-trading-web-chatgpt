import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/utils/cn"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm outline-none placeholder:text-[var(--app-text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15",
        className,
      )}
      {...props}
    />
  )
})
