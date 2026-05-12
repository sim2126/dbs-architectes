"use client";

import { cn } from "@/ui/utils";

// ─── Variant config ────────────────────────────────────────────────────────────
// icon     → rounded-square mark only
// wordmark → mark + "ARIA" text inline
// hero     → large display version for the DBS GPT hero card

type Variant = "icon" | "wordmark" | "hero";

interface AiLogoProps {
  variant?: Variant;
  size?: number;       // pixel size of the icon square (default varies by variant)
  className?: string;
}

// ─── The core SVG mark ─────────────────────────────────────────────────────────
// Grid: 64 × 64 viewBox
// Rounded-square container with the brand gradient (#0f172a → #1e3a8a → #155e75)
// Geometric "A" mark in blue → cyan gradient:
//   - Apex:       (32, 11)
//   - Base-left:  (10, 52)
//   - Base-right: (54, 52)
//   - Crossbar y: 35  →  x: (19, 35) … (45, 35)
// Nodes at every structural joint (architecture + neural network reference)

function AiMark({ size = 48 }: { size?: number }) {
  const id = `dbs-ai-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DBS AI"
    >
      <defs>
        {/* Background: exact DBS GPT hero gradient */}
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0f172a" />
          <stop offset="56%"  stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#155e75" />
        </linearGradient>

        {/* Stroke gradient: blue-300 → cyan-400 */}
        <linearGradient id={`${id}-stroke`} x1="10" y1="11" x2="54" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>

        {/* Apex glow (radial) */}
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#bfdbfe" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>

        {/* Drop shadow for depth */}
        <filter id={`${id}-shadow`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* ── Background rounded square ──────────────────────────────────────── */}
      <rect
        width="64" height="64" rx="16"
        fill={`url(#${id}-bg)`}
        filter={`url(#${id}-shadow)`}
      />

      {/* Subtle inner border — 1px white at 6% opacity */}
      <rect
        x="0.5" y="0.5" width="63" height="63" rx="15.5"
        fill="none"
        stroke="white"
        strokeOpacity="0.06"
        strokeWidth="1"
      />

      {/* ── Apex glow halo ──────────────────────────────────────────────────── */}
      <circle cx="32" cy="11" r="10" fill={`url(#${id}-glow)`} />

      {/* ── "A" structural lines ────────────────────────────────────────────── */}

      {/* Left leg: apex (32,11) → base-left (10,52) */}
      <line
        x1="32" y1="11" x2="10" y2="52"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Right leg: apex (32,11) → base-right (54,52) */}
      <line
        x1="32" y1="11" x2="54" y2="52"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Crossbar: (19,35) → (45,35) */}
      <line
        x1="19" y1="35" x2="45" y2="35"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* ── Nodes at structural joints ─────────────────────────────────────── */}

      {/* Apex — primary intelligence node */}
      <circle cx="32" cy="11" r="4.5" fill="#1e3a8a" />
      <circle cx="32" cy="11" r="3"   fill="#60a5fa" />
      <circle cx="32" cy="11" r="1.6" fill="white" />

      {/* Base-left node */}
      <circle cx="10" cy="52" r="2.5" fill="#22d3ee" fillOpacity="0.65" />
      <circle cx="10" cy="52" r="1.2" fill="#22d3ee" fillOpacity="0.9" />

      {/* Base-right node */}
      <circle cx="54" cy="52" r="2.5" fill="#22d3ee" fillOpacity="0.65" />
      <circle cx="54" cy="52" r="1.2" fill="#22d3ee" fillOpacity="0.9" />

      {/* Crossbar-left node */}
      <circle cx="19" cy="35" r="2"   fill="#93c5fd" fillOpacity="0.55" />
      <circle cx="19" cy="35" r="1"   fill="#93c5fd" fillOpacity="0.9" />

      {/* Crossbar-right node */}
      <circle cx="45" cy="35" r="2"   fill="#93c5fd" fillOpacity="0.55" />
      <circle cx="45" cy="35" r="1"   fill="#93c5fd" fillOpacity="0.9" />
    </svg>
  );
}

// ─── Public component ──────────────────────────────────────────────────────────

export function AiLogo({ variant = "icon", size, className }: AiLogoProps) {
  // ── Icon only ──────────────────────────────────────────────────────────────
  if (variant === "icon") {
    return (
      <div className={cn("shrink-0", className)}>
        <AiMark size={size ?? 40} />
      </div>
    );
  }

  // ── Wordmark (horizontal lockup) ───────────────────────────────────────────
  if (variant === "wordmark") {
    const iconSize = size ?? 36;
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <AiMark size={iconSize} />
        <div className="flex flex-col justify-center leading-none">
          <span
            className="font-semibold tracking-[0.18em] text-foreground uppercase"
            style={{ fontSize: iconSize * 0.42 }}
          >
            ARIA
          </span>
          <span
            className="text-muted-foreground tracking-widest uppercase mt-0.5"
            style={{ fontSize: iconSize * 0.24 }}
          >
            by Friday.com
          </span>
        </div>
      </div>
    );
  }

  // ── Hero (large display — for the DBS GPT hero card) ──────────────────────
  if (variant === "hero") {
    const iconSize = size ?? 64;
    return (
      <div className={cn("flex items-center gap-4", className)}>
        <AiMark size={iconSize} />
        <div className="flex flex-col justify-center leading-none">
          <span
            className="font-bold tracking-[0.22em] uppercase text-white"
            style={{ fontSize: iconSize * 0.38 }}
          >
            ARIA
          </span>
          <span
            className="tracking-widest uppercase text-white/50 mt-1"
            style={{ fontSize: iconSize * 0.2 }}
          >
            Project Intelligence
          </span>
        </div>
      </div>
    );
  }

  return null;
}
