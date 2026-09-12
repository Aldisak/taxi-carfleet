/** Returns true if the given role may access the /x/settings route. */
export function canAccessSettings(role: string | null | undefined): boolean {
  return role === 'FleetAdmin'
}
