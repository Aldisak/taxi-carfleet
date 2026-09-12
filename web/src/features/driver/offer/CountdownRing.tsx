import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { computeCountdown } from './offerCountdown'

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const Svg = styled.svg`
  transform: rotate(-90deg);
`

const TrackCircle = styled.circle`
  fill: none;
  stroke: ${({ theme }) => theme.colors.border};
  stroke-width: 6;
`

const ProgressCircle = styled.circle<{ $offset: number }>`
  fill: none;
  stroke: ${({ theme }) => theme.colors.warning};
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: ${CIRCUMFERENCE};
  stroke-dashoffset: ${({ $offset }) => $offset};
  transition: stroke-dashoffset 0.5s linear;
`

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 108px;
  height: 108px;
`

const Label = styled.span`
  position: absolute;
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

interface CountdownRingProps {
  expiresAt: string
  totalSeconds: number
  onExpired?: () => void
}

/**
 * SVG countdown ring that animates stroke-dashoffset from 0 to full circumference.
 * Server-time-based: uses expiresAt compared to Date.now() on each tick.
 * Calls onExpired when the countdown reaches 0.
 */
export function CountdownRing({ expiresAt, totalSeconds, onExpired }: CountdownRingProps) {
  const [result, setResult] = useState(() =>
    computeCountdown(expiresAt, new Date(), totalSeconds, RADIUS),
  )

  useEffect(() => {
    const id = setInterval(() => {
      const next = computeCountdown(expiresAt, new Date(), totalSeconds, RADIUS)
      setResult(next)
      if (next.isDismissed) {
        clearInterval(id)
        onExpired?.()
      }
    }, 500)
    return () => { clearInterval(id) }
  }, [expiresAt, totalSeconds, onExpired])

  const secs = Math.ceil(result.remainingSeconds)

  return (
    <Wrapper>
      <Svg width={108} height={108} viewBox="0 0 108 108">
        <TrackCircle cx={54} cy={54} r={RADIUS} />
        <ProgressCircle cx={54} cy={54} r={RADIUS} $offset={result.strokeDashoffset} />
      </Svg>
      <Label>{secs}</Label>
    </Wrapper>
  )
}
