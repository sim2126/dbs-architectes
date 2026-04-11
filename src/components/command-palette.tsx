"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FolderOpen, Calendar, BarChart3, MessageSquare,
  Video, BookUser, Activity, Sparkles, Image, FileSearch, Users,
  Building2, Search, X, ArrowRight, Command,
} from "lucide-react";
import { useT } from "@/lib/translations";

interface Project { id: string; code: string; title: string; phase: string }

const NAV_ITEMS = [
  { label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "nav.projects", href: "/dashboard/projects", icon: FolderOpen },
  { label: "nav.agenda", href: "/dashboard/agenda", icon: Calendar },
  { label: "nav.statistics", href: "/dashboard/statistics", icon: BarChart3 },
  { label: "nav.users", href: "/dashboard/users", icon: Users },
  { label: "nav.chat", href: "/dashboard/chat", icon: MessageSquare },
  { label: "nav.calls", href: "/dashboard/calls", icon: Video },
  { label: "nav.contacts", href: "/dashboard/contact", icon: BookUser },
  { label: "nav.activity", href: "/dashboard/activity", icon: Activity },
];

const AI_ITEMS = [
  { label: "nav.ai_gpt", href: "/dashboard/ai/gpt", icon: Sparkles },
  { label: "nav.ai_gallery", href: "/dashboard/ai/gallery", icon: Image },
  { label: "nav.ai_planning", href: "/dashboard/ai/planning", icon: FileSearch },
];

interface ResultItem {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ElementType;
  group: string;
}

export function CommandPalette() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Open/close hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "Escape" && open) {
        e.preventDefault();
        if (e.key === "Escape") { setOpen(false); return; }
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelected(0);
      if (projects.length === 0) {
        fetch("/api/projects")
          .then((r) => r.json())
          .then((data) => { if (Array.isArray(data)) setProjects(data.slice(0, 40)); });
      }
    }
  }, [open, projects.length]);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  // Build filtered results
  const q = query.toLowerCase().trim();
  const navResults: ResultItem[] = NAV_ITEMS
    .filter((i) => !q || t(i.label).toLowerCase().includes(q))
    .map((i) => ({ id: i.href, label: t(i.label), href: i.href, icon: i.icon, group: t("search.navigate") }));

  const aiResults: ResultItem[] = AI_ITEMS
    .filter((i) => !q || t(i.label).toLowerCase().includes(q))
    .map((i) => ({ id: i.href, label: t(i.label), href: i.href, icon: i.icon, group: t("search.ai_tools") }));

  const projectResults: ResultItem[] = projects
    .filter((p) => !q || p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || p.phase.toLowerCase().includes(q))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      label: p.title.replace(p.code + " ", ""),
      sublabel: `${p.code} · ${p.phase}`,
      href: `/dashboard/projects/${p.id}`,
      icon: Building2,
      group: t("search.projects_label"),
    }));

  const allResults = [...navResults, ...aiResults, ...projectResults];

  // Group results
  const groups = Array.from(new Set(allResults.map((r) => r.group)));

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, allResults.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && allResults[selected]) navigate(allResults[selected].href);
  };

  // Expose open trigger globally
  useEffect(() => {
    (window as typeof window & { openCommandPalette?: () => void }).openCommandPalette = () => setOpen(true);
    return () => { delete (window as typeof window & { openCommandPalette?: () => void }).openCommandPalette; };
  }, []);

  let globalIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]" onKeyDown={handleKeyDown}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />

          {/* Palette panel — pinned to top center */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[72px] w-[560px] max-w-[calc(100vw-2rem)]">
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                  placeholder={t("search.placeholder")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                  Esc
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[380px] overflow-y-auto">
                {allResults.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {t("common.no_results")}
                  </div>
                ) : (
                  groups.map((group) => {
                    const items = allResults.filter((r) => r.group === group);
                    return (
                      <div key={group}>
                        <div className="px-4 pt-3 pb-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                            {group}
                          </span>
                        </div>
                        {items.map((item) => {
                          globalIndex++;
                          const idx = globalIndex;
                          const isSelected = selected === idx;
                          return (
                            <button
                              key={item.id}
                              onClick={() => navigate(item.href)}
                              onMouseEnter={() => setSelected(idx)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isSelected ? "bg-accent" : "hover:bg-accent/50"
                              }`}
                            >
                              <div className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${
                                isSelected ? "bg-foreground/10" : "bg-muted"
                              }`}>
                                <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{item.label}</div>
                                {item.sublabel && (
                                  <div className="text-[10px] text-muted-foreground font-mono">{item.sublabel}</div>
                                )}
                              </div>
                              {isSelected && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/30">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[9px]">↑↓</kbd>
                  navigate
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[9px]">↵</kbd>
                  open
                </div>
                <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Command className="w-3 h-3" />
                  <span>K</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
