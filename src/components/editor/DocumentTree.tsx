import { IconAlertTriangle } from "@tabler/icons-react";
import type { Document } from "../../types";

interface DocumentTreeProps {
  documents: Document[];
  onSelect: (doc: Document) => void;
  selectedId: number | null;
}

export function DocumentTree({ documents, onSelect, selectedId }: DocumentTreeProps) {
  if (documents.length === 0) {
    return (
      <div style={{ padding: 16, color: "#666", fontSize: 13 }}>
        設計書ファイルがありません
      </div>
    );
  }

  return (
    <div>
      {documents.map((doc) => {
        const isSelected = selectedId === doc.id;
        const label = doc.path.replace(/^docs\//, "");
        const filename = doc.path.split("/").pop() ?? doc.path;

        return (
          <button
            key={doc.id}
            role="button"
            aria-selected={isSelected}
            data-testid={`tree-node-${filename}`}
            onClick={() => onSelect(doc)}
            title={doc.path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              padding: "8px 16px",
              background: isSelected ? "#2a2a42" : "transparent",
              border: "none",
              borderLeft: isSelected ? "2px solid #7c6cf2" : "2px solid transparent",
              color: isSelected ? "#e0e0e0" : "#aaa",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 13,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {doc.is_dirty && (
              <span style={{ color: "#f0a500", flexShrink: 0 }}>●</span>
            )}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </span>
            {doc.push_status === "push_failed" && (
              <IconAlertTriangle
                data-testid="push-failed-icon"
                size={12}
                color="#e74c3c"
                style={{ flexShrink: 0 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
