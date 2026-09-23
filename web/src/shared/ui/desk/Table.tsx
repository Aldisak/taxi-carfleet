import styled, { css } from 'styled-components'

/** Shared right-align + tabular-numerals styling for numeric columns. */
const numColumn = css`
  text-align: right;
  font-variant-numeric: tabular-nums;
`

/**
 * A dense desktop data table. Compose with {@link Thead}, {@link Tbody}, {@link Tr},
 * {@link Th} and {@link Td}. Body text is 14px; header cells are 12/800 uppercase; the
 * `$num` modifier on {@link Th}/{@link Td} right-aligns and uses tabular numerals.
 */
export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: var(--ink);
`

/** The table header group. */
export const Thead = styled.thead`
  th {
    border-bottom: 1px solid var(--line);
  }
`

/** The table body group; rows highlight on hover. */
export const Tbody = styled.tbody`
  tr:hover {
    background: var(--surface-2);
  }

  td {
    border-bottom: 1px solid var(--line);
  }
`

/** A table row. */
export const Tr = styled.tr``

/** A header cell. Pass `$num` to right-align and use tabular numerals. */
export const Th = styled.th<{ $num?: boolean }>`
  padding: 8px 12px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
  text-align: left;
  white-space: nowrap;

  ${({ $num }) => $num === true && numColumn}
`

/** A body cell. Pass `$num` to right-align and use tabular numerals. */
export const Td = styled.td<{ $num?: boolean }>`
  padding: 12px;
  color: var(--ink);
  text-align: left;

  ${({ $num }) => $num === true && numColumn}
`
