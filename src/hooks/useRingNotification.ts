import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";

export type RingUrgency = "info" | "warning" | "critical";

export interface RingEvent {
  type: "agentAttention" | "maintenanceAlert" | "docStale" | "gitHubEvent";
  urgency: RingUrgency;
  productId?: string;
  taskId?: string;
  taskType?: string;
  message?: string;
  alertType?: string;
  severity?: string;
  docPath?: string;
  stalenessScore?: number;
  eventType?: string;
  title?: string;
  url?: string;
}

export interface ActiveRing {
  id: string;
  event: RingEvent;
  receivedAt: number;
}

export function useRingNotification() {
  const [rings, setRings] = useState<ActiveRing[]>([]);

  const addRing = useCallback((event: RingEvent) => {
    const ring: ActiveRing = {
      id: `${Date.now()}-${Math.random()}`,
      event,
      receivedAt: Date.now(),
    };
    setRings((prev) => [ring, ...prev]);

    // Info urgency は5秒後に自動消去
    if (event.urgency === "info") {
      setTimeout(() => {
        setRings((prev) => prev.filter((r) => r.id !== ring.id));
      }, 5000);
    }
  }, []);

  const dismissRing = useCallback((ringId: string) => {
    setRings((prev) => prev.filter((r) => r.id !== ringId));
  }, []);

  const clearAll = useCallback(() => {
    setRings([]);
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<RingEvent>("ring-event", (event) => {
      addRing(event.payload);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [addRing]);

  // urgency別のアクティブリング数
  const criticalCount = rings.filter((r) => r.event.urgency === "critical").length;
  const warningCount = rings.filter((r) => r.event.urgency === "warning").length;

  return { rings, dismissRing, clearAll, criticalCount, warningCount };
}
