import { useState, useMemo } from "react";
import type { LogEntry } from "./useSwarmWS";

export function useLogFilter(logs: LogEntry[]) {
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "error" | "success">("all");
  const [logSearch, setLogSearch] = useState("");

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logFilter !== "all" && log.level !== logFilter) return false;
      if (logSearch && !log.text.toLowerCase().includes(logSearch.toLowerCase())) return false;
      return true;
    });
  }, [logs, logFilter, logSearch]);

  return { logFilter, setLogFilter, logSearch, setLogSearch, filteredLogs };
}
