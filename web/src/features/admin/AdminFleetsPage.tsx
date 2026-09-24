import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  Panel,
  Lbl,
  Ctrl,
  DeskButton,
  DeskPill,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  type DeskPillTone,
} from '../../shared/ui/desk'
import { Callout } from '../../shared/ui'
import { useAdminFleets, useCreateFleet } from './useAdminFleets'
import { useAdminAnalytics } from './useAdminAnalytics'
import { healthBand } from './platform/healthBand'
import { sparklinePoints } from './platform/sparklinePath'
import {
  validateCreateFleetForm,
  toCreateFleetRequest,
  type CreateFleetFormValues,
  type CreateFleetFormErrors,
} from './createFleetForm'
import type { AdminFleetDto, CreateFleetResponse, FleetHealthRow } from '../../shared/api/client'

const czk = new Intl.NumberFormat('cs-CZ')

const SPARK_W = 96
const SPARK_H = 24

/**
 * Maps a server health flag to a DeskPill tone. Distinct from both `healthBand().colorToken`
 * (a theme.colors key, not a pill tone) and the sparkline stroke rule below: the design
 * specifies growing→success, stable→neutral, declining→warning, inactive→danger.
 */
function trendTone(health: string): DeskPillTone {
  switch (health) {
    case 'growing':
      return 'success'
    case 'declining':
      return 'warning'
    case 'inactive':
      return 'danger'
    case 'stable':
    default:
      return 'neutral'
  }
}

/**
 * Sparkline stroke color per the platform-page rule: growing→accent, declining→danger,
 * everything else (stable/inactive)→ink-3. Returns a CSS var string.
 */
function sparklineStroke(health: string): string {
  switch (health) {
    case 'growing':
      return 'var(--accent)'
    case 'declining':
      return 'var(--danger)'
    default:
      return 'var(--ink-3)'
  }
}

const Page = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`

const Titles = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const Title = styled.h1`
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Summary = styled.p`
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-2);
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
`

const TableWrap = styled.div`
  overflow-x: auto;
`

const FleetCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const Dot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--ink);
  flex-shrink: 0;
`

const FleetName = styled.span`
  font-weight: var(--fw-bold);
  color: var(--ink);
`

const FleetMeta = styled.span`
  display: block;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const Spark = styled.svg`
  display: block;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
`

const SuffixRow = styled.div`
  margin-top: 4px;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const PasswordCode = styled.code`
  display: block;
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-body-lg);
  word-break: break-all;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--ink);
`

const PasswordBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`

const Message = styled.p`
  margin: 0;
  padding: 16px;
  color: var(--ink-2);
`

