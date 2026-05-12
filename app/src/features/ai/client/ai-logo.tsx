"use client";

/**
 * DBS AI logo.
 *
 * Two PNG sources at the public root — you save these from the Grok
 * output yourself:
 *
 *   /public/dbs-ai-wordmark.png   — hexagonal mark + "DBS AI" wordmark
 *   /public/dbs-ai-mark.png       — cursive lowercase "d" only
 *
 * Variants:
 *   mark      → just the cursive "d" (in-chat avatar, small)
 *   wordmark  → mark + wordmark (top header)
 *   hero      → large wordmark (empty state / scheduled break)
 *
 * Background handling. The PNGs ship with a near-white background. To
 * avoid asking you to do image editing, we blend them into the page
 * surface via CSS:
 *   - Light mode: mix-blend-mode: multiply → white blends into the
 *     cream Friday background; the dark ink stays.
 *   - Dark mode: filter: invert(1) flips the colours, mix-blend-mode:
 *     screen drops the (now-black) background into the dark page.
 *
 * If you replace the PNGs with proper transparent versions later, the
 * blend modes become harmless no-ops.
 */

import Image from "next/image";
import { cn } from "@/ui/utils";

type Variant = "mark" | "wordmark" | "hero";

interface AiLogoProps {
  variant?: Variant;
  size?: number;
  className?: string;
}

const WORDMARK_SRC = "/dbs-ai-wordmark.png";
const MARK_SRC = "/dbs-ai-mark.png";

const blendClass =
  "[mix-blend-mode:multiply] dark:[mix-blend-mode:screen] dark:[filter:invert(1)_brightness(0.95)]";

export function AiLogo({ variant = "mark", size, className }: AiLogoProps) {
  if (variant === "mark") {
    const px = size ?? 36;
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
          className={cn("h-full w-full object-contain", blendClass)}
          priority
        />
      </span>
    );
  }

  if (variant === "wordmark") {
    const height = size ?? 28;
    return (
      <span
        className={cn("inline-flex shrink-0 items-center", className)}
        style={{ height }}
      >
        <Image
          src={WORDMARK_SRC}
          alt="DBS AI"
          width={height * 5}
          height={height}
          className={cn("h-full w-auto object-contain", blendClass)}
          priority
        />
      </span>
    );
  }

  // hero — larger wordmark for empty states / break card
  const height = size ?? 48;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      style={{ height }}
    >
      <Image
        src={WORDMARK_SRC}
        alt="DBS AI"
        width={height * 5}
        height={height}
        className={cn("h-full w-auto object-contain", blendClass)}
        priority
      />
    </span>
  );
}
