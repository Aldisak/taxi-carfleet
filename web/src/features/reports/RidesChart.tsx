import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { computeChartBars, DEFAULT_CHART_LAYOUT, type RidesPerDayPoint } from './ridesChartGeometry'

const Wrapper = styled.figure`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const Caption = styled.figcaption`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`

const Empty = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  margin: 0;
`

const Bar = styled.rect`
  fill: ${({ theme }) => theme.colors.primary};
`

interface RidesChartProps {
  data: RidesPerDayPoint[]
}

/**
 * Hand-rolled rides-per-day bar chart as plain SVG — NO chart library
 * (rules/web-performance.md#bundle-budget). Geometry is delegated to the pure
 * ridesChartGeometry module; this component only renders.
 */
export function RidesChart({ data }: RidesChartProps) {
  const { t } = useTranslation()
  const { width, height } = DEFAULT_CHART_LAYOUT
  const bars = computeChartBars(data)

  return (
    <Wrapper>
      <Caption>{t('reports.chart.title')}</Caption>
      {bars.length === 0 ? (
        <Empty>{t('reports.chart.empty')}</Empty>
      ) : (
        <svg
          role="img"
          aria-label={t('reports.chart.title')}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
        >
          {bars.map(bar => (
            <Bar
              key={bar.date}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
            >
              <title>{t('reports.chart.barLabel', { day: bar.date, rides: bar.count })}</title>
            </Bar>
          ))}
        </svg>
      )}
    </Wrapper>
  )
}
