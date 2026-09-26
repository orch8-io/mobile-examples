import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { loadAllInspections, type InspectionView } from "./inspections";
import { subscribe } from "./runtime";

/**
 * Inspection list derived from the engine. It refreshes on engine events,
 * on foreground, and on a slow poll, which catches server commands such as
 * a supervisor decision that arrive through the engine's own sync loop.
 */
export function useInspections(pollMs = 2_000) {
  const [items, setItems] = useState<InspectionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await loadAllInspections();
      if (mounted.current) {
        setItems(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const unsubscribe = subscribe(() => void refresh());
    const timer = setInterval(() => void refresh(), pollMs);
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      clearInterval(timer);
      appState.remove();
    };
  }, [refresh, pollMs]);

  return { items, error, refresh };
}
