"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUserPrefs,
} from "@/ui/stores/user-prefs-store";
import { cn } from "@/ui/utils";

/**
 * Drag-to-resize strip on the sidebar's trailing edge.
 *
 * The drag writes to `sidebarDragWidth` on every pointermove, so the panel
 * follows the pointer continuously. The persisted `sidebarWidth` is written
 * once, on pointer-up — that is the expensive one, since it hits
 * localStorage.
 *
 * An earlier version set a CSS variable during the drag that nothing read,
 * and committed the width only at the end. The panel therefore did not move
 * until release, and then animated to the new value, which read as snapping
 * to fixed positions rather than tracking the cursor.
 */
export function SidebarResizeHandle({ disabled }: { disabled?: boolean }) {
  const width = useUserPrefs((s) => s.sidebarWidth);
  const setWidth = useUserPrefs((s) => s.setSidebarWidth);
  const dragWidth = useUserPrefs((s) => s.sidebarDragWidth);
  const setDragWidth = useUserPrefs((s) => s.setSidebarDragWidth);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      // Capture the pointer so the drag survives the cursor leaving the
      // 4px strip — without this a fast drag drops out almost immediately.
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragWidth(width);
      setDragging(true);
    },
    [disabled, width, setDragWidth],
  );

  useEffect(() => {
    if (!dragging) return;

    // The sidebar is pinned to the viewport's left edge, so clientX is the
    // width. Clamping happens in the store.
    const move = (e: PointerEvent) => setDragWidth(e.clientX);

    const up = () => {
      setDragging(false);
      // Commit whatever the live value ended on, then clear it so consumers
      // fall back to the persisted width.
      const finalWidth = useUserPrefs.getState().sidebarDragWidth;
      if (finalWidth !== null) setWidth(finalWidth);
      setDragWidth(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, setWidth, setDragWidth]);

  // Keyboard resizing — a drag handle that only answers a pointer is
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
      aria-valuenow={dragWidth ?? width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      title="Drag to resize"
      className={cn(
        // Wider than it looks: a 1px target is genuinely hard to hit, so the
        // strip is 6px with only a 1px line visible on hover.
        "absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize",
        "after:absolute after:inset-y-0 after:right-0 after:w-px after:transition-colors",
        "hover:after:bg-friday-accent-ring focus-visible:after:bg-friday-accent-ring",
        "focus-visible:outline-none",
        dragging && "after:bg-friday-accent-ring",
      )}
    />
  );
}
