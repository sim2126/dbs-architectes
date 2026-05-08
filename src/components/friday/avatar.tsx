// Friday avatar — single circular avatar with initials.
//
//   <Avatar initials="GS" size={28} />                 // default
//   <Avatar initials="GS" size={28} tone="accent" />   // architect-blue tint
//   <Avatar initials="GS" size={28} ring />            // accent ring (current user)
//   <Avatar initials="GS" size={28} imageUrl="…" />    // photo
//
// Pairs with AvatarStack for overlap groups.

import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  initials: string;
  size?: number;
  imageUrl?: string | null;
  tone?: "default" | "accent";
  ring?: boolean;
  className?: string;
}

export function Avatar({
  initials,
  size = 28,
  imageUrl,
  tone = "default",
  ring,
  className,
}: AvatarProps) {
  const dim = `${size}px`;
  const fontSize = Math.max(9, Math.round(size * 0.4));

  const toneClass =
    tone === "accent"
      ? "bg-friday-accent-soft text-friday-accent"
      : "bg-friday-surface-2 text-friday-fg-muted";

  const borderColor =
    tone === "accent"
      ? "rgba(30,58,138,0.15)"
      : "var(--friday-border)";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 select-none border font-medium",
        toneClass,
        className,
      )}
      style={{
        width: dim,
        height: dim,
        fontSize,
        borderColor,
        boxShadow: ring
          ? "0 0 0 2px var(--friday-bg), 0 0 0 3px var(--friday-accent)"
          : undefined,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={initials} className="w-full h-full object-cover" />
      ) : (
        initials.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
