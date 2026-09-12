import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { BoardPage } from '../features/board/BoardPage'
import { OrderDrawer } from '../features/orders/OrderDrawer'
import { SearchPage } from '../features/orders/SearchPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export const router = createBrowserRouter([
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
  {
    path: '/',
    element: null,
    loader: () => {
      window.location.replace('/x')
      return null
    },
  },
])
