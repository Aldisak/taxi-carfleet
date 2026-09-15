import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { DriverLayout } from './DriverLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { BoardPage } from '../features/board/BoardPage'
import { OrderDrawer } from '../features/orders/OrderDrawer'
import { SearchPage } from '../features/orders/SearchPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { DriverLoginPage } from '../features/driver/auth/DriverLoginPage'
import { DriverHomePage } from '../features/driver/home/DriverHomePage'
import { DriverRidePage } from '../features/driver/ride/DriverRidePage'
import { CompletePage } from '../features/driver/complete/CompletePage'
import { HistoryPage } from '../features/driver/history/HistoryPage'
import { DriverSettingsPage } from '../features/driver/settings/DriverSettingsPage'

// ── Dispatcher reports + audit (lazy-loaded /x chunks — FleetAdmin only) ───────
const ReportsPage = lazy(() =>
  import('../features/reports/ReportsPage').then(m => ({ default: m.ReportsPage })),
)
const AuditPage = lazy(() =>
  import('../features/audit/AuditPage').then(m => ({ default: m.AuditPage })),
)

// ── Analytics (lazy-loaded — own chunk; chart.js lives inside this chunk only) ─
const AnalyticsPage = lazy(() =>
  import('../features/analytics/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })),
)

// ── SuperAdmin /admin (lazy-loaded — SuperAdmin only, cross-tenant ops) ─────────
const AdminFleetsPage = lazy(() =>
  import('../features/admin/AdminFleetsPage').then(m => ({ default: m.AdminFleetsPage })),
)
const AdminTenantSettingsPage = lazy(() =>
  import('../features/admin/AdminTenantSettingsPage').then(m => ({ default: m.AdminTenantSettingsPage })),
)
const AdminGuard = lazy(() =>
  import('../features/admin/AdminGuard').then(m => ({ default: m.AdminGuard })),
)
const AdminLoginPage = lazy(() =>
  import('../features/admin/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })),
)
const PlatformScreen = lazy(() =>
  import('../features/admin/PlatformScreen').then(m => ({ default: m.PlatformScreen })),
)

// ── Customer /c (lazy-loaded chunk — no /x or /d code ships to customers) ──────
const CustomerLayout = lazy(() =>
  import('../features/customer/shell/CustomerLayout').then(m => ({ default: m.CustomerLayout })),
)
const CustomerHomePage = lazy(() =>
  import('../features/customer/home/CustomerHomePage').then(m => ({ default: m.CustomerHomePage })),
)
const CustomerLoginPage = lazy(() =>
  import('../features/customer/login/CustomerLoginPage').then(m => ({ default: m.CustomerLoginPage })),
)
const RouteOrderPage = lazy(() =>
  import('../features/customer/order/RouteOrderPage').then(m => ({ default: m.RouteOrderPage })),
)
const CustomOrderPage = lazy(() =>
  import('../features/customer/order/CustomOrderPage').then(m => ({ default: m.CustomOrderPage })),
)
const TrackingPage = lazy(() =>
  import('../features/customer/tracking/TrackingPage').then(m => ({ default: m.TrackingPage })),
)
const CustomerHistoryPage = lazy(() =>
  import('../features/customer/history/CustomerHistoryPage').then(m => ({ default: m.CustomerHistoryPage })),
)

/** Suspense boundary for the lazy customer chunk. */
function lazyCustomer(node: ReactNode): ReactNode {
  return <Suspense fallback={null}>{node}</Suspense>
}

/** Suspense boundary for the lazy dispatcher report/audit chunks. */
function lazyDispatch(node: ReactNode): ReactNode {
  return <Suspense fallback={null}>{node}</Suspense>
}

export const router = createBrowserRouter([
  // ── Dispatcher /x ──────────────────────────────────────────────────────────
  {
    path: '/dispatcher/login',
    element: <LoginPage />,
  },
  {
    path: '/dispatcher',
    element: <AppLayout />,
    children: [
      {
        // Board with drawer as nested route so the board stays mounted
        path: '',
        element: <BoardPage />,
        children: [
          // /dispatcher/orders/:id opens the right-side drawer over the board
          { path: 'orders/:id', element: <OrderDrawer /> },
        ],
      },
      { path: 'orders', element: <SearchPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'reports', element: lazyDispatch(<ReportsPage />) },
      { path: 'audit', element: lazyDispatch(<AuditPage />) },
      { path: 'analytics', element: lazyDispatch(<AnalyticsPage />) },
    ],
  },

  // ── SuperAdmin /admin ────────────────────────────────────────────────────────
  // Standalone (NOT under the fleet-scoped AppLayout): SuperAdmin has no fleet.
  // The guard redirects non-SuperAdmins to /admin/login (fleetless SuperAdmin auth — A7b).
  // Lazy chunk — no /dispatcher/driver/c code ships here.
  {
    path: '/admin/login',
    element: lazyDispatch(<AdminLoginPage />),
  },
  {
    path: '/admin',
    element: lazyDispatch(<AdminGuard>{lazyDispatch(<AdminFleetsPage />)}</AdminGuard>),
  },
  {
    path: '/admin/fleets/:fleetId/settings',
    element: lazyDispatch(<AdminGuard>{lazyDispatch(<AdminTenantSettingsPage />)}</AdminGuard>),
  },
  {
    path: '/admin/platform',
    element: lazyDispatch(<AdminGuard>{lazyDispatch(<PlatformScreen />)}</AdminGuard>),
  },

  // ── Driver /d ──────────────────────────────────────────────────────────────
  {
    path: '/driver/login',
    element: <DriverLoginPage />,
  },
  {
    path: '/driver',
    element: <DriverLayout />,
    children: [
      { path: '', element: <DriverHomePage /> },
      { path: 'ride', element: <DriverRidePage /> },
      { path: 'ride/complete', element: <CompletePage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <DriverSettingsPage /> },
    ],
  },

  // ── Customer /c ──────────────────────────────────────────────────────────────
  {
    path: '/customer/login',
    element: lazyCustomer(<CustomerLoginPage />),
  },
  {
    path: '/customer',
    element: lazyCustomer(<CustomerLayout />),
    children: [
      { path: '', element: lazyCustomer(<CustomerHomePage />) },
      { path: 'order/route/:routeId', element: lazyCustomer(<RouteOrderPage />) },
      { path: 'order/new', element: lazyCustomer(<CustomOrderPage />) },
      // Tracking is nested under CustomerLayout so the shell CallButton + slug persistence apply.
      // The logged-out public link hits only AllowAnonymous endpoints (public/track → 410/404,
      // never 401), so CustomerLayout's silent-refresh-on-401 never redirects it to /customer/login.
      { path: 't/:code', element: lazyCustomer(<TrackingPage />) },
      { path: 'history', element: lazyCustomer(<CustomerHistoryPage />) },
    ],
  },

  // ── Root redirect ──────────────────────────────────────────────────────────
  {
    path: '/',
    element: null,
    loader: () => {
      window.location.replace('/dispatcher')
      return null
    },
  },
])
