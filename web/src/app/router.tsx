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
import { DriverMapScreen } from '../features/driver/map/DriverMapScreen'
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
const MapOrderPage = lazy(() =>
  import('../features/customer/order/MapOrderPage').then(m => ({ default: m.MapOrderPage })),
)
const CustomerLoginPage = lazy(() =>
  import('../features/customer/login/CustomerLoginPage').then(m => ({ default: m.CustomerLoginPage })),
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
      // The map-first /driver index is the SINGLE driver screen (UC-019). It nests UNDER
      // DriverLayout (not a sibling like the customer shell) because the session mounts —
      // hub singleton, offer listener, position reporter, queue bar — live in DriverLayout
      // and must survive /driver/* navigation. The old { path: 'ride' } child is removed;
      // Accept no longer navigates — the state-driven screen reactively renders the ride view.
      { path: '', element: <DriverMapScreen /> },
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
  // The map-first order page is a SIBLING of the CustomerLayout group (mirroring /customer/login):
  // it owns the full-viewport map shell and re-runs the one-shot slug/silent-refresh initializers
  // itself, so it must NOT nest under CustomerLayout (which would double-invoke them).
  {
    path: '/customer',
    element: lazyCustomer(<MapOrderPage />),
  },
  // The map-first tracking screen is likewise a SIBLING leaf (UC-016 WI-4): it composes the same
  // full-viewport CustomerMapShell and re-runs the one-shot initializers itself, so nesting it
  // under CustomerLayout would double-invoke them. TrackingPage also hoists ensureFleetSlug into
  // its own useState initializer (F-05) so the logged-out public link (public/track is
  // AllowAnonymous → 410/404, never 401) carries X-Fleet-Slug even on the pre-shell meta-states.
  {
    path: '/customer/t/:code',
    element: lazyCustomer(<TrackingPage />),
  },
  {
    path: '/customer',
    element: lazyCustomer(<CustomerLayout />),
    children: [
      // Non-map customer screens keep the CustomerLayout chrome (header CallButton + slug
      // persistence). An exact '/customer' and '/customer/t/:code' leaf out-rank this branch's
      // children, so only '/customer/history' resolves here.
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
