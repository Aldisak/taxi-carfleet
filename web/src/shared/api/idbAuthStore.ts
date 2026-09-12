import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'taxi-driver-auth'
const DB_VERSION = 1
const STORE_NAME = 'tokens'
const REFRESH_KEY = 'refreshToken'

/** Lazily opened IDB database instance. */
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      },
    })
  }
  return dbPromise
}

/**
 * IndexedDB-backed storage for the driver refresh token.
 * Used when "Zůstat přihlášen" is checked at login.
 * Keeps the refresh token across browser sessions (tab closes, restarts).
 */
export const idbAuthStore = {
  /** Retrieve the stored refresh token, or null if absent. */
  async getRefreshToken(): Promise<string | null> {
    try {
      const db = await getDb()
      const value = await db.get(STORE_NAME, REFRESH_KEY)
      return (value as string | undefined) ?? null
    } catch {
      return null
    }
  },

  /** Persist a refresh token to IndexedDB. */
  async setRefreshToken(token: string): Promise<void> {
    const db = await getDb()
    await db.put(STORE_NAME, token, REFRESH_KEY)
  },

  /** Remove the stored refresh token. */
  async clear(): Promise<void> {
    try {
      const db = await getDb()
      await db.delete(STORE_NAME, REFRESH_KEY)
    } catch {
      // Ignore clear errors — best effort
    }
  },
}
