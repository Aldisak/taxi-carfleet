import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'taxi-driver-queue'
const DB_VERSION = 1
const STORE_NAME = 'transitions'

/** The transition actions that are safe to queue (accept/decline are NEVER queued). */
export type QueuedAction = 'arrive' | 'start' | 'complete' | 'cancelNoShow'

/** Payload carried by a queued complete (other actions carry null). */
export interface CompletePayload {
  finalPriceCzk: number
  paymentType: string
  overrideReason?: string
}

/** A single queued transition. The idempotency key is minted ONCE at enqueue time. */
export interface QueuedTransition {
  /** Monotonic FIFO key (also the idb keyPath). */
  id: number
  action: QueuedAction
  orderId: string
  /** Complete carries a CompletePayload; other actions carry null. */
  payload: CompletePayload | null
  /** X-Idempotency-Key minted at enqueue, preserved across every retry (exactly-once linchpin). */
  idempotencyKey: string
  /** ISO timestamp of enqueue. */
  enqueuedAt: string
}

/** Lazily opened IDB database instance. */
let dbPromise: Promise<IDBPDatabase> | null = null

/** Listeners notified (with the current pending count) on every queue mutation. */
const countListeners = new Set<(count: number) => void>()

async function notifyCount(): Promise<void> {
  if (countListeners.size === 0) return
  const count = (await transitionQueue.peekAll()).length
  countListeners.forEach(fn => fn(count))
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        }
      },
    })
  }
  return dbPromise
}

/**
 * App-level IndexedDB FIFO queue for driver transitions (arrive/start/complete/no-show-cancel).
 *
 * Deliberately NOT workbox-background-sync: an app-level queue is fake-indexeddb-testable and
 * works with the service worker disabled in E2E. The autoIncrement id gives natural FIFO order.
 * The idempotency key is minted at enqueue and preserved across retries so the server's
 * idempotency layer (A-idem) can dedupe a replay to exactly-once.
 */
export const transitionQueue = {
  /**
   * Enqueue a transition; mints the idempotency key and FIFO id here, once.
   * Returns the stored item (with its minted key + id).
   */
  async enqueue(item: {
    action: QueuedAction
    orderId: string
    payload: CompletePayload | null
  }): Promise<QueuedTransition> {
    const db = await getDb()
    const record = {
      action: item.action,
      orderId: item.orderId,
      payload: item.payload,
      idempotencyKey: crypto.randomUUID(),
      enqueuedAt: new Date().toISOString(),
    }
    const id = (await db.add(STORE_NAME, record)) as number
    await notifyCount()
    return { id, ...record }
  },

  /** All queued transitions in FIFO (enqueue) order. */
  async peekAll(): Promise<QueuedTransition[]> {
    const db = await getDb()
    const all = (await db.getAll(STORE_NAME)) as QueuedTransition[]
    return all.sort((a, b) => a.id - b.id)
  },

  /** Remove a single queued item by its FIFO id. */
  async remove(id: number): Promise<void> {
    const db = await getDb()
    await db.delete(STORE_NAME, id)
    await notifyCount()
  },

  /** Remove every queued item for a given order (used on a definitive 4xx drop+reconcile). */
  async removeByOrderId(orderId: string): Promise<void> {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const all = (await tx.store.getAll()) as QueuedTransition[]
    for (const item of all) {
      if (item.orderId === orderId) await tx.store.delete(item.id)
    }
    await tx.done
    await notifyCount()
  },

  /** Remove all queued items. */
  async clear(): Promise<void> {
    const db = await getDb()
    await db.clear(STORE_NAME)
    await notifyCount()
  },

  /** Subscribe to pending-count changes. Returns an unsubscribe function. */
  subscribe(listener: (count: number) => void): () => void {
    countListeners.add(listener)
    return () => { countListeners.delete(listener) }
  },

  /** Current pending count (one-shot). */
  async count(): Promise<number> {
    return (await transitionQueue.peekAll()).length
  },

  /** Drop the cached DB handle so the next call reopens (used by tests to simulate a reload). */
  async reset(): Promise<void> {
    if (dbPromise) {
      const db = await dbPromise
      db.close()
    }
    dbPromise = null
  },
}
