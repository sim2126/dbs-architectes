"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts from a start value to a target when scrolled into view.
 *
 * Three things this gets right that a naive setInterval does not:
 *
 *   1. It starts on visibility, via IntersectionObserver, not on mount. A
 *      counter that has already finished by the time you scroll to it has
 *      animated for nobody.
 *   2. It runs once. Re-counting every time the element re-enters the
 *      viewport is the standard irritation of this pattern.
 *   3. Under prefers-reduced-motion it renders the final value immediately.
 *      Reduced motion means no animation — it does not mean no information,
 *      so the number must still be there.
 *
 * Driven by requestAnimationFrame against elapsed time rather than a fixed
 * per-frame step, so the duration holds on a slow frame instead of the
 * count running long.
 */
export function CountUp({
  to,
  from = 0,
  durationMs = 1400,
  suffix = "",
  className,
}: {
  to: number;
  from?: number;
  durationMs?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(from);
  const hasRun = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || hasRun.current) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      hasRun.current = true;
      setValue(to);
      return;
    }

    let frame = 0;
    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        // Ease-out cubic: fast start, settles rather than stopping dead.
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(from + (to - from) * eased));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || hasRun.current) continue;
          hasRun.current = true;
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [from, to, durationMs]);

  return (
    <span ref={ref} className={className}>
      {/*
       * aria-hidden on the animating text with the settled value exposed
       * separately: a screen reader announcing every intermediate number
       * would be unusable.
       */}
      <span aria-hidden className="tabular-nums">
        {value}
        {suffix}
      </span>
      <span className="sr-only">
        {to}
        {suffix}
      </span>
    </span>
  );
}
