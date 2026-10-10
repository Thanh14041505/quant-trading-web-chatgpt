# Router Context Fix

## Root cause
`AppShell` renders `Sidebar`, and `Sidebar` renders React Router's `NavLink`. Previously, `BrowserRouter` was mounted inside `AppRouter`, which is a child of `AppShell`. That left `Sidebar` and its `NavLink` outside router context and caused:

`useLocation() may be used only in the context of a <Router> component.`

## Fix
- Moved `BrowserRouter` up to `src/app/app.tsx`, wrapping both `AppShell` and `AppRouter`.
- Removed the nested `BrowserRouter` from `src/app/router.tsx`; it now only declares `Routes`.
- Kept `AppProviders` around the routed application.

## Expected component tree

```text
AppProviders
└── BrowserRouter
    └── AppShell
        ├── Sidebar (NavLink now has router context)
        ├── Topbar
        └── AppRouter (Routes)
```

## Verification
Source-level structure check confirms that `BrowserRouter` wraps `AppShell` and `AppRouter`, and that `AppRouter` no longer creates a nested router. Full browser/runtime verification should be confirmed locally by running `npm run dev` and navigating between sidebar links.
