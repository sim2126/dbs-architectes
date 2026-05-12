// Friday avatar — single circular avatar with initials. Pairs with the
// existing AvatarStack (which composes shadcn Avatars for overlap groups).
// This primitive is the simpler `<Avatar initials="GS" size={28} />` API
// the Claude Design screens consume.

import * as React from "react";
import { cn } from "@/ui/utils";

interface AvatarProps {
  initials: string;
  size?: number;
  imageUrl?: string | null;
  className?: string;
}

export function Avatar({ initials, size = 28, imageUrl, className }: AvatarProps) {
  const dim = `${size}px`;
  const fontSize = Math.max(9, Math.round(size * 0.38));

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 select-none",
        "bg-friday-surface-2 text-friday-fg-muted font-medium",
        className,
      )}
      style={{ width: dim, height: dim, fontSize }}
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
