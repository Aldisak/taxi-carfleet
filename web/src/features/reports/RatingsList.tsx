import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { RatingDto } from '../../shared/api/client'

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Item = styled.li`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const Stars = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Comment = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.text};
`

const Meta = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
`

const Empty = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
`

interface RatingsListProps {
  ratings: RatingDto[]
}

/** Renders the ratings list (stars + comment + order code + driver). */
export function RatingsList({ ratings }: RatingsListProps) {
  const { t } = useTranslation()

  if (ratings.length === 0) {
    return <Empty>{t('reports.ratings.empty')}</Empty>
  }

  return (
    <List>
      {ratings.map((r, idx) => (
        <Item key={`${r.orderPublicCode}-${idx}`}>
          <Stars>{t('reports.ratings.stars', { stars: r.stars })}</Stars>
          {r.comment ? <Comment>{r.comment}</Comment> : <Comment>{t('reports.ratings.noComment')}</Comment>}
          <Meta>
            {t('reports.ratings.order')}: {r.orderPublicCode} · {t('reports.ratings.driver')}: {r.driverName ?? '—'}
          </Meta>
        </Item>
      ))}
    </List>
  )
}
