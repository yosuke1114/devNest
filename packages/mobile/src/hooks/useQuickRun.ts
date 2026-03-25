import { useCallback } from "react";
import type { SubTask, SwarmSettings } from "../types/swarm";

const STORAGE_KEY = "devnest-last-run";

export interface LastRun {
  tasks: SubTask[];
  settings: SwarmSettings;
  projectPath: string;
}

export function loadLastRun(): LastRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LastRun;
  } catch { /* ignore */ }
  return null;
}

export function saveLastRun(run: LastRun) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
  } catch { /* ignore */ }
}

export function useQuickRun(
  onRestore: (run: LastRun) => void,
) {
  const lastRun = loadLastRun();

  const execute = useCallback(() => {
    if (lastRun) onRestore(lastRun);
  }, [lastRun, onRestore]);

  return { lastRun, execute };
}
