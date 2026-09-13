import { useQuery } from '@tanstack/react-query'
import { getAudit, type AuditFilters } from '../../shared/api/client'

/** Audit timeline query. Hierarchical key includes the filters (rules/web-performance.md#query-keys). */
export function useAudit(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => getAudit(filters),
    staleTime: 30_000,
  })
}
