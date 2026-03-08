import React from "react";

export function highlightKeyword(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return React.createElement(
    React.Fragment,
    null,
    ...parts.map((part, i) =>
      part.toLowerCase() === keyword.toLowerCase()
        ? React.createElement(
            "mark",
            { key: i, className: "bg-yellow-300/30 text-yellow-200 rounded px-0.5" },
            part
          )
        : part
    )
  );
}
