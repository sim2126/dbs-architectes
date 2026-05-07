// Friday tabs — horizontal tab strip with sliding active-bar animation.
// Generic; consumers pass tabs and a controlled `active` key.

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FridayTab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: FridayTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = React.useState({ x: 0, w: 0 });

  React.useEffect(() => {
    const el = refs.current[active];
    if (!el || !el.parentElement) return;
    const parent = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setBar({ x: r.left - parent.left, w: r.width });
  }, [active]);

  return (
    <div
      className={cn(
        "relative flex border-b border-friday-border-soft",
        className,
      )}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "py-2 px-3.5 bg-transparent border-0 cursor-pointer text-[12.5px] flex items-center gap-1.5 transition-colors duration-150",
              isActive
                ? "text-friday-fg font-medium"
                : "text-friday-fg-muted hover:text-friday-fg",
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className="font-mono text-[9.5px] text-friday-fg-subtle bg-friday-surface-2 px-1.5 rounded-sm">
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
      <div
        className="absolute -bottom-px h-0.5 bg-friday-accent transition-[left,width] duration-200 ease-out"
        style={{ left: bar.x, width: bar.w }}
      />
    </div>
  );
}
