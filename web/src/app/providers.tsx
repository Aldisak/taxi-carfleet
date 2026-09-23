import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider } from 'react-router-dom'
import { theme } from '../shared/theme/theme'
import { GlobalStyle } from '../shared/theme/GlobalStyle'
import i18n from '../shared/i18n'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <I18nextProvider i18n={i18n}>
          <RouterProvider router={router} />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
