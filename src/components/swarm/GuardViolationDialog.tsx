import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface GuardViolation {
  workerId: string;
  violation: { type: string; file?: string };
}

interface Props {
  onContinue: (workerId: string) => void;
  onStop: (workerId: string) => void;
}

export function GuardViolationDialog({ onContinue, onStop }: Props) {
  const [violation, setViolation] = useState<GuardViolation | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<GuardViolation>("guard-violation", (e) => {
      if (e.payload.violation.type === "git_push" ||
          e.payload.violation.type === "git_reset") {
        setToast(`Worker ${e.payload.workerId} がgitガード違反を試みました`);
        setTimeout(() => setToast(null), 4000);
        return;
      }
      setViolation(e.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const violationLabel = violation
    ? violation.violation.type === "file_write_out_of_scope"
      ? `ファイルへの書き込みを試みました: ${violation.violation.file}`
      : `不正な操作を試みました: ${violation.violation.type}`
    : "";

  return (
    <>
      {toast && (
        <div data-testid="guard-violation-toast" style={{
          position: "fixed", bottom: 24, right: 24,
          background: "#161b22", border: "1px solid #f6ad55",
          borderRadius: 8, padding: "10px 16px", zIndex: 200,
          color: "#f6ad55", fontSize: 13,
        }}>
          ⚠️ {toast}
        </div>
      )}
      {violation && (
        <div data-testid="guard-violation-dialog" style={{
          position: "fixed", bottom: 24, right: 24,
          background: "#161b22", border: "1px solid #f6ad55",
          borderRadius: 8, padding: 16, zIndex: 200,
          maxWidth: 360,
        }}>
          <div style={{ color: "#f6ad55", fontSize: 13, marginBottom: 8 }}>
            ⚠️ ガード違反検出
          </div>
          <div style={{ color: "#8b949e", fontSize: 12, marginBottom: 12 }}>
            Worker {violation.workerId} が{violationLabel}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              data-testid="guard-continue-button"
              onClick={() => { onContinue(violation.workerId); setViolation(null); }}
            >
              継続させる
            </button>
            <button
              data-testid="guard-stop-button"
              onClick={() => { onStop(violation.workerId); setViolation(null); }}
            >
              停止する
            </button>
          </div>
        </div>
      )}
    </>
  );
}
