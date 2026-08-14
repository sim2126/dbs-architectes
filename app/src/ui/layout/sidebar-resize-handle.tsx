"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUserPrefs,
} from "@/ui/stores/user-prefs-store";
import { cn } from "@/ui/utils";

/**
 * Drag-to-resize strip on the sidebar's trailing edge.
 *
 * Width is committed to the persisted store only on pointer-up. Writing on
 * every pointermove would put a localStorage write on every frame of the
 * drag; the live width is held locally and handed over once.
 */
export function SidebarResizeHandle({ disabled }: { disabled?: boolean }) {
  const width = useUserPrefs((s) => s.sidebarWidth);
  const setWidth = useUserPrefs((s) => s.setSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const liveWidth = useRef(width);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      setDragging(true);
      liveWidth.current = width;
    },
    [disabled, width],
  );

  useEffect(() => {
    if (!dragging) return;

    const move = (e: PointerEvent) => {
      // The sidebar is pinned to the viewport's left edge, so the pointer's
      // clientX is the width. Clamped here for the live CSS variable; the
      // store clamps again on commit.
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, e.clientX),
      );
      liveWidth.current = next;
      document.documentElement.style.setProperty("--sidebar-w", `${next}px`);
    };

    const up = () => {
      setDragging(false);
      setWidth(liveWidth.current);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // Stop text selection and cursor flicker across the whole page mid-drag.
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, setWidth]);

  // Keyboard resizing — a drag handle that only responds to a pointer is
  // unreachable for keyboard users.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const STEP = 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth(width - STEP);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth(width + STEP);
    }
  };

  if (disabled) return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      title="Drag to resize"
      className={cn(
        "absolute inset-y-0 right-0 z-30 w-1 cursor-col-resize",
        "hover:bg-friday-accent-ring focus-visible:bg-friday-accent-ring",
        "focus-visible:outline-none transition-colors",
        dragging && "bg-friday-accent-ring",
      )}
    />
  );
}
