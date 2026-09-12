import styled, { keyframes } from 'styled-components'
import { useConnectionState } from '../../../shared/realtime/useFleetHub'

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`

interface DotProps {
  $state: 'green' | 'yellow' | 'red'
}

const Dot = styled.span<DotProps>`
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ $state, theme }) =>
    $state === 'green'
      ? theme.colors.success
      : $state === 'yellow'
        ? theme.colors.warning
        : theme.colors.error};
  animation: ${({ $state }) =>
    $state !== 'green' ? pulse : 'none'} 1.2s ease-in-out infinite;
  flex-shrink: 0;
`

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Label = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/**
 * Small connection status indicator dot.
 * Green = connected, Yellow = connecting/reconnecting, Red = disconnected.
 */
export function ConnectionDot() {
  const state = useConnectionState()

  const dotState =
    state === 'connected'
      ? 'green'
      : state === 'disconnected'
        ? 'red'
        : 'yellow'

  return (
    <Wrapper>
      <Dot $state={dotState} aria-hidden="true" />
      <Label>{dotState}</Label>
    </Wrapper>
  )
}
