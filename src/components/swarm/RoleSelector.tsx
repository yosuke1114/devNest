import type { WorkerRole } from "./types";
import { ROLE_ICON, ROLE_LABEL } from "./types";

const ROLES: WorkerRole[] = ["scout", "builder", "reviewer", "merger", "shell"];

interface RoleSelectorProps {
  value: WorkerRole;
  onChange: (role: WorkerRole) => void;
}

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <select
      data-testid="role-selector"
      value={value}
      onChange={(e) => onChange(e.target.value as WorkerRole)}
      style={{
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#e6edf3",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "monospace",
        padding: "5px 8px",
      }}
      aria-label="Worker ロールを選択"
    >
      {ROLES.map((r) => (
        <option key={r} value={r} data-testid={`role-option-${r}`}>
          {ROLE_ICON[r]} {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}
