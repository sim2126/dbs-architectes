// Friday avatar stack — overlapping member avatars with a "+N" chip when
// the team is bigger than `max`. Wraps the existing shadcn Avatar so we
// inherit the radix fallback behaviour. Initials are computed from the
// name when no image is supplied.

import * as React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface StackedUser {
  id: string | number;
  name: string;
  imageUrl?: string | null;
}

interface AvatarStackProps {
  users: StackedUser[];
  max?: number;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AvatarStack({
  users,
  max = 4,
  size = 28,
  className,
}: AvatarStackProps) {
  const visible = users.slice(0, max);
  const overflow = Math.max(0, users.length - visible.length);
  const dim = `${size}px`;
  const overlap = Math.round(size * 0.32);

  return (
    <div className={cn("inline-flex items-center", className)}>
      {visible.map((u, i) => (
        <Avatar
          key={u.id}
          className="ring-2 ring-friday-surface"
          style={{
            width: dim,
            height: dim,
            marginLeft: i === 0 ? 0 : -overlap,
            zIndex: visible.length - i,
          }}
        >
          {u.imageUrl ? <AvatarImage src={u.imageUrl} alt={u.name} /> : null}
          <AvatarFallback className="text-[10px]">
            {initials(u.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 ? (
        <span
          className="ring-2 ring-friday-surface inline-flex items-center justify-center rounded-full bg-friday-surface-2 text-friday-fg-muted text-[10px] font-semibold"
          style={{
            width: dim,
            height: dim,
            marginLeft: -overlap,
            zIndex: 0,
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
