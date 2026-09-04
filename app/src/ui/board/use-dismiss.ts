"use client";

import { useEffect, useRef } from "react";

/**
 * Close on an outside click or on Escape.
 *
 * Every popover on a board needs both, and a popover that closes on one but
 * not the other is the kind of thing nobody reports and everybody notices.
 */
export function useDismiss<T extends HTMLElement>(close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);
  return ref;
}
