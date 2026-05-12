// Friday skeleton — shimmer-driven loading placeholder. The .fr-shimmer
// keyframes live in globals.css so the animation runs even when this
// component is server-rendered. Default rounded rect; pass `circle` for
// avatars and `text` for inline lines.

import * as React from "react";
import { cn } from "@/ui/utils";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: "rect" | "circle" | "text";
  className?: string;
}

export function Skeleton({
  width,
  height,
  variant = "rect",
  className,
}: SkeletonProps) {
  const radius =
    variant === "circle" ? "9999px" : variant === "text" ? "4px" : "6px";
  const resolvedHeight =
    height ?? (variant === "text" ? 12 : variant === "circle" ? 32 : 16);
  const resolvedWidth = width ?? (variant === "circle" ? 32 : "100%");

  return (
    <div
      aria-hidden="true"
      className={cn("fr-shimmer", className)}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        borderRadius: radius,
      }}
    />
  );
}