/** An xs outline-style link matching the {@link DeskButton} look (DeskButton renders a <button>). */
const SettingsLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  line-height: 1;
  color: var(--ink);
  text-decoration: none;

  &:hover {
    background: var(--surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
`

const EMPTY: CreateFleetFormValues = { slug: '', name: '', phone: '', adminEmail: '' }

interface FleetRowVm {
  fleet: AdminFleetDto
  health: FleetHealthRow | undefined
}

/**
 * SuperAdmin fleet administration screen (UC-021 WI-7, restyled onto the desk kit). Lists all
 * fleets in a desk `Table` (fleet dot + name + slug·phone, drivers, rides/month, a 12-week SVG
 * sparkline, a trend pill and a status pill, plus a Settings link) and creates a fleet in a side
 * `Panel`; on create it shows the returned one-time admin password ONCE (never returned again)
 * in a success `Callout` with a copy-to-clipboard button.
 *
 * The list rows come from `useAdminFleets` (authoritative — drives the total/active summary) and
 * are enriched by joining `useAdminAnalytics` on fleetId for the health/rides/drivers/sparkline
 * data (that data lives only on the analytics DTO). A fleet with no analytics row (e.g. freshly
 * created, no orders) renders zeros / an empty sparkline / the inactive band.
 *
 * The header dot is ink for every fleet: `AdminFleetDto` carries no `primaryColorHex`, so a true
 * per-fleet dot colour cannot be rendered honestly (see handoff deviations — api-lane dependency).
 */
export function AdminFleetsPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAdminFleets()
  const { data: analytics } = useAdminAnalytics()
  const createFleet = useCreateFleet()

  const [form, setForm] = useState<CreateFleetFormValues>(EMPTY)
  const [errors, setErrors] = useState<CreateFleetFormErrors>({})
  const [created, setCreated] = useState<CreateFleetResponse | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const formRef = useRef<HTMLDivElement>(null)

  // Plain per-render join keyed by fleetId (a handful of fleets — no measured re-render
  // problem, so no memoization per rules/web-performance.md#memoization-policy).
  const healthByFleetId = new Map<string, FleetHealthRow>()
  for (const row of analytics?.fleets ?? []) healthByFleetId.set(row.fleetId, row)

  const rows: FleetRowVm[] = (data?.items ?? []).map((fleet) => ({
    fleet,
    health: healthByFleetId.get(fleet.id),
  }))

  const total = data?.items.length ?? 0
  const active = data?.items.filter((f) => f.isActive).length ?? 0

  function set<K extends keyof CreateFleetFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function focusForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    document.getElementById('af-slug')?.focus()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const found = validateCreateFleetForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    createFleet.mutate(toCreateFleetRequest(form), {
      onSuccess: (res) => {
        setCreated(res)
        setCopied(false)
        setForm(EMPTY)
      },
      onError: () => setSubmitError('admin.fleets.createFailed'),
    })
  }

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.oneTimePassword)
    setCopied(true)
  }

  function renderSparkline(row: FleetRowVm) {
    const weeks = row.health?.sparklineWeeks ?? []
    const points = sparklinePoints(weeks, SPARK_W, SPARK_H)
    const stroke = sparklineStroke(row.health?.health ?? 'inactive')
    return (
      <Spark
        role="img"
        aria-label={t('admin.platform.sparklineLabel', { name: row.fleet.name })}
        width={SPARK_W}
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </Spark>
    )
  }

  return (
    <Page>
      <TopBar>
        <Titles>
          <Title>{t('admin.nav.fleets')}</Title>
          <Summary>{t('admin.fleets.summary', { total, active })}</Summary>
        </Titles>
        <DeskButton variant="primary" onClick={focusForm}>
          {t('admin.fleets.create')}
        </DeskButton>
      </TopBar>

      <Grid>
        <Panel title={t('admin.fleets.listTitle')} count={total}>
          {isLoading ? (
            <Message>{t('admin.fleets.loading')}</Message>
          ) : isError ? (
            <Callout tone="danger" role="alert">
              {t('admin.fleets.loadFailed')}
            </Callout>
          ) : (
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th scope="col">{t('admin.fleets.columns.fleet')}</Th>
                    <Th scope="col" $num>
                      {t('admin.fleets.columns.drivers')}
                    </Th>
                    <Th scope="col" $num>
                      {t('admin.fleets.columns.ridesPerMonth')}
                    </Th>
                    <Th scope="col">{t('admin.fleets.columns.trend12w')}</Th>
                    <Th scope="col">{t('admin.fleets.columns.trend')}</Th>
                    <Th scope="col">{t('admin.fleets.columns.status')}</Th>
                    <Th scope="col">{t('admin.fleets.fields.actions')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map(({ fleet, health }) => {
                    const bandKey = health?.health ?? 'inactive'
                    return (
                      <Tr key={fleet.id}>
                        <Td>
                          <FleetCell>
                            <Dot aria-hidden="true" />
                            <span>
                              <FleetName>{fleet.name}</FleetName>
                              <FleetMeta>
                                {fleet.slug} · {fleet.phone}
                              </FleetMeta>
                            </span>
                          </FleetCell>
                        </Td>
                        <Td $num>{czk.format(health?.activeDrivers ?? 0)}</Td>
                        <Td $num>{czk.format(health?.ridesThisMonth ?? 0)}</Td>
                        <Td>{renderSparkline({ fleet, health })}</Td>
                        <Td>
                          <DeskPill tone={trendTone(bandKey)}>
                            {t(healthBand(bandKey).labelKey)}
                          </DeskPill>
                        </Td>
                        <Td>
                          <DeskPill tone={fleet.isActive ? 'success' : 'neutral'}>
                            {fleet.isActive
                              ? t('admin.fleets.active')
                              : t('admin.fleets.inactive')}
                          </DeskPill>
                        </Td>
                        <Td>
                          <SettingsLink to={`/admin/fleets/${fleet.id}/settings`}>
                            {t('admin.fleets.settings')}
                          </SettingsLink>
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </TableWrap>
          )}
        </Panel>

        <div ref={formRef}>
        <Panel title={t('admin.fleets.createTitle')}>
          <Form onSubmit={handleSubmit} noValidate aria-label={t('admin.fleets.createTitle')}>
            {created && (
              <Callout tone="info" role="status">
                <PasswordBlock>
                  <strong>{t('admin.fleets.passwordTitle')}</strong>
                  <span>{t('admin.fleets.passwordWarning', { email: created.adminEmail })}</span>
                  <PasswordCode data-testid="one-time-password">
                    {created.oneTimePassword}
                  </PasswordCode>
                  <DeskButton size="xs" variant="secondary" onClick={handleCopy}>
                    {copied ? t('admin.fleets.copiedPassword') : t('admin.fleets.copyPassword')}
                  </DeskButton>
                </PasswordBlock>
              </Callout>
            )}

            {submitError && (
              <Callout tone="danger" role="alert">
                {t(submitError)}
              </Callout>
            )}

            <Field>
              <Lbl htmlFor="af-slug">{t('admin.fleets.fields.slug')}</Lbl>
              <Ctrl
                id="af-slug"
                value={form.slug}
                onChange={(v) => set('slug', v)}
                error={errors.slug ? t(errors.slug) : undefined}
              />
              <SuffixRow>{t('admin.fleets.slugSuffix')}</SuffixRow>
            </Field>

            <Field>
              <Lbl htmlFor="af-name">{t('admin.fleets.fields.name')}</Lbl>
              <Ctrl
                id="af-name"
                value={form.name}
                onChange={(v) => set('name', v)}
                error={errors.name ? t(errors.name) : undefined}
              />
            </Field>

            <Field>
              <Lbl htmlFor="af-phone">{t('admin.fleets.fields.phone')}</Lbl>
              <Ctrl
                id="af-phone"
                type="tel"
                value={form.phone}
                onChange={(v) => set('phone', v)}
                error={errors.phone ? t(errors.phone) : undefined}
              />
            </Field>

            <Field>
              <Lbl htmlFor="af-email">{t('admin.fleets.fields.adminEmail')}</Lbl>
              <Ctrl
                id="af-email"
                type="email"
                value={form.adminEmail}
                onChange={(v) => set('adminEmail', v)}
                error={errors.adminEmail ? t(errors.adminEmail) : undefined}
              />
            </Field>

            <DeskButton
              type="submit"
              variant="primary"
              loading={createFleet.isPending}
              loadingLabel={t('admin.fleets.creating')}
            >
              {t('admin.fleets.create')}
            </DeskButton>
          </Form>
        </Panel>
        </div>
      </Grid>
    </Page>
  )
}
