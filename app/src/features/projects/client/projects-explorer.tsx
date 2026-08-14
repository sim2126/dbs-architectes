"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Grid, ChevronDown, X, Building2, ExternalLink,
  Check, GripVertical, ChevronRight, Users,
  MapPin, Tag, CreditCard, FileText, Clock, ArrowUpRight,
  Circle, Loader2, MessageSquare, MoreHorizontal, Trash2,
  Globe, Navigation,
} from "lucide-react";
import { ProjectsMapView } from "@/features/projects/client/projects-map";
import Link from "next/link";
import { Button } from "@/ui/components/button";
import { Input } from "@/ui/components/input";
import { Avatar, AvatarFallback } from "@/ui/components/avatar";
import { Badge } from "@/ui/components/badge";
import { AddProjectModal } from "@/features/projects/client/add-project-modal";
import { FavoriteStar } from "@/ui/components/favorite-star";
import { showToast } from "@/ui/components/toast";
import { CATEGORIES, PHASES, TYPOLOGIES, TERRAINS, ROOFS, COUNTRIES, OPERATING_REGIONS } from "@/ui/utils";
import { cn } from "@/ui/utils";
import { getPhaseColor, getStatusColor } from "@/ui/tokens";
import { formatDistanceToNow } from "date-fns";
import { useT, translatePhase } from "@/i18n/translations";
import { useUserPrefs } from "@/ui/stores/user-prefs-store";
import {
  projectMatchesPageQuery,
  type ProjectPageQuery,
} from "@/features/projects/domain/project-page-query";

// ─── Types ────────────────────────────────────────────────────
interface Project {
  id: string;
  code: string;
  title: string;
  category: string;
  phase: string;
  client?: string | null;
  year?: number | null;
  commune?: string | null;
  typology?: string | null;
  terrain?: string | null;
  roof?: string | null;
  description?: string | null;
  image?: string | null;
  status: string;
  workStatus: string;
  billing?: string | null;
  notes?: string | null;
  country?: string | null;
  operatingRegion?: string | null;
  regionCode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  updatedAt: string;
  assignments: Array<{
    userId: string;
    role?: string | null;
    user: { id: string; name?: string | null; initials?: string | null; image?: string | null };
  }>;
}

interface User {
  id: string;
  name?: string | null;
  initials?: string | null;
  email: string;
  role: string;
}

