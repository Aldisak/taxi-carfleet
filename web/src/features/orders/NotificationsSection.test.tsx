import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../shared/i18n'
import { theme } from '../../shared/theme/theme'
import { axe } from '../../shared/test/axe'
import { NotificationsSection } from './NotificationsSection'
import type { OrderNotificationDto } from '../../shared/notifications/notificationStatus'

function renderSection(notifications: OrderNotificationDto[]) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <NotificationsSection notifications={notifications} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

const sent: OrderNotificationDto = {
  event: 'OrderCreatedForCustomer',
  channel: 'Sms',
  recipient: '+420777123456',
  status: 'Sent',
  createdAt: '2026-09-13T08:00:00Z',
  sentAt: '2026-09-13T08:00:05Z',
}

const failed: OrderNotificationDto = {
  event: 'DriverArrived',
  channel: 'Sms',
  recipient: '+420777123456',
  status: 'Failed',
  error: 'Provider rejected',
  createdAt: '2026-09-13T09:00:00Z',
}

describe('NotificationsSection', () => {
  it('renders the empty state when there are no notifications', () => {
    renderSection([])
    expect(screen.getByText(/zatím žádné notifikace/i)).toBeInTheDocument()
  })

  it('renders sent and failed items with Czech event labels', () => {
    renderSection([sent, failed])
    // Czech event labels
    expect(screen.getByText('Objednávka přijata')).toBeInTheDocument()
    expect(screen.getByText('Řidič na místě')).toBeInTheDocument()
    // Status pills
    expect(screen.getByText('Odesláno')).toBeInTheDocument()
    expect(screen.getByText('Selhalo')).toBeInTheDocument()
    // Recipient shown
    expect(screen.getAllByText('+420777123456').length).toBe(2)
  })

  it('shows the provider error text for a failed item', () => {
    renderSection([failed])
    expect(screen.getByText('Provider rejected')).toBeInTheDocument()
  })

  it('exposes the failed status via role=status (not color alone)', () => {
    renderSection([failed])
    const statuses = screen.getAllByRole('status')
    expect(statuses.some(el => el.textContent === 'Selhalo')).toBe(true)
  })

  it('has no axe violations', async () => {
    const { container } = renderSection([sent, failed])
    expect(await axe(container)).toHaveNoViolations()
  })
})
