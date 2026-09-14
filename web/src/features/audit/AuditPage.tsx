import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { authStorage } from '../../shared/api/auth-storage'
import { canAccessSettings } from '../settings/roleGating'
import { auditEventLabelKey } from '../../shared/audit/auditEventLabel'
import type { AuditFilters } from '../../shared/api/client'
import { useAudit } from './useAudit'

const Page = styled.div`
  height: 100%;
  overflow: auto;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const Filters = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Select = styled.select`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Button = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  background: ${({ theme }) => theme.colors.surface};
`

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
`

const Td = styled.td`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
`

const Pager = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`

const StatusText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
`

const AccessDenied = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`

const ENTITY_OPTIONS = ['Order', 'Driver']

const pragueTime = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatAt(iso: string): string {
  return pragueTime.format(new Date(iso))
}

/** /dispatcher/audit — FleetAdmin read-only, paged, filterable unified audit timeline. */
export function AuditPage() {
  const { t } = useTranslation()
  const role = authStorage.getUserRole()

  // Draft filter inputs (applied on submit); `applied` drives the query.
  const [actor, setActor] = useState('')
  const [entity, setEntity] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [orderCode, setOrderCode] = useState('')
  const [page, setPage] = useState(1)
  const [applied, setApplied] = useState<AuditFilters>({ page: 1 })

  const query = useAudit(applied)

  if (!canAccessSettings(role)) {
    return <AccessDenied role="alert">{t('audit.accessDenied')}</AccessDenied>
  }

  function buildFilters(nextPage: number): AuditFilters {
    return {
      actor: actor || null,
      entity: entity || null,
      from: from || null,
      to: to || null,
      orderCode: orderCode || null,
      page: nextPage,
    }
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setApplied(buildFilters(1))
  }

  function handleClear() {
    setActor('')
    setEntity('')
    setFrom('')
    setTo('')
    setOrderCode('')
    setPage(1)
    setApplied({ page: 1 })
  }

  function goToPage(next: number) {
    setPage(next)
    setApplied(buildFilters(next))
  }

  // hasNext is driven by the SERVER's returned page/pageSize (1-based):
  // there is more when page * pageSize < total.
  const total = query.data?.total ?? 0
  const serverPage = query.data?.page ?? page
  const pageSize = query.data?.pageSize ?? 0
  const hasNext = serverPage * pageSize < total
  const hasPrev = page > 1

  return (
    <Page>
      <h1>{t('audit.title')}</h1>

      <Filters onSubmit={handleApply}>
        <Field>
          {t('audit.filters.actor')}
          <Input value={actor} onChange={e => setActor(e.target.value)} />
        </Field>
        <Field>
          {t('audit.filters.entity')}
          <Select value={entity} onChange={e => setEntity(e.target.value)} aria-label={t('audit.filters.entity')}>
            <option value="">{t('audit.filters.allEntities')}</option>
            {ENTITY_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          {t('audit.filters.from')}
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </Field>
        <Field>
          {t('audit.filters.to')}
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </Field>
        <Field>
          {t('audit.filters.orderCode')}
          <Input value={orderCode} onChange={e => setOrderCode(e.target.value)} />
        </Field>
        <Button type="submit">{t('audit.filters.apply')}</Button>
        <Button type="button" onClick={handleClear}>
          {t('audit.filters.clear')}
        </Button>
      </Filters>

      {query.isPending && <StatusText>{t('audit.loading')}</StatusText>}
      {query.isError && <StatusText role="alert">{t('audit.error')}</StatusText>}
      {query.data && query.data.items.length === 0 && <StatusText>{t('audit.empty')}</StatusText>}

      {query.data && query.data.items.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th scope="col">{t('audit.table.time')}</Th>
              <Th scope="col">{t('audit.table.actor')}</Th>
              <Th scope="col">{t('audit.table.entity')}</Th>
              <Th scope="col">{t('audit.table.event')}</Th>
              <Th scope="col">{t('audit.table.order')}</Th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((item, idx) => (
              <tr key={`${item.at}-${idx}`}>
                <Td>{formatAt(item.at)}</Td>
                <Td>{item.actorUserId ?? '—'}</Td>
                <Td>{item.entity}</Td>
                <Td>{t(auditEventLabelKey(item.action), { defaultValue: item.action })}</Td>
                <Td>{item.orderCode ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager>
        <Button type="button" onClick={() => goToPage(page - 1)} disabled={!hasPrev}>
          {t('audit.prev')}
        </Button>
        <span>{t('audit.page', { page })}</span>
        <Button type="button" onClick={() => goToPage(page + 1)} disabled={!hasNext}>
          {t('audit.next')}
        </Button>
      </Pager>
    </Page>
  )
}
