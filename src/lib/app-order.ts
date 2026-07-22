import { useCallback, useEffect, useSyncExternalStore } from "react";

import { APPS, type MiniApp } from "./launcher-context";

const KEY = "launcher.app-order.v1";
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === "undefined") return APPS.map((a) => a.id);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return APPS.map((a) => a.id);
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return APPS.map((a) => a.id);
    return parsed.filter((id) => APPS.some((a) => a.id === id));
  } catch {
    return APPS.map((a) => a.id);
  }
}

function write(order: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(order));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(KEY) ?? "";
}

export function useAppOrder(): { orderedApps: MiniApp[]; setOrder: (ids: string[]) => void } {
  useSyncExternalStore(subscribe, getSnapshot, () => "");
  const stored = read();
  const missing = APPS.filter((a) => !stored.includes(a.id)).map((a) => a.id);
  const full = [...stored, ...missing];
  const orderedApps = full
    .map((id) => APPS.find((a) => a.id === id))
    .filter((a): a is MiniApp => !!a);
  const setOrder = useCallback((ids: string[]) => write(ids), []);
  // Persist normalised order once on mount if stale
  useEffect(() => {
    if (JSON.stringify(stored) !== JSON.stringify(full)) write(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { orderedApps, setOrder };
}