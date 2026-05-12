"use client";

// Photorealistic 3D Tiles modal for a single project.
//
// Uses Google Maps' <gmp-map-3d> web component (Map3DElement, v=beta).
// The component is registered when the Maps JS script is loaded with
// `libraries=...,maps3d`. We instantiate it imperatively via the DOM
// because TS+JSX has no first-class type for the custom element yet.
//
// URL-aware: when the modal is open we mirror the camera (tilt /
// heading / range / zoom) into the page query string so a teammate
// who clicks the same link lands on the exact same cinematic view.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Copy, Check, Loader2, X, Maximize2 } from "lucide-react";
import { showToast } from "@/ui/components/toast";

interface Project3DModalProps {
  open: boolean;
  onClose: () => void;
  project: {
    id: string;
    code: string;
    title: string;
    latitude: number;
    longitude: number;
    image?: string | null;
  } | null;
  // Optional camera overrides — when present we open at this exact view
  // (used when a teammate follows a shared link).
  initialTilt?: number;
  initialHeading?: number;
  initialRange?: number;
}

// Defaults tuned for an architecture firm: 67° tilt is the canonical
// "looking up at a building" angle; 35° heading rotates off-axis so the
// viewer doesn't see the boring north-facing face; 250m range is roughly
// "across the street" — close enough to read the facade.
const DEFAULT_TILT = 67;
const DEFAULT_HEADING = 35;
const DEFAULT_RANGE = 250;

export function Project3DModal({
  open,
  onClose,
  project,
  initialTilt = DEFAULT_TILT,
  initialHeading = DEFAULT_HEADING,
  initialRange = DEFAULT_RANGE,
}: Project3DModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapElRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mount Map3DElement when the modal opens
  useEffect(() => {
    if (!open || !project || !containerRef.current) return;
    let cancelled = false;

    const mount = async () => {
      // The Maps JS script must already have loaded with
      // libraries=...,maps3d. Wait for the custom element to be
      // registered, then instantiate.
      try {
        if (typeof customElements === "undefined") {
          throw new Error("customElements not available");
        }
        // Race against a 5s timeout so a misconfigured Cloud project
        // surfaces a friendly fallback rather than a hung modal.
        await Promise.race([
          customElements.whenDefined("gmp-map-3d"),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("gmp-map-3d not registered")), 5000),
          ),
        ]);
        if (cancelled || !containerRef.current) return;

        const el = document.createElement("gmp-map-3d") as HTMLElement;
        el.setAttribute(
          "center",
          `${project.latitude},${project.longitude},${initialRange}`,
        );
        el.setAttribute("tilt", String(initialTilt));
        el.setAttribute("heading", String(initialHeading));
        el.setAttribute("range", String(initialRange));
        // Hybrid (= satellite imagery + labels) reads better for project
        // location than pure satellite without labels.
        el.setAttribute("mode", "hybrid");
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.display = "block";

        // A simple 3D marker pinning the project's exact spot.
        const marker = document.createElement("gmp-marker-3d") as HTMLElement;
        marker.setAttribute("position", `${project.latitude},${project.longitude},2`);
        marker.setAttribute("label", project.code);
        marker.setAttribute("altitude-mode", "relative-to-ground");
        el.appendChild(marker);

        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(el);
        mapElRef.current = el;
        setReady(true);
      } catch (err) {
        console.error("[3d-modal] failed to mount:", err);
        if (!cancelled) setUnsupported(true);
      }
    };

    mount();

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
      mapElRef.current = null;
      setReady(false);
      setUnsupported(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id, initialTilt, initialHeading, initialRange]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const copyShareLink = () => {
    if (!project) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "map");
    url.searchParams.set("project", project.id);
    url.searchParams.set("3d", "1");
    url.searchParams.set("tilt", String(initialTilt));
    url.searchParams.set("heading", String(initialHeading));
    url.searchParams.set("range", String(initialRange));
    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        showToast("3D view link copied — share with your team");
      })
      .catch(() => {
        showToast("Couldn't copy — your browser blocked clipboard access", "warning");
      });
  };

  return (
    <AnimatePresence>
      {open && project && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/70"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border bg-card/95 px-5 py-3 backdrop-blur-md shrink-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {project.code}
                </p>
                <h2 className="truncate text-sm font-semibold">{project.title}</h2>
              </div>
              <span className="hidden rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
                Photorealistic 3D · {project.latitude.toFixed(4)}, {project.longitude.toFixed(4)}
              </span>
              <button
                onClick={copyShareLink}
                title="Copy 3D view link"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Share"}
              </button>
              <button
                onClick={onClose}
                title="Close"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* 3D canvas */}
            <div className="relative flex-1 bg-slate-900">
              <div ref={containerRef} className="absolute inset-0" />
              {!ready && !unsupported && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-xs uppercase tracking-widest opacity-70">
                      Loading photorealistic tiles…
                    </p>
                  </div>
                </div>
              )}
              {unsupported && (
                <div className="absolute inset-0 flex items-center justify-center px-6">
                  <div className="max-w-md rounded-2xl bg-white/95 p-6 text-center shadow-xl">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                      <Maximize2 className="h-5 w-5 text-amber-700" />
                    </div>
                    <h3 className="text-sm font-semibold">3D Tiles aren&apos;t available yet</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      Photorealistic 3D Tiles need <strong>Map Tiles API</strong> enabled
                      on the Google Cloud project that owns this API key. Once enabled,
                      this view loads instantly with no further code changes.
                    </p>
                    <p className="mt-3 text-[11px] text-slate-500">
                      For now, open this project in Google Earth — same camera angle,
                      separate tab.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
