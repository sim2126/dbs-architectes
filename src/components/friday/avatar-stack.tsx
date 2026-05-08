// Friday avatar stack — overlapping member avatars with a "+N" chip
// when the team is bigger than `max`.
//
// Two API shapes supported (because Claude Design's screens use the
// short shape and our own data passes the long shape):
//
//   <AvatarStack members={['LD','GS','FS']} extra={2} max={3} />
//   <AvatarStack initials={['LD','GS','FS']} extra={2} max={3} />
//   <AvatarStack users={[{id, name, imageUrl}]} max={4} />          // existing
//
// Initials are derived from `name` when `users` is supplied.

import * as React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface StackedUser {
  id: string | number;
  name: string;
  imageUrl?: string | null;
}

interface AvatarStackProps {
  /** Long form — full user objects with imageUrl support. */
  users?: StackedUser[];
  /** Short form — initials strings (Claude Design shape). */
  members?: string[];
  /** Alias for `members`. */
  initials?: string[];
  /** When `members` is used, how many additional members are hidden. */
  extra?: number;
  max?: number;
  size?: number;
  className?: string;
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AvatarStack({
  users,
  members,
  initials,
  extra = 0,
  max = 4,
  size = 24,
  className,
}: AvatarStackProps) {
  const dim = `${size}px`;
  const overlap = Math.round(size * 0.32);
  const fontSize = Math.max(9, Math.round(size * 0.42));

  // Decide which shape we're rendering with.
  const initialList = (members ?? initials) ?? null;

  if (initialList) {
    const visible = initialList.slice(0, max);
    const overflow = extra + Math.max(0, initialList.length - visible.length);
    return (
      <div className={cn("inline-flex items-center", className)}>
        {visible.map((m, i) => (
          <span
            key={`${m}-${i}`}
            className="inline-flex items-center justify-center rounded-full bg-friday-surface-2 text-friday-fg font-medium ring-2 ring-friday-surface"
            style={{
              width: dim,
              height: dim,
              fontSize,
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: visible.length - i,
            }}
          >
            {m}
          </span>
        ))}
        {overflow > 0 ? (
          <span
            className="inline-flex items-center justify-center rounded-full bg-transparent text-friday-fg-muted font-mono font-medium"
            style={{
              width: dim,
              height: dim,
              fontSize,
              marginLeft: -overlap,
              zIndex: 0,
              border: "1px dashed var(--friday-border)",
            }}
          >
            +{overflow}
          </span>
        ) : null}
      </div>
    );
  }

  // Long form fallback — full user objects via shadcn Avatar.
  const list = users ?? [];
  const visible = list.slice(0, max);
  const overflow = Math.max(0, list.length - visible.length);

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
            {nameInitials(u.name)}
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
