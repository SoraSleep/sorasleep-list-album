import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "solid" | "quiet";
};

export function Button({ variant = "ghost", className, type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-40",
        variant === "solid" && "bg-accent text-accent-fg hover:bg-silver",
        variant === "ghost" && "border border-border bg-subtle text-fg hover:border-silver",
        variant === "quiet" && "text-muted hover:bg-subtle hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
