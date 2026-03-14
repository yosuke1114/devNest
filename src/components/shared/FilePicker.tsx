import { open } from "@tauri-apps/plugin-dialog";
import { IconFolder } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

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
    <Button
      type="button"
      data-testid="file-picker"
      variant="outline"
      size="sm"
      className={cn(className)}
      disabled={disabled}
      onClick={handleClick}
    >
      <IconFolder size={14} />
      {label}
    </Button>
  );
}
