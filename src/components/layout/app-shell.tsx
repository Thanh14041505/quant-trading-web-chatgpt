import type { ReactNode } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import type { useTheme } from "@/hooks/useTheme"

export function AppShell({ children, themeApi }: { children: ReactNode; themeApi: ReturnType<typeof useTheme> }) {
  return <div className="min-h-screen bg-[var(--app-bg)]"><div className="flex min-h-screen"><Sidebar /><div className="min-w-0 flex-1"><Topbar themeApi={themeApi} /><main className="mx-auto w-full max-w-[1680px] p-4 md:p-6">{children}</main></div></div></div>
}
