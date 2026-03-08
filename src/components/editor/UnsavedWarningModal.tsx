interface UnsavedWarningModalProps {
  filename: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedWarningModal({
  filename,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedWarningModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1e1e30",
          border: "1px solid #3a3a52",
          borderRadius: 8,
          padding: 24,
          width: 400,
          maxWidth: "90vw",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#e0e0e0" }}>
          未保存の変更があります
        </h2>
        <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>
          <code style={{ color: "#7c6cf2" }}>{filename}</code> に未保存の変更があります。
          続行する前に保存しますか？
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            aria-label="キャンセル"
            onClick={onCancel}
            style={ghostBtnStyle}
          >
            キャンセル
          </button>
          <button
            aria-label="変更を破棄"
            onClick={onDiscard}
            style={{ ...ghostBtnStyle, color: "#e74c3c", borderColor: "#e74c3c40" }}
          >
            破棄
          </button>
          <button
            aria-label="保存"
            onClick={onSave}
            style={{
              padding: "6px 16px",
              background: "#7c6cf2",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  background: "transparent",
  color: "#aaa",
  border: "1px solid #3a3a52",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
