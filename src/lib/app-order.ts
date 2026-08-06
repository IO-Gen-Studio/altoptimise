import { useCallback, useEffect, useState } from "react";

import { APPS, type MiniApp } from "./launcher-context";

const KEY = "launcher.app-order.v1";
const HIDDEN_KEY = "launcher.app-hidden.v1";
const listeners = new Set<(ids: string[]) => void>();
const hiddenListeners = new Set<(ids: string[]) => void>();

function defaults(): string[] {
  return APPS.map((a) => a.id);
}

function normalise(ids: string[]): string[] {
  const filtered = ids.filter((id) => APPS.some((a) => a.id === id));
  const missing = APPS.filter((a) => !filtered.includes(a.id)).map((a) => a.id);
  return [...filtered, ...missing];
}

function readFromStorage(): string[] {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults();
    return normalise(parsed as string[]);
  } catch {
    return defaults();
  }
}

function writeToStorage(order: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* ignore quota / privacy errors */
  }
  listeners.forEach((l) => l(order));
}

function readHidden(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as string[]).filter((id) => APPS.some((a) => a.id === id));
  } catch {
    return [];
  }
}

function writeHidden(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / privacy errors */
  }
  hiddenListeners.forEach((l) => l(ids));
}

export function useAppVisibility(): {
  hiddenIds: string[];
  isHidden: (id: string) => boolean;
  toggleHidden: (id: string) => void;
  showAll: () => void;
} {
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => []);

  useEffect(() => {
    setHiddenIds(readHidden());
    const cb = (next: string[]) => setHiddenIds(next);
    hiddenListeners.add(cb);
    return () => {
      hiddenListeners.delete(cb);
    };
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeHidden(next);
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setHiddenIds([]);
    writeHidden([]);
  }, []);

  return {
    hiddenIds,
    isHidden: (id: string) => hiddenIds.includes(id),
    toggleHidden,
    showAll,
  };
}

export function useAppOrder(): { orderedApps: MiniApp[]; setOrder: (ids: string[]) => void } {
  // Start with defaults so SSR and initial client render match, then hydrate from storage in an effect.
  const [order, setOrderState] = useState<string[]>(() => defaults());

  useEffect(() => {
    setOrderState(readFromStorage());
    const cb = (next: string[]) => setOrderState(normalise(next));
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const setOrder = useCallback((ids: string[]) => {
    const next = normalise(ids);
    setOrderState(next);
    writeToStorage(next);
  }, []);

  const orderedApps = order
    .map((id) => APPS.find((a) => a.id === id))
    .filter((a): a is MiniApp => !!a);

  return { orderedApps, setOrder };
}