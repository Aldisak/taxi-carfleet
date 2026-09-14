import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authStorage } from '../../shared/api/auth-storage'
import { canAccessAdmin } from './adminRoleGating'

/**
 * SuperAdmin route guard for /admin. Reads the persisted role and, for anyone other than a
 * SuperAdmin (including logged-out), redirects to the DEDICATED /admin/login (UC-007 A7b) —
 * never the fleet-scoped /dispatcher/login, which structurally cannot authenticate a fleetless SuperAdmin.
 * A dedicated login route also means a successful login navigates to /admin and re-mounts this
 * guard, which then re-reads the freshly-stored SuperAdmin role. SuperAdmin is fleetless, so
 * /admin lives outside the fleet-scoped AppLayout.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const role = authStorage.getUserRole()
  if (!canAccessAdmin(role)) {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}