interface ProjectsClientProps {
  initialProjects: Project[];
  users: User[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
  currentUserId: string;
  initialQuery: ProjectPageQuery;
}

// ─── Work Status Config — monday.com palette ─────────────────
// Solid full-bleed colors, white text (just like monday.com)
const WORK_STATUS = {
  todo:      { tKey: "status.not_started" },
  doing:     { tKey: "status.working_on_it" },
  stuck:     { tKey: "status.stuck" },
  completed: { tKey: "status.done" },
} as const;

type WorkStatusKey = keyof typeof WORK_STATUS;
const WORK_STATUS_KEYS = Object.keys(WORK_STATUS) as WorkStatusKey[];

const PHASE_ORDER = [...PHASES];

// ─── Main Component ───────────────────────────────────────────
export function ProjectsExplorer({ initialProjects, users, permissions, currentUserId, initialQuery }: ProjectsClientProps) {
  const t = useT();
  const [projects, setProjects] = useState(initialProjects);
  const { projectsView: view, setProjectsView: setView } = useUserPrefs();
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<string>>(new Set());
  const [pageQuery, setPageQuery] = useState(initialQuery);

  useEffect(() => {
    setPageQuery(initialQuery);
  }, [initialQuery]);

  // Hydrate the user's favourite-project ids once on mount, then refresh
  // whenever a star is toggled anywhere in the app.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/favorites?type=project");
        if (!res.ok) return;
        const list = (await res.json()) as Array<{ entityId: string }>;
        if (cancelled) return;
        setFavoriteProjectIds(new Set(list.map((f) => f.entityId)));
      } catch {
        /* sidebar still works without this */
      }
    };
    refresh();
    const handler = () => refresh();
    window.addEventListener("favorites:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("favorites:changed", handler);
    };
  }, []);

  // Read ?view=map&project=<id> from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "map") {
      setView("map");
      const pid = params.get("project");
      if (pid) setFocusProjectId(pid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filters, setFilters] = useState({
    phases: [] as string[],
    categories: [] as string[],
    typologies: [] as string[],
    terrains: [] as string[],
    roofs: [] as string[],
    countries: [] as string[],
    client: "all",
    year: "all",
    commune: "all",
    region: "all",
  });

  const clients = Array.from(new Set(projects.map((p) => p.client).filter(Boolean)));
  const years = Array.from(new Set(projects.map((p) => p.year).filter(Boolean))).sort((a, b) => (b || 0) - (a || 0));
  const communes = Array.from(new Set(projects.map((p) => p.commune).filter(Boolean))).sort();

  // Available regions based on selected countries (for sub-region filter)
  const availableRegions = filters.countries.length > 0
    ? filters.countries.flatMap((c) => OPERATING_REGIONS[c] ?? [])
    : Object.values(OPERATING_REGIONS).flat();

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || p.title.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.client || "").toLowerCase().includes(q) || (p.commune || "").toLowerCase().includes(q);
    const matchesCategory = filters.categories.length === 0 || filters.categories.includes(p.category);
    const matchesPhase = filters.phases.length === 0 || filters.phases.includes(p.phase);
    const matchesClient = filters.client === "all" || p.client === filters.client;
    const matchesYear = filters.year === "all" || String(p.year) === filters.year;
    const matchesCommune = filters.commune === "all" || p.commune === filters.commune;
    const matchesCountry = filters.countries.length === 0 || (p.country != null && filters.countries.includes(p.country));
    const matchesRegion = filters.region === "all" || p.operatingRegion === filters.region;
    const matchesPageQuery = projectMatchesPageQuery(p, pageQuery, currentUserId);
    return matchesSearch && matchesCategory && matchesPhase && matchesClient && matchesYear && matchesCommune && matchesCountry && matchesRegion && matchesPageQuery;
  });

  const hasActiveFilters = filters.phases.length > 0 || filters.categories.length > 0 || filters.countries.length > 0 || filters.client !== "all" || filters.year !== "all" || filters.commune !== "all" || filters.region !== "all" || !!searchQuery || pageQuery.status !== undefined || pageQuery.scope !== undefined;

  const toggleFilter = (key: keyof typeof filters, value: string) => {
    if (Array.isArray(filters[key])) {
      const arr = filters[key] as string[];
      setFilters({ ...filters, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] });
    }
  };

  const clearFilters = () => {
    setFilters({ phases: [], categories: [], typologies: [], terrains: [], roofs: [], countries: [], client: "all", year: "all", commune: "all", region: "all" });
    setSearchQuery("");
    setPageQuery({});
    const url = new URL(window.location.href);
    url.searchParams.delete("status");
    url.searchParams.delete("scope");
    window.history.replaceState(null, "", url);
  };

  const updateProject = useCallback((updated: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    if (selectedProject?.id === updated.id) setSelectedProject((p) => p ? { ...p, ...updated } : p);
  }, [selectedProject?.id]);

  const toggleGroup = (phase: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  };

  // Group projects by phase for table view
  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    color: getPhaseColor(phase),
    projects: filteredProjects.filter((p) => p.phase === phase),
  })).filter((g) => g.projects.length > 0);

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="border-b border-border bg-background/95 backdrop-blur-sm z-10">
          {/* Row 1: search + view toggles + count + add */}
          <div className="flex items-center gap-2 px-5 py-2.5">
            <div className="relative w-52 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder={t("projects.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>

            <span className="text-xs text-muted-foreground shrink-0 ml-auto">{filteredProjects.length} {t("projects.count")}</span>

            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={() => setView("table")} className={cn("p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors", view === "table" && "bg-accent text-foreground")} title="Table">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="0.5" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="0.5" fill="currentColor"/><rect x="1" y="11" width="14" height="2" rx="0.5" fill="currentColor"/></svg>
              </button>
              <button onClick={() => setView("grid")} className={cn("p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors", view === "grid" && "bg-accent text-foreground")} title="Grid">
                <Grid className="w-4 h-4" />
              </button>
              <button onClick={() => setView("map")} className={cn("p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors", view === "map" && "bg-accent text-foreground")} title="Map">
                <Globe className="w-4 h-4" />
              </button>
            </div>

            {permissions.canCreate && (
              <Button onClick={() => setAddModalOpen(true)} size="sm" className="h-8 shrink-0">
                <Plus className="w-3.5 h-3.5" /> {t("projects.add")}
              </Button>
            )}
          </div>

          {/* Row 2: filter chips — scrollable, never wraps */}
          <div className="flex items-center gap-1.5 px-5 pb-2.5 overflow-x-auto scrollbar-none">
            <FilterPopover label={t("projects.filter.phase")} options={PHASES.map((p) => ({ value: p, label: p, color: getPhaseColor(p) }))} selected={filters.phases} onToggle={(v) => toggleFilter("phases", v)} />
            <FilterPopover label={t("projects.filter.category")} options={CATEGORIES.map((c) => ({ value: c, label: c }))} selected={filters.categories} onToggle={(v) => toggleFilter("categories", v)} />
            <FilterPopover
              label="Country"
              options={COUNTRIES.map((c) => ({ value: c.value, label: `${c.flag} ${c.label}` }))}
              selected={filters.countries}
              onToggle={(v) => toggleFilter("countries", v)}
            />
            {filters.countries.length > 0 && (
              <FilterSelect
                label="Region"
                value={filters.region}
                options={availableRegions.map((r) => ({ value: r.value, label: r.label }))}
                onChange={(v) => setFilters({ ...filters, region: v })}
              />
            )}
            <FilterSelect label={t("projects.filter.client")} value={filters.client} options={clients.map((c) => ({ value: c!, label: c! }))} onChange={(v) => setFilters({ ...filters, client: v })} />
            <FilterSelect label={t("projects.filter.commune")} value={filters.commune} options={communes.map((c) => ({ value: c!, label: c! }))} onChange={(v) => setFilters({ ...filters, commune: v })} />
            <FilterSelect label={t("projects.filter.year")} value={filters.year} options={years.map((y) => ({ value: String(y), label: String(y) }))} onChange={(v) => setFilters({ ...filters, year: v })} />
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0 ml-1 whitespace-nowrap">
                <X className="w-3 h-3" /> {t("common.clear")}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {view === "table" && (
            <TableView
              grouped={grouped}
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleGroup}
              onSelectProject={setSelectedProject}
              selectedProjectId={selectedProject?.id}
              onUpdate={updateProject}
              onDelete={(id) => { setProjects((p) => p.filter((x) => x.id !== id)); if (selectedProject?.id === id) setSelectedProject(null); }}
              canEdit={permissions.canEdit}
              canDelete={permissions.canDelete}
              currentUserId={currentUserId}
            />
          )}
          {view === "grid" && (
            <div className={cn(
              "p-5 grid gap-4",
              selectedProject
                ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            )}>
              <AnimatePresence mode="popLayout">
                {filteredProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} onSelect={() => setSelectedProject(project)} isSelected={selectedProject?.id === project.id} starred={favoriteProjectIds.has(project.id)} />
                ))}
              </AnimatePresence>
              {filteredProjects.length === 0 && <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />}
            </div>
          )}
          {view === "map" && (
            <ProjectsMapView
              projects={filteredProjects}
              canEdit={permissions.canEdit}
              focusProjectId={focusProjectId}
              onUpdateLocation={async (id, lat, lng, address) => {
                await fetch(`/api/projects/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ latitude: lat, longitude: lng, address }),
                });
                updateProject({ id, latitude: lat, longitude: lng, address });
              }}
            />
          )}
        </div>
      </div>

      {/* ── Slide-over detail panel ── */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectDrawer
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
            onUpdate={updateProject}
            canEdit={permissions.canEdit}
            currentUserId={currentUserId}
          />
        )}
      </AnimatePresence>

      <AddProjectModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        users={users}
        onSuccess={(project) => { setProjects([project as unknown as Project, ...projects]); setAddModalOpen(false); }}
      />
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────
function TableView({
  grouped, collapsedGroups, onToggleGroup, onSelectProject,
  selectedProjectId, onUpdate, onDelete, canEdit, canDelete, currentUserId,
}: {
  grouped: { phase: string; color: string; projects: Project[] }[];
  collapsedGroups: Set<string>;
  onToggleGroup: (phase: string) => void;
  onSelectProject: (p: Project) => void;
  selectedProjectId?: string;
  onUpdate: (p: Partial<Project>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
  currentUserId: string;
}) {
  const t = useT();
  const tp = (phase: string) => translatePhase(phase, t);
  return (
    <div className="min-w-[800px]">
      {/* Column headers */}
      <div className="sticky top-0 z-10 bg-background border-b border-border grid grid-cols-[24px_1fr_120px_130px_110px_100px_90px_70px] gap-0 px-4 py-2">
        <div />
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.col.project")}</div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.col.assignees")}</div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.col.status")}</div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.col.phase")}</div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.col.category")}</div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.col.billing")}</div>
        <div />
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t("projects.no_results")}</p>
        </div>
      ) : (
        grouped.map(({ phase, color, projects }) => {
          const isCollapsed = collapsedGroups.has(phase);
          return (
            <div key={phase}>
              {/* Group header */}
              <div
                className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onToggleGroup(phase)}
              >
                <div className="w-1 h-4 rounded-full shrink-0" style={{ background: color }} />
                <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} />
                <span className="text-xs font-semibold">{tp(phase)}</span>
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium">{projects.length}</span>
              </div>

              {/* Rows */}
              <AnimatePresence>
                {!isCollapsed && projects.map((project) => (
                  <TableRow
                    key={project.id}
                    project={project}
                    phaseColor={color}
                    isSelected={selectedProjectId === project.id}
                    onSelect={() => onSelectProject(project)}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    currentUserId={currentUserId}
                  />
                ))}
              </AnimatePresence>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────
function TableRow({ project, phaseColor, isSelected, onSelect, onUpdate, onDelete, canEdit, canDelete, currentUserId }: {
  project: Project; phaseColor: string; isSelected: boolean;
  onSelect: () => void; onUpdate: (p: Partial<Project>) => void;
  onDelete: (id: string) => void; canEdit: boolean; canDelete: boolean; currentUserId: string;
}) {
  const t = useT();
  const [showActions, setShowActions] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [statusCoords, setStatusCoords] = useState({ top: 0, left: 0 });
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const wsKey = (project.workStatus as WorkStatusKey) in WORK_STATUS ? project.workStatus as WorkStatusKey : "todo";
  const ws = WORK_STATUS[wsKey];
  const wsColor = getStatusColor(wsKey);

  const isAssignee = project.assignments.some((a) => a.userId === currentUserId);
  const canUpdateStatus = canEdit || isAssignee;

  useEffect(() => {
    if (!showStatusMenu) return;
    function close(e: MouseEvent) {
      const t = e.target as Node;
      if (statusTriggerRef.current?.contains(t)) return;
      if (statusDropdownRef.current?.contains(t)) return;
      setShowStatusMenu(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showStatusMenu]);

  const updateStatus = async (workStatus: WorkStatusKey) => {
    setShowStatusMenu(false);
    setUpdatingStatus(true);
    onUpdate({ id: project.id, workStatus });
    await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workStatus }) });
    setUpdatingStatus(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "group grid grid-cols-[24px_1fr_120px_130px_110px_100px_90px_70px] gap-0 px-4 py-0 border-b border-border/60 hover:bg-muted/20 transition-colors cursor-pointer items-center",
        isSelected && "bg-blue-50/60 dark:bg-blue-900/10 hover:bg-blue-50/80 dark:hover:bg-blue-900/20"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={onSelect}
    >
      {/* Left color bar */}
      <div className="flex items-center justify-center py-3">
        <div className="w-0.5 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: phaseColor }} />
      </div>

      {/* Project name */}
      <div className="py-2.5 pr-3 min-w-0">
        <div className="flex items-center gap-2">
          {project.image ? (
            <img src={project.image} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
              <Building2 className="w-3 h-3 text-muted-foreground/50" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{project.title.replace(project.code + " ", "")}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
          </div>
        </div>
      </div>

      {/* Assignees */}
      <div className="py-2.5 pr-3">
        {project.assignments.length > 0 ? (
          <div className="flex -space-x-1.5">
            {project.assignments.slice(0, 4).map((a) => (
              <Avatar key={a.userId} className="h-6 w-6 border-2 border-background">
                <AvatarFallback className="text-[8px] font-bold bg-foreground text-background">
                  {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "??"}
                </AvatarFallback>
              </Avatar>
            ))}
            {project.assignments.length > 4 && (
              <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                +{project.assignments.length - 4}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Work Status */}
      <div className="py-2.5 pr-3">
        {/* Full-color status block — monday.com style */}
        <button
          ref={statusTriggerRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!canUpdateStatus) return;
            if (!showStatusMenu && statusTriggerRef.current) {
              const r = statusTriggerRef.current.getBoundingClientRect();
              setStatusCoords({ top: r.bottom + 2, left: r.left });
            }
            setShowStatusMenu((v) => !v);
          }}
          className={cn(
            "flex items-center justify-center w-full px-2 py-1 rounded text-[11px] font-bold text-white transition-all",
            canUpdateStatus && "hover:opacity-90 cursor-pointer",
            !canUpdateStatus && "cursor-default"
          )}
          style={{ background: wsColor }}
          disabled={updatingStatus}
        >
          {updatingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : t(ws.tKey)}
        </button>
        <PortalDropdown coords={statusCoords} open={showStatusMenu}>
          <div
            ref={statusDropdownRef}
            className="bg-background border border-border rounded-xl shadow-xl overflow-hidden min-w-[160px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("projects.change_status")}</span>
            </div>
            {WORK_STATUS_KEYS.map((key) => {
              const s = WORK_STATUS[key];
              return (
                <button
                  key={key}
                  onClick={() => updateStatus(key)}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2.5 text-white text-sm font-bold transition-opacity",
                    wsKey === key ? "opacity-100" : "opacity-90 hover:opacity-100"
                  )}
                  style={{ background: getStatusColor(key) }}
                >
                  {t(s.tKey)}
                  {wsKey === key && <Check className="w-4 h-4 opacity-80" />}
                </button>
              );
            })}
          </div>
        </PortalDropdown>
      </div>

      {/* Phase */}
      <div className="py-2.5 pr-3">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white truncate block text-center" style={{ background: phaseColor }}>
          {translatePhase(project.phase, t)}
        </span>
      </div>

      {/* Category */}
      <div className="py-2.5 pr-3">
        <span className="text-[11px] text-muted-foreground truncate">{project.category}</span>
      </div>

      {/* Billing */}
      <div className="py-2.5 pr-3">
        <span className={cn(
          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
          project.billing === "Completo" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
          project.billing === "Parziale" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
          "text-muted-foreground"
        )}>
          {project.billing || "—"}
        </span>
      </div>

      {/* Actions */}
      <div className="py-2.5 flex items-center justify-end gap-0.5">
        <AnimatePresence>
          {showActions && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-0.5">
              <Link
                href={`/dashboard/projects/${project.id}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                title={t("projects.open_full")}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              {canDelete && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(t("common.confirm_delete"))) {
                      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
                      onDelete(project.id);
                    }
                  }}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-muted-foreground hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Project Drawer (slide-over) ──────────────────────────────
function ProjectDrawer({ project, onClose, onUpdate, canEdit, currentUserId }: {
  project: Project;
  onClose: () => void;
  onUpdate: (p: Partial<Project>) => void;
  canEdit: boolean;
  currentUserId: string;
}) {
  const t = useT();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [addressInput, setAddressInput] = useState(project.address || project.commune || "");
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [locationEditing, setLocationEditing] = useState(false);

  const geocodeAndSave = async () => {
    if (!addressInput.trim()) return;
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
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: data.lat, longitude: data.lng, address: data.formatted }),
      });
      onUpdate({ id: project.id, latitude: data.lat, longitude: data.lng, address: data.formatted });
      setLocationEditing(false);
    } catch {
      setGeoError("Geocoding failed. Please try again.");
    } finally {
      setGeocoding(false);
    }
  };

  const removeLocation = async () => {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: null, longitude: null, address: null }),
    });
    onUpdate({ id: project.id, latitude: null, longitude: null, address: null });
  };
  const phaseColor = getPhaseColor(project.phase);
  const wsKey = (project.workStatus as WorkStatusKey) in WORK_STATUS ? project.workStatus as WorkStatusKey : "todo";
  const ws = WORK_STATUS[wsKey];
  const wsColor = getStatusColor(wsKey);
  const isAssignee = project.assignments.some((a) => a.userId === currentUserId);
  const canUpdateStatus = canEdit || isAssignee;

  const updateStatus = async (workStatus: WorkStatusKey) => {
    setUpdatingStatus(true);
    onUpdate({ id: project.id, workStatus });
    await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workStatus }) });
    setUpdatingStatus(false);
  };

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="w-[400px] shrink-0 border-l border-border flex flex-col bg-background overflow-hidden h-full"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {project.image ? (
              <img src={project.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-5 h-5 text-muted-foreground/40" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
              <h3 className="font-semibold text-sm leading-tight mt-0.5 line-clamp-2">
                {project.title.replace(project.code + " ", "")}
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Phase + Status badges */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: phaseColor }}>
            {translatePhase(project.phase, t)}
          </span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded text-white" style={{ background: wsColor }}>
            {t(ws.tKey)}
          </span>
        </div>

        {/* Status selector (monday.com full-color buttons) */}
        {canUpdateStatus && (
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">{t("projects.update_status")}</p>
            <div className="grid grid-cols-2 gap-1">
              {WORK_STATUS_KEYS.map((key) => {
                const s = WORK_STATUS[key];
                const isActive = wsKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => updateStatus(key)}
                    disabled={updatingStatus}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-2 py-2 rounded text-xs font-bold text-white transition-all",
                      isActive ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100"
                    )}
                    style={{ background: getStatusColor(key), ...(isActive ? { ringColor: getStatusColor(key) } : {}) }}
                  >
                    {isActive && updatingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {isActive && !updatingStatus ? <Check className="w-3 h-3" /> : null}
                    {t(s.tKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Assignees */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> {t("projects.team")} ({project.assignments.length})
          </p>
          {project.assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("projects.detail.no_assignees")}</p>
          ) : (
            <div className="space-y-2">
              {project.assignments.map((a) => (
                <div key={a.userId} className="flex items-center gap-2.5">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[10px] font-bold bg-foreground text-background">
                      {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium leading-tight">{a.user.name ?? "Unknown"}</p>
                    {a.role && <p className="text-[10px] text-muted-foreground">{a.role}</p>}
                  </div>
                  {a.userId === currentUserId && (
                    <span className="ml-auto text-[9px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-full px-1.5 py-0.5 font-semibold">You</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="px-5 py-4 border-b border-border space-y-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> {t("projects.details")}
          </p>
          {[
            { icon: Tag, label: t("projects.detail.category"), value: project.category },
            { icon: MapPin, label: t("projects.detail.commune"), value: project.commune },
            { icon: Users, label: t("projects.detail.client"), value: project.client },
            { icon: Clock, label: t("projects.detail.year"), value: project.year },
            { icon: CreditCard, label: t("projects.detail.billing"), value: project.billing },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label} className="flex items-center gap-2.5">
              <row.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground w-16 shrink-0">{row.label}</span>
              <span className="text-xs font-medium truncate">{String(row.value)}</span>
            </div>
          ))}
        </div>

        {/* Location */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3 h-3" /> Location
            </p>
            {project.latitude != null && canEdit && !locationEditing && (
              <button
                onClick={() => setLocationEditing(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>
            )}
          </div>

          {project.latitude != null && project.longitude != null && !locationEditing ? (
            <div className="space-y-2">
              {project.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-snug">{project.address}</p>
                </div>
              )}
              <p className="text-[10px] font-mono text-muted-foreground/60">
                {project.latitude.toFixed(5)}, {project.longitude.toFixed(5)}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => window.open(`https://earth.google.com/web/@${project.latitude},${project.longitude},0a,800d,35y,0h,0t,0r`, "_blank")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  <Globe className="w-3 h-3" /> Google Earth
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/dashboard/projects?view=map&project=${project.id}`;
                    navigator.clipboard
                      .writeText(url)
                      .then(() => showToast("Map link copied to clipboard"))
                      .catch(() => showToast("Couldn't copy — clipboard access blocked", "warning"));
                  }}
                  title="Copy map link"
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition-colors flex items-center gap-1"
                >
                  <Navigation className="w-3 h-3" /> Share
                </button>
                {canEdit && (
                  <button
                    onClick={removeLocation}
                    className="px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-xs transition-colors"
                    title="Remove pin"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ) : canEdit ? (
            <div className="space-y-2">
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && geocodeAndSave()}
                placeholder="Address or place name…"
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
                  {geocoding ? "Pinning…" : "Pin on map"}
                </button>
                {locationEditing && (
                  <button
                    onClick={() => { setLocationEditing(false); setGeoError(""); }}
                    className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No location set.</p>
          )}
        </div>

        {/* Notes */}
        {project.notes && (
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">{t("projects.notes")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{project.notes}</p>
          </div>
        )}

        {/* Description */}
        {project.description && (
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">{t("projects.description")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{project.description}</p>
          </div>
        )}

        {/* Action buttons — inside scroll area, right after last detail */}
        <div className="px-5 py-4 flex gap-2 sticky bottom-0 bg-background border-t border-border mt-auto">
          <Link href={`/dashboard/projects/${project.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> {t("projects.open_thread")}
            </Button>
          </Link>
          <Link href={`/dashboard/projects/${project.id}`}>
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> {t("projects.full_page")}
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  const t = useT();
  return (
    <div className="col-span-full flex flex-col items-center justify-center h-64 text-center">
      <Building2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{t("projects.no_results")}</p>
      {hasFilters && <button onClick={onClear} className="text-xs text-foreground underline mt-2">{t("projects.clear_filters")}</button>}
    </div>
  );
}

// ─── Project Card (grid view) ─────────────────────────────────
function ProjectCard({
  project,
  onSelect,
  isSelected,
  starred,
}: {
  project: Project;
  onSelect: () => void;
  isSelected: boolean;
  starred: boolean;
}) {
  const t = useT();
  const phaseColor = getPhaseColor(project.phase);
  const wsKey = (project.workStatus as WorkStatusKey) in WORK_STATUS ? project.workStatus as WorkStatusKey : "todo";
  const ws = WORK_STATUS[wsKey];
  const wsColor = getStatusColor(wsKey);
  return (
    <motion.div
      layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      onClick={onSelect}
      className={cn(
        "group bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all",
        isSelected ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border hover:border-foreground/20"
      )}
    >
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {project.image ? (
          <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Building2 className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        {/* Favourite star — always visible if starred, hover-revealed otherwise */}
        <div className={cn(
          "absolute bottom-2 left-2 rounded-full bg-background/85 backdrop-blur-sm transition-opacity",
          starred ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}>
          <FavoriteStar entityType="project" entityId={project.id} initiallyStarred={starred} size={14} />
        </div>
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white text-[10px] font-semibold" style={{ background: phaseColor }}>
          {translatePhase(project.phase, t)}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: wsColor }}>
          {t(ws.tKey)}
        </div>
        {project.assignments.length > 0 && (
          <div className="absolute bottom-2 right-2 flex -space-x-1">
            {project.assignments.slice(0, 3).map((a) => (
              <Avatar key={a.userId} className="h-5 w-5 border border-background">
                <AvatarFallback className="text-[8px] bg-foreground text-background">{a.user.initials ?? "??"}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
        <h3 className="text-xs font-semibold mt-0.5 line-clamp-2 leading-tight">{project.title.replace(project.code + " ", "")}</h3>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{project.category}</span>
          {project.commune && <><span className="text-muted-foreground/30">·</span><span className="text-[10px] text-muted-foreground truncate">{project.commune}</span></>}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Portal Dropdown ──────────────────────────────────────────
// Renders dropdown content directly in <body> so no overflow/clip/
// backdrop-filter ancestor can hide it.
function PortalDropdown({
  coords,
  open,
  children,
}: {
  coords: { top: number; left: number };
  open: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 9999, pointerEvents: open ? "auto" : "none" }}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.1 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

// ─── Filter Popover ───────────────────────────────────────────
function FilterPopover({ label, options, selected, onToggle }: {
  label: string; options: { value: string; label: string; color?: string }[];
  selected: string[]; onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const count = selected.length;

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={cn(
          "flex items-center gap-1 h-6 px-2.5 rounded-full border text-[11px] font-medium transition-colors",
          count > 0 ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40"
        )}
      >
        {label}
        {count > 0 && <span className="bg-background/20 text-background rounded-full px-1 text-[9px] font-bold">{count}</span>}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      <PortalDropdown coords={coords} open={open}>
        <div ref={dropdownRef} className="bg-background border border-border rounded-xl shadow-xl p-1 min-w-[170px]">
          {options.map((opt) => {
            const isSel = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
              >
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", isSel ? "bg-foreground border-foreground" : "border-border")}>
                  {isSel && <Check className="w-2.5 h-2.5 text-background" />}
                </div>
                {opt.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />}
                <span className={isSel ? "text-foreground font-medium" : "text-muted-foreground"}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </PortalDropdown>
    </div>
  );
}

// ─── Filter Select ────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isActive = value !== "all";

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={cn(
          "flex items-center gap-1 h-6 px-2.5 rounded-full border text-[11px] font-medium transition-colors",
          isActive ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40"
        )}
      >
        {isActive ? value : label}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      <PortalDropdown coords={coords} open={open}>
        <div ref={dropdownRef} className="bg-background border border-border rounded-xl shadow-xl p-1 min-w-[150px] max-h-60 overflow-y-auto">
          <button
            onClick={() => { onChange("all"); setOpen(false); }}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
          >
            <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", !isActive ? "bg-foreground border-foreground" : "border-border")}>
              {!isActive && <Check className="w-2.5 h-2.5 text-background" />}
            </div>
            <span className="text-muted-foreground">{t("common.all")} {label}</span>
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
            >
              <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", value === opt.value ? "bg-foreground border-foreground" : "border-border")}>
                {value === opt.value && <Check className="w-2.5 h-2.5 text-background" />}
              </div>
              <span className={value === opt.value ? "text-foreground font-medium" : "text-muted-foreground"}>{opt.label}</span>
            </button>
          ))}
        </div>
      </PortalDropdown>
    </div>
  );
}
