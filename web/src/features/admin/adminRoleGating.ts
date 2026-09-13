/** Returns true if the given role may access the /admin SuperAdmin route group. */
export function canAccessAdmin(role: string | null | undefined): boolean {
  return role === 'SuperAdmin'
}
