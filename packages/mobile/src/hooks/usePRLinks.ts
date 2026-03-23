import { useState, useEffect } from "react";

export function usePRLinks(workerLogs: Record<string, string[]>) {
  const [prLinks, setPrLinks] = useState<string[]>([]);

  useEffect(() => {
    const allLines = Object.values(workerLogs).flat();
    const found = new Set<string>();
    for (const line of allLines) {
      const matches = line.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/g);
      if (matches) matches.forEach((u) => found.add(u));
    }
    setPrLinks(Array.from(found));
  }, [workerLogs]);

  return prLinks;
}
