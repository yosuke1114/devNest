import { open } from "@tauri-apps/plugin-dialog";
import { IconFolder } from "@tabler/icons-react";

interface FilePickerProps {
  onPick: (path: string) => void;
  label?: string;
  directory?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FilePicker({
  onPick,
  label = "選択…",
  directory = false,
  disabled = false,
  className,
}: FilePickerProps) {
  const handleClick = async () => {
    if (disabled) return;
    const result = await open({ directory, multiple: false });
    if (typeof result === "string" && result) {
      onPick(result);
    }
  };

  return (
    <button
      type="button"
      data-testid="file-picker"
      className={className}
      disabled={disabled}
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        background: "transparent",
        border: "1px solid #3a3a52",
        borderRadius: 4,
        color: "#aaa",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <IconFolder size={14} />
      {label}
    </button>
  );
}
