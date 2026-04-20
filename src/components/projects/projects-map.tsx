"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, Globe, Building2, Copy, Check,
  ExternalLink, AlertCircle, Loader2, Navigation,
} from "lucide-react";
import Link from "next/link";
import { PHASE_COLORS } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

export interface MappedProject {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  commune?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  image?: string | null;
  assignments: Array<{ userId: string; user: { name?: string | null; initials?: string | null } }>;
}

// Minimal Google Maps types — avoids @types/google.maps dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;
declare global {
  interface Window { google?: { maps: GMaps } }
}

// Build-time fallback; runtime key is fetched from /api/maps/config so that
// the feature works even when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY wasn't set during
// the Vercel build.
const BUILD_TIME_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// ─── Map View Component ───────────────────────────────────────

export function ProjectsMapView({
  projects,
  canEdit,
  onUpdateLocation,
  focusProjectId,
}: {
  projects: MappedProject[];
  canEdit: boolean;
  onUpdateLocation: (id: string, lat: number, lng: number, address: string) => Promise<void>;
  focusProjectId?: string | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(BUILD_TIME_KEY || null);
  const [keyChecked, setKeyChecked] = useState(!!BUILD_TIME_KEY);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<MappedProject | null>(null);
  const [copied, setCopied] = useState(false);
  // Location setter state (for unpinned projects)
  const [settingLocation, setSettingLocation] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState("");

  const pinned = projects.filter((p) => p.latitude != null && p.longitude != null);
  const unpinned = projects.filter((p) => p.latitude == null || p.longitude == null);

  // ── Fetch API key from server (covers missing build-time env) ───
  useEffect(() => {
    if (apiKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/maps/config");
        const data = (await res.json()) as { apiKey?: string };
        if (!cancelled) setApiKey(data.apiKey ?? "");
      } catch {
        if (!cancelled) setApiKey("");
      } finally {
        if (!cancelled) setKeyChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey]);

  // ── Load Google Maps script ──────────────────────────────────
  useEffect(() => {
    if (!apiKey) return;
    if (window.google?.maps) { setLoaded(true); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-gmaps="1"]');
    if (existing) {
      existing.addEventListener("load", () => setLoaded(true));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.dataset.gmaps = "1";
    s.onload = () => setLoaded(true);
    document.head.appendChild(s);
  }, [apiKey]);

  // ── Build markers ────────────────────────────────────────────
  const buildMarkers = useCallback(() => {
    if (!mapInstance.current || !window.google?.maps) return;
    const gm = window.google.maps;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    pinned.forEach((project) => {
      if (project.latitude == null || project.longitude == null) return;
      const phaseColor = PHASE_COLORS[project.phase] || "#94a3b8";
      const marker = new gm.Marker({
        position: { lat: project.latitude, lng: project.longitude },
        map: mapInstance.current,
        title: project.title,
        icon: {
          path: gm.SymbolPath.CIRCLE,
          fillColor: phaseColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
          scale: 13,
        },
        label: {
          text: project.code.slice(-3),
          color: "#ffffff",
          fontSize: "8px",
          fontWeight: "bold",
        },
      });
      marker.addListener("click", () => {
        setSelected(project);
        setSettingLocation(false);
        setAddressInput(project.address || project.commune || "");
        setGeoError("");
      });
      markersRef.current.push(marker);
    });
  }, [pinned]);

  // ── Init map ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !mapRef.current || !window.google?.maps) return;
    const gm = window.google.maps;

    const map = new gm.Map(mapRef.current, {
      center: { lat: 46.3, lng: 8.9 },
      zoom: 9,
      mapTypeId: "hybrid",
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: gm.MapTypeControlStyle.HORIZONTAL_BAR,
        mapTypeIds: ["roadmap", "satellite", "hybrid", "terrain"],
      },
      fullscreenControl: true,
      streetViewControl: false,
      zoomControl: true,
      tilt: 0,
    });
    mapInstance.current = map;
    map.addListener("click", () => setSelected(null));
  }, [loaded]);

  // ── Markers whenever pinned list changes ─────────────────────
  useEffect(() => {
    if (!loaded) return;
    buildMarkers();
  }, [loaded, buildMarkers]);

  // ── Auto-focus project from URL param ───────────────────────
  useEffect(() => {
    if (!focusProjectId || !mapInstance.current) return;
    const fp = pinned.find((p) => p.id === focusProjectId);
    if (fp?.latitude != null && fp?.longitude != null) {
      mapInstance.current.setCenter({ lat: fp.latitude, lng: fp.longitude });
      mapInstance.current.setZoom(15);
      setSelected(fp);
    }
  }, [focusProjectId, pinned]);

  // ── Copy share link ──────────────────────────────────────────
  const copyLink = (id: string) => {
    const url = `${window.location.origin}/dashboard/projects?view=map&project=${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Open in Google Earth ─────────────────────────────────────
  const openInEarth = (lat: number, lng: number) => {
    window.open(
      `https://earth.google.com/web/@${lat},${lng},0a,800d,35y,0h,0t,0r`,
      "_blank"
    );
  };

  // ── Geocode address → lat/lng (server-side proxy) ───────────
  const geocodeAndSave = async () => {
    if (!addressInput.trim() || !selected) return;
    setGeocoding(true);
    setGeoError("");
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addressInput }),
      });
      const data = await res.json() as { lat?: number; lng?: number; formatted?: string; error?: string };
      if (!res.ok || data.error || data.lat == null) {
        setGeoError("Address not found. Try a more specific location.");
        return;
      }
      await onUpdateLocation(selected.id, data.lat!, data.lng!, data.formatted!);
      if (mapInstance.current) {
        mapInstance.current.setCenter({ lat: data.lat, lng: data.lng });
        mapInstance.current.setZoom(14);
      }
      setSettingLocation(false);
      setSelected({ ...selected, latitude: data.lat, longitude: data.lng, address: data.formatted! });
    } catch {
      setGeoError("Geocoding failed. Please try again.");
    } finally {
      setGeocoding(false);
    }
  };

  // ── Waiting for runtime key check ────────────────────────────
  if (!keyChecked) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── No API key fallback ──────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="text-center max-w-sm p-8 rounded-2xl border border-border bg-card">
          <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-semibold mb-2">Google Maps API key required</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Set{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
              GOOGLE_MAPS_API_KEY
            </code>{" "}
            (or{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>
            ) in your Vercel environment and redeploy.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Enable: Maps JavaScript API · Geocoding API · Places API
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Map canvas */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Loading */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 backdrop-blur-sm z-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Stats chip — top-left */}
      <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-md rounded-xl border border-border px-3 py-2 shadow-lg z-10 pointer-events-none">
        <p className="text-xs font-semibold">{pinned.length} / {projects.length} pinned</p>
        <p className="text-[10px] text-muted-foreground">projects on map</p>
      </div>

      {/* ── Info card for selected project ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 16, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute top-3 right-3 w-[280px] bg-card/96 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden z-20"
          >
            {/* Image / gradient header */}
            <div className="h-28 relative overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900">
              {selected.image ? (
                <img src={selected.image} alt="" className="w-full h-full object-cover opacity-70" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Building2 className="w-10 h-10 text-white/15" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <button
                onClick={() => setSelected(null)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-2 left-3">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: PHASE_COLORS[selected.phase] || "#94a3b8" }}
                >
                  {selected.phase}
                </span>
              </div>
            </div>

            <div className="p-4">
              <p className="text-[10px] font-mono text-muted-foreground">{selected.code}</p>
              <h3 className="text-sm font-semibold mt-0.5 line-clamp-2 leading-snug">
                {selected.title.replace(selected.code + " ", "")}
              </h3>

              {/* Location info */}
              {(selected.commune || selected.address) && (
                <div className="flex items-start gap-1.5 mt-2">
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    {selected.commune && <p className="text-xs text-muted-foreground">{selected.commune}</p>}
                    {selected.address && (
                      <p className="text-[10px] text-muted-foreground/60 line-clamp-1">{selected.address}</p>
                    )}
                  </div>
                </div>
              )}
              {selected.latitude != null && selected.longitude != null && (
                <p className="text-[10px] font-mono text-muted-foreground/50 mt-1">
                  {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </p>
              )}

              {/* ── Location setter (no pin yet) ── */}
              {(selected.latitude == null || selected.longitude == null) && canEdit && (
                <div className="mt-3">
                  {!settingLocation ? (
                    <button
                      onClick={() => {
                        setSettingLocation(true);
                        setAddressInput(selected.commune || "");
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border hover:border-foreground/30 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Set map location
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && geocodeAndSave()}
                        placeholder="Enter address or place name…"
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      />
                      {geoError && <p className="text-[10px] text-red-500">{geoError}</p>}
                      <div className="flex gap-1.5">
                        <button
                          onClick={geocodeAndSave}
                          disabled={geocoding || !addressInput.trim()}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          {geocoding ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                          {geocoding ? "Geocoding…" : "Pin location"}
                        </button>
                        <button
                          onClick={() => { setSettingLocation(false); setGeoError(""); }}
                          className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Action row ── */}
              <div className={cn("flex gap-2", selected.latitude != null ? "mt-4" : "mt-3")}>
                {selected.latitude != null && selected.longitude != null && (
                  <button
                    onClick={() => openInEarth(selected.latitude!, selected.longitude!)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Google Earth
                  </button>
                )}
                <button
                  onClick={() => copyLink(selected.id)}
                  title="Copy share link"
                  className="flex items-center justify-center px-3 py-2 rounded-lg border border-border hover:bg-muted text-xs transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <Link
                  href={`/dashboard/projects/${selected.id}`}
                  title="Open full project page"
                  className="flex items-center justify-center px-3 py-2 rounded-lg border border-border hover:bg-muted text-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unpinned projects strip — bottom ── */}
      {unpinned.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-background/92 backdrop-blur-md border-t border-border px-4 py-3 z-10">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {unpinned.length} project{unpinned.length !== 1 ? "s" : ""} without a location
              {canEdit ? " — click to set" : ""}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {unpinned.map((p) => {
              const color = PHASE_COLORS[p.phase] || "#94a3b8";
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelected(p);
                    setSettingLocation(canEdit);
                    setAddressInput(p.commune || "");
                    setGeoError("");
                  }}
                  className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:border-foreground/30 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[10px] font-mono text-muted-foreground">{p.code}</span>
                  <span className="text-[11px] font-medium max-w-[110px] truncate">
                    {p.title.replace(p.code + " ", "")}
                  </span>
                  {canEdit && <Navigation className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
