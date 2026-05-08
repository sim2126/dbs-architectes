// Friday button — matches the Claude Design Button primitive surface.
// Four kinds (primary / secondary / ghost / danger), three sizes,
// leading/trailing icon slots, optional kbd hint, and a built-in
// busy spinner.
//
// The shadcn Button at @/components/ui/button.tsx still exists for
// pages that haven't migrated. New code should reach for this one.

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "children"
  > {
  children?: React.ReactNode;
  kind?: ButtonKind;
  size?: ButtonSize;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  kbd?: string;
  busy?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
}

const SIZE: Record<
  ButtonSize,
  { h: string; padX: string; fs: string; gap: string; kbdFs: string }
> = {
  sm: { h: "h-[26px]", padX: "px-2", fs: "text-[11.5px]", gap: "gap-1.5", kbdFs: "text-[9px]" },
  md: { h: "h-[30px]", padX: "px-2.5", fs: "text-[12.5px]", gap: "gap-2", kbdFs: "text-[9.5px]" },
  lg: { h: "h-[34px]", padX: "px-3", fs: "text-[13px]", gap: "gap-2.5", kbdFs: "text-[10px]" },
};

function Spinner({ size = 12, color }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color ?? "currentColor"}
        strokeOpacity="0.2"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke={color ?? "currentColor"}
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

export function Button({
  children,
  kind = "secondary",
  size = "md",
  leading,
  trailing,
  kbd,
  busy,
  fullWidth,
  disabled,
  className,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  const s = SIZE[size];

  const palette =
    kind === "primary"
      ? "bg-friday-accent text-white border-friday-accent hover:opacity-90"
      : kind === "ghost"
        ? "bg-transparent text-friday-fg border-transparent hover:bg-friday-surface-2"
        : kind === "danger"
          ? "bg-friday-surface text-[#b91c1c] border-friday-border hover:bg-[#fef2f2] hover:border-[#fecaca]"
          : "bg-friday-surface text-friday-fg border-friday-border hover:bg-friday-surface-2";

  const kbdPalette =
    kind === "primary"
      ? "border-white/25 text-white/70"
      : "border-friday-border-soft text-friday-fg-subtle";

  return (
    <button
      type={type}
      onClick={(e) => {
        if (disabled || busy) return;
        onClick?.(e);
      }}
      disabled={disabled || busy}
      className={cn(
        "relative inline-flex items-center justify-center font-medium border rounded outline-none -tracking-[0.05px] transition-[background,transform,box-shadow] duration-100",
        "focus-visible:ring-2 focus-visible:ring-friday-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-friday-bg",
        "active:translate-y-px",
        "disabled:opacity-50 disabled:cursor-default",
        s.h,
        s.padX,
        s.fs,
        s.gap,
        palette,
        fullWidth ? "w-full" : "",
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : leading}
      {children ? <span>{children}</span> : null}
      {!busy ? trailing : null}
      {kbd ? (
        <span
          className={cn(
            "ml-1 px-1 py-px font-mono font-medium border rounded-[2px] leading-tight",
            s.kbdFs,
            kbdPalette,
          )}
        >
          {kbd}
        </span>
      ) : null}
    </button>
  );
}
