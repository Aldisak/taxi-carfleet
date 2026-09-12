/** Returns the number of whole seconds elapsed since the createdAt timestamp. */
export function getElapsedSeconds(createdAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / 1000)
}

/** Returns true when the elapsed time for a New order exceeds 2 minutes (120 seconds). */
export function isElapsedRed(elapsedSeconds: number): boolean {
  return elapsedSeconds >= 120
}
