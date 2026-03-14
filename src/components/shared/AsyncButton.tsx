import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface AsyncButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  variant?: "primary" | "danger" | "ghost";
  children: ReactNode;
}

const VARIANT_MAP = {
  primary: "default",
  danger: "destructive",
  ghost: "ghost",
} as const;

export function AsyncButton({
  loading = false,
  loadingLabel,
  variant = "primary",
  children,
  disabled,
  className,
  onClick,
  ...rest
}: AsyncButtonProps) {
  const isDisabled = loading || disabled;

  return (
    <Button
      {...rest}
      data-testid="async-button"
      className={cn(className)}
      variant={VARIANT_MAP[variant]}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </Button>
  );
}
