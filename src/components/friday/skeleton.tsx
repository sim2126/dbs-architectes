// Friday skeleton — shimmer-driven loading placeholder. The .fr-shimmer
// keyframes live in globals.css so the animation runs even when this
// component is server-rendered.
//
// Two API shapes supported. The short form (w/h/rounded) matches Claude
// Design's screens; the long form (width/height/variant) is what our
// earlier code calls.

import * as React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps {
  // Long form
  width?: number | string;
  height?: number | string;
  variant?: "rect" | "circle" | "text";
  // Short form (Claude Design)
  w?: number | string;
  h?: number | string;
  rounded?: number | string;
  className?: string;
}

export function Skeleton({
  width,
  height,
  variant = "rect",
  w,
  h,
  rounded,
  className,
}: SkeletonProps) {
  const resolvedWidth = w ?? width ?? (variant === "circle" ? 32 : "100%");
  const resolvedHeight =
    h ?? height ?? (variant === "text" ? 12 : variant === "circle" ? 32 : 16);
  const resolvedRadius =
    rounded != null
      ? typeof rounded === "number"
        ? `${rounded}px`
        : rounded
      : variant === "circle"
        ? "9999px"
        : variant === "text"
          ? "4px"
          : "6px";

  return (
    <div
      aria-hidden="true"
      className={cn("fr-shimmer", className)}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        borderRadius: resolvedRadius,
      }}
    />
  );
}
