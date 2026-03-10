import type { ButtonHTMLAttributes, ReactNode } from "react";

interface AsyncButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  variant?: "primary" | "danger" | "ghost";
  children: ReactNode;
}

const VARIANT_STYLES: Record<NonNullable<AsyncButtonProps["variant"]>, React.CSSProperties> = {
  primary: { background: "#7c6cf2", color: "#fff", borderColor: "#7c6cf2" },
  danger:  { background: "#e74c3c", color: "#fff", borderColor: "#e74c3c" },
  ghost:   { background: "transparent", color: "#aaa", borderColor: "#3a3a52" },
};

export function AsyncButton({
  loading = false,
  loadingLabel,
  variant = "primary",
  children,
  disabled,
  className,
  style,
  onClick,
  ...rest
}: AsyncButtonProps) {
  const isDisabled = loading || disabled;

  return (
    <button
      {...rest}
      data-testid="async-button"
      className={className}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 4,
        border: "1px solid",
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontSize: 14,
        opacity: loading ? 0.7 : 1,
        transition: "opacity 0.15s",
        ...VARIANT_STYLES[variant],
        ...style,
      }}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
