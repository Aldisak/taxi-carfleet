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
