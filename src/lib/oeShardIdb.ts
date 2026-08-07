/**
 * IndexedDB cache for OE year shards — localStorage (~5–10 MB) cannot hold ~40 MB years.
 */

import type { DashboardSlice } from './mergeSlices'

const DB_NAME = 'nucky-oe-shards'
const DB_VERSION = 1
const STORE = 'years'

type YearRecord = {
  year: string
  stamp: string
  slices: Record<string, DashboardSlice>
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('idb open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'year' })
      }
    }
  })
}

export async function idbReadYearSlices(
  year: string,
  stamp: string,
): Promise<Record<string, DashboardSlice> | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(year)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const row = req.result as YearRecord | undefined
        if (!row?.slices || row.stamp !== stamp) {
          resolve(null)
          return
        }
        resolve(row.slices)
      }
    })
  } catch {
    return null
  }
}

export async function idbWriteYearSlices(
  year: string,
  stamp: string,
  slices: Record<string, DashboardSlice>,
): Promise<void> {
  try {
    const db = await openDb()
    const record: YearRecord = {
      year,
      stamp,
      slices,
      savedAt: Date.now(),
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE).put(record)
    })
  } catch {
    // Quota / private mode — ignore; memory cache still works for the session.
  }
}

export async function idbClearYear(year: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE).delete(year)
    })
  } catch {
    /* ignore */
  }
}
