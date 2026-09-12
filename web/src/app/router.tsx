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

export const router = createBrowserRouter([
  // ── Dispatcher /x ──────────────────────────────────────────────────────────
  {
    path: '/x/login',
    element: <LoginPage />,
  },
  {
    path: '/x',
    element: <AppLayout />,
    children: [
      {
        // Board with drawer as nested route so the board stays mounted
        path: '',
        element: <BoardPage />,
        children: [
          // /x/orders/:id opens the right-side drawer over the board
          { path: 'orders/:id', element: <OrderDrawer /> },
        ],
      },
      { path: 'orders', element: <SearchPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },

  // ── Driver /d ──────────────────────────────────────────────────────────────
  {
    path: '/d/login',
    element: <DriverLoginPage />,
  },
  {
    path: '/d',
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
    path: '/c/login',
    element: lazyCustomer(<CustomerLoginPage />),
  },
  {
    path: '/c',
    element: lazyCustomer(<CustomerLayout />),
    children: [
      { path: '', element: lazyCustomer(<CustomerHomePage />) },
      { path: 'order/route/:routeId', element: lazyCustomer(<RouteOrderPage />) },
      { path: 'order/new', element: lazyCustomer(<CustomOrderPage />) },
      // Tracking is nested under CustomerLayout so the shell CallButton + slug persistence apply.
      // The logged-out public link hits only AllowAnonymous endpoints (public/track → 410/404,
      // never 401), so CustomerLayout's silent-refresh-on-401 never redirects it to /c/login.
      { path: 't/:code', element: lazyCustomer(<TrackingPage />) },
      { path: 'history', element: lazyCustomer(<CustomerHistoryPage />) },
    ],
  },

  // ── Root redirect ──────────────────────────────────────────────────────────
  {
    path: '/',
    element: null,
    loader: () => {
      window.location.replace('/x')
      return null
    },
  },
])
