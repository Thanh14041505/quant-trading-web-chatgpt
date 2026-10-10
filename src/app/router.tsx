import { Navigate, Route, Routes } from "react-router-dom"
import { DashboardPage } from "@/pages/dashboard/dashboard-page"
import { TplusPage } from "@/pages/tplus/tplus-page"
import { HoldPage } from "@/pages/hold/hold-page"
import { StockPage } from "@/pages/stock/stock-page"
import { BacktestPage } from "@/pages/backtest/backtest-page"
import { SettingsPage } from "@/pages/settings/settings-page"

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/tplus" element={<TplusPage />} />
      <Route path="/hold" element={<HoldPage />} />
      <Route path="/stock/:symbol" element={<StockPage />} />
      <Route path="/backtest" element={<BacktestPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
