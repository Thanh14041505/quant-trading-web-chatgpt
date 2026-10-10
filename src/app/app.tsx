import { BrowserRouter } from "react-router-dom"
import { AppRouter } from "@/app/router"
import { AppProviders } from "@/app/providers"
import { AppShell } from "@/components/layout/app-shell"
import { useTheme } from "@/hooks/useTheme"

export function App() {
  const themeApi = useTheme()
  return (
    <AppProviders>
      <BrowserRouter>
        <AppShell themeApi={themeApi}>
          <AppRouter />
        </AppShell>
      </BrowserRouter>
    </AppProviders>
  )
}
