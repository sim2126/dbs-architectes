"use client";

/**
 * DBS AI logo.
 *
 * Two PNG sources at the public root:
 *   /public/dbs-ai-wordmark.png   — hexagonal mark + "DBS AI" wordmark
 *   /public/dbs-ai-mark.png       — cursive lowercase "d" only
 *
 * Variants:
 *   mark      → just the cursive "d" (in-chat avatar, small contexts)
 *   wordmark  → hexagonal mark + wordmark (top of sidebar, headers)
 *   hero      → large wordmark (empty state / scheduled break)
 *
 * Background handling. PNGs carry a near-white paper background.
 * `.dbs-ai-logo-img` in globals.css applies `mix-blend-mode: multiply`
 * in light mode (white background blends into the cream surface, dark
 * ink stays) and `invert + screen` in dark mode (image flips, dark
 * background drops out, light ink shows on the dark surface).
 *
 * Replace the PNGs with transparent versions later and the blend rule
 * becomes a harmless no-op — no code change needed.
 */

import Image from "next/image";
import { cn } from "@/ui/utils";

type Variant = "mark" | "wordmark" | "hero";

interface AiLogoProps {
  variant?: Variant;
  /** Pixel height of the mark / wordmark. Variants pick a sensible default. */
  size?: number;
  className?: string;
}

const WORDMARK_SRC = "/dbs-ai-wordmark.png";
const MARK_SRC = "/dbs-ai-mark.png";

const IMG_CLASS = "dbs-ai-logo-img";

export function AiLogo({ variant = "mark", size, className }: AiLogoProps) {
  if (variant === "mark") {
    const px = size ?? 44;
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        style={{ width: px, height: px }}
      >
        <Image
          src={MARK_SRC}
          alt="DBS AI"
          width={px * 2}
          height={px * 2}
          className={cn("h-full w-full object-contain", IMG_CLASS)}
          priority
        />
      </span>
    );
  }

  if (variant === "wordmark") {
    // Wordmark is a wide lockup — measure by height; width scales with image.
    const height = size ?? 40;
    return (
      <span
        className={cn("inline-flex shrink-0 items-center", className)}
        style={{ height }}
      >
        <Image
          src={WORDMARK_SRC}
          alt="DBS AI"
          width={Math.round(height * 5)}
          height={height}
          className={cn("h-full w-auto object-contain", IMG_CLASS)}
          priority
        />
      </span>
    );
  }

  // hero — large wordmark for empty states / break card
  const height = size ?? 64;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      style={{ height }}
    >
      <Image
        src={WORDMARK_SRC}
        alt="DBS AI"
        width={Math.round(height * 5)}
        height={height}
        className={cn("h-full w-auto object-contain", IMG_CLASS)}
        priority
      />
    </span>
  );
}
