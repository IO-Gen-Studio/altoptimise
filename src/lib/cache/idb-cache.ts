import { get, set, del } from "idb-keyval";

// Bump when the shape of cached State changes so stale caches are discarded.
const CACHE_VERSION = 2;
const KEY_PREFIX = "lovable-datastore-v" + CACHE_VERSION + ":";

interface Envelope<T> {
  v: number;
  savedAt: string;
  data: T;
}

function key(userId: string) {
  return KEY_PREFIX + userId;
}

export async function loadCachedState<T>(userId: string): Promise<{ data: T; savedAt: string } | null> {
  try {
    const raw = (await get(key(userId))) as Envelope<T> | undefined;
    if (!raw || raw.v !== CACHE_VERSION) return null;
    return { data: raw.data, savedAt: raw.savedAt };
  } catch (e) {
    console.warn("idb-cache load failed", e);
    return null;
  }
}

export async function saveCachedState<T>(userId: string, data: T): Promise<void> {
  try {
    const env: Envelope<T> = { v: CACHE_VERSION, savedAt: new Date().toISOString(), data };
    await set(key(userId), env);
  } catch (e) {
    console.warn("idb-cache save failed", e);
  }
}

export async function clearCachedState(userId: string): Promise<void> {
  try {
    await del(key(userId));
  } catch (e) {
    console.warn("idb-cache clear failed", e);
  }
}