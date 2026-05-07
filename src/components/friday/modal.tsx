// Friday modal — backdrop + centred panel with fade/slide-in entry.
// Used by the command palette and by any future settings-style sheet.
// Closes on ESC and on backdrop click.

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  width?: number;
  align?: "top" | "center";
  className?: string;
}

export function Modal({
  open,
  onClose,
  children,
  width = 600,
  align = "top",
  className,
}: ModalProps) {
  const [enter, setEnter] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setEnter(false);
      return;
    }
    const r = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-[100] flex justify-center transition-[background,backdrop-filter] duration-200",
        align === "top" ? "items-start pt-20" : "items-center",
      )}
      style={{
        background: enter ? "rgba(26,26,24,0.32)" : "rgba(26,26,24,0)",
        backdropFilter: enter ? "blur(2px)" : "blur(0)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-friday-surface rounded-md border border-friday-border overflow-hidden transition-[transform,opacity] duration-200 ease-out",
          className,
        )}
        style={{
          width,
          maxWidth: "92vw",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(20,18,12,0.12), 0 24px 60px rgba(20,18,12,0.10)",
          transform: enter ? "translateY(0)" : "translateY(-8px)",
          opacity: enter ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
