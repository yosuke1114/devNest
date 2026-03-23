import { useState, useCallback } from "react";
import type { SubTask, SwarmSettings } from "../types/swarm";

const STORAGE_KEY = "devnest-templates";

export interface SwarmTemplate {
  name: string;
  tasks: SubTask[];
  settings: SwarmSettings;
}

function loadTemplates(): SwarmTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SwarmTemplate[];
  } catch { /* ignore */ }
  return [];
}

function persistTemplates(templates: SwarmTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch { /* ignore */ }
}

export function useTemplates() {
  const [templates, setTemplates] = useState<SwarmTemplate[]>(loadTemplates);

  const saveTemplate = useCallback((name: string, tasks: SubTask[], settings: SwarmSettings) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.name !== name);
      const updated = [...next, { name, tasks, settings }];
      persistTemplates(updated);
      return updated;
    });
  }, []);

  const deleteTemplate = useCallback((name: string) => {
    setTemplates((prev) => {
      const updated = prev.filter((t) => t.name !== name);
      persistTemplates(updated);
      return updated;
    });
  }, []);

  const getTemplate = useCallback(
    (name: string): SwarmTemplate | undefined => {
      return templates.find((t) => t.name === name);
    },
    [templates],
  );

  return { templates, saveTemplate, deleteTemplate, getTemplate };
}
