export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_NAME || "VN Quant Trading Terminal",
  defaultProvider: import.meta.env.VITE_DEFAULT_DATA_PROVIDER || "mock",
  routes: [
    { label: "Dashboard", path: "/dashboard" },
    { label: "T+ Scanner", path: "/tplus" },
    { label: "Hold Scanner", path: "/hold" },
    { label: "Backtest", path: "/backtest" },
    { label: "Settings", path: "/settings" },
  ],
} as const
