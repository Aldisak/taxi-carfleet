import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'taxi-driver-ride'
const DB_VERSION = 1
const STORE_NAME = 'ride'
const ORDER_ID_KEY = 'activeOrderId'
const ARRIVED_AT_KEY = 'arrivedAt'

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
 * IndexedDB-backed persistence for the active ride order ID and arrivedAt timestamp.
 * Survives tab kill and app restarts. Used by useRideRestore to reconcile with the server.
 */
export const idbRideStore = {
  /** Retrieve the persisted active order ID, or null if absent. */
  async getActiveOrderId(): Promise<string | null> {
    try {
      const db = await getDb()
      const value = await db.get(STORE_NAME, ORDER_ID_KEY)
      return (value as string | undefined) ?? null
    } catch {
      return null
    }
  },

  /** Persist the active order ID. */
  async setActiveOrderId(orderId: string): Promise<void> {
    try {
      const db = await getDb()
      await db.put(STORE_NAME, orderId, ORDER_ID_KEY)
    } catch {
      // ignore storage errors
    }
  },

  /** Retrieve the persisted arrivedAt ISO string, or null if absent. */
  async getArrivedAt(): Promise<string | null> {
    try {
      const db = await getDb()
      const value = await db.get(STORE_NAME, ARRIVED_AT_KEY)
      return (value as string | undefined) ?? null
    } catch {
      return null
    }
  },

  /** Persist the arrivedAt ISO string (local timestamp when arrive transition succeeded). */
  async setArrivedAt(arrivedAt: string): Promise<void> {
    try {
      const db = await getDb()
      await db.put(STORE_NAME, arrivedAt, ARRIVED_AT_KEY)
    } catch {
      // ignore storage errors
    }
  },

  /** Clear all persisted ride state. */
  async clear(): Promise<void> {
    try {
      const db = await getDb()
      await db.delete(STORE_NAME, ORDER_ID_KEY)
      await db.delete(STORE_NAME, ARRIVED_AT_KEY)
    } catch {
      // Ignore clear errors — best effort
    }
  },
}
