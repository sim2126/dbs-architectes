"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Grid,
  List,
  ChevronDown,
  X,
  Building2,
  ExternalLink,
  LayoutTemplate,
  Check,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AddProjectModal } from "@/components/projects/add-project-modal";
import { PHASE_COLORS, CATEGORIES, PHASES, TYPOLOGIES, TERRAINS, ROOFS } from "@/lib/utils";
import { cn } from "@/lib/utils";

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
  billing?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: Array<{
    userId: string;
    user: { id: string; name?: string | null; initials?: string | null };
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
}

const PHASE_ORDER = ["ETUDE / AP", "MAE", "CHANTIER", "EXE / DG / DV / 3D", "TERMINATO", "STUCK"];

export function ProjectsClient({
  initialProjects,
  users,
  permissions,
  currentUserId,
}: ProjectsClientProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [view, setView] = useState<"grid" | "list" | "kanban">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    categories: [] as string[],
    phases: [] as string[],
    typologies: [] as string[],
    terrains: [] as string[],
    roofs: [] as string[],
    client: "all",
    year: "all",
    commune: "all",
  });

  const clients = Array.from(new Set(projects.map((p) => p.client).filter(Boolean)));
  const years = Array.from(new Set(projects.map((p) => p.year).filter(Boolean))).sort((a, b) => (b || 0) - (a || 0));
  const communes = Array.from(new Set(projects.map((p) => p.commune).filter(Boolean))).sort();

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.client || "").toLowerCase().includes(q) ||
      (p.commune || "").toLowerCase().includes(q);

    const matchesCategory =
      filters.categories.length === 0 ||
      filters.categories.includes(p.category);
    const matchesPhase =
      filters.phases.length === 0 || filters.phases.includes(p.phase);
    const matchesTypology =
      filters.typologies.length === 0 ||
      (p.typology && filters.typologies.includes(p.typology));
    const matchesTerrain =
      filters.terrains.length === 0 ||
      (p.terrain && filters.terrains.includes(p.terrain));
    const matchesRoof =
      filters.roofs.length === 0 ||
      (p.roof && filters.roofs.includes(p.roof));
    const matchesClient =
      filters.client === "all" || p.client === filters.client;
    const matchesYear =
      filters.year === "all" || String(p.year) === filters.year;
    const matchesCommune =
      filters.commune === "all" || p.commune === filters.commune;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesPhase &&
      matchesTypology &&
      matchesTerrain &&
      matchesRoof &&
      matchesClient &&
      matchesYear &&
      matchesCommune
    );
  });

  const toggleFilter = (key: keyof typeof filters, value: string) => {
    if (Array.isArray(filters[key])) {
      const arr = filters[key] as string[];
      setFilters({
        ...filters,
        [key]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      });
    }
  };

  const clearFilters = () => {
    setFilters({
      categories: [],
      phases: [],
      typologies: [],
      terrains: [],
      roofs: [],
      client: "all",
      year: "all",
      commune: "all",
    });
    setSearchQuery("");
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.phases.length > 0 ||
    filters.typologies.length > 0 ||
    filters.terrains.length > 0 ||
    filters.roofs.length > 0 ||
    filters.client !== "all" ||
    filters.year !== "all" ||
    filters.commune !== "all" ||
    !!searchQuery;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        {/* Row 1: Search + view toggles + add */}
        <div className="flex items-center gap-3 px-6 py-3">
          <div className="relative flex-1 max-w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <span className="text-sm text-muted-foreground shrink-0">
            {filteredProjects.length} projects
          </span>

          <div className="flex items-center gap-1 ml-auto">
            <Button variant="ghost" size="icon" onClick={() => setView("grid")} className={cn("h-8 w-8", view === "grid" && "bg-accent")} title="Grid">
              <Grid className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setView("list")} className={cn("h-8 w-8", view === "list" && "bg-accent")} title="List">
              <List className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setView("kanban")} className={cn("h-8 w-8", view === "kanban" && "bg-accent")} title="Kanban">
              <LayoutTemplate className="w-4 h-4" />
            </Button>
          </div>

          {permissions.canCreate && (
            <Button onClick={() => setAddModalOpen(true)} size="sm" className="h-8">
              <Plus className="w-4 h-4" />
              Add Project
            </Button>
          )}
        </div>

        {/* Row 2: Filter chips */}
        <div className="flex items-center gap-2 px-6 pb-3 overflow-x-auto">
          <FilterPopover
            label="Phase"
            options={PHASES.map((p) => ({ value: p, label: p, color: PHASE_COLORS[p] }))}
            selected={filters.phases}
            onToggle={(v) => toggleFilter("phases", v)}
          />
          <FilterPopover
            label="Category"
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            selected={filters.categories}
            onToggle={(v) => toggleFilter("categories", v)}
          />
          <FilterPopover
            label="Typology"
            options={TYPOLOGIES.map((t) => ({ value: t, label: t }))}
            selected={filters.typologies}
            onToggle={(v) => toggleFilter("typologies", v)}
          />
          <FilterPopover
            label="Terrain"
            options={TERRAINS.map((t) => ({ value: t, label: t }))}
            selected={filters.terrains}
            onToggle={(v) => toggleFilter("terrains", v)}
          />
          <FilterPopover
            label="Roof"
            options={ROOFS.map((r) => ({ value: r, label: r }))}
            selected={filters.roofs}
            onToggle={(v) => toggleFilter("roofs", v)}
          />
          <FilterSelect
            label="Client"
            value={filters.client}
            options={clients.map((c) => ({ value: c!, label: c! }))}
            onChange={(v) => setFilters({ ...filters, client: v })}
          />
          <FilterSelect
            label="Year"
            value={filters.year}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(v) => setFilters({ ...filters, year: v })}
          />
          <FilterSelect
            label="Commune"
            value={filters.commune}
            options={communes.map((c) => ({ value: c!, label: c! }))}
            onChange={(v) => setFilters({ ...filters, commune: v })}
          />

          {/* Active filter chips */}
          {hasActiveFilters && (
            <>
              <div className="w-px h-5 bg-border shrink-0 mx-1" />
              {filters.phases.map((p) => (
                <ActiveChip key={`phase-${p}`} label={p} color={PHASE_COLORS[p]} onRemove={() => toggleFilter("phases", p)} />
              ))}
              {filters.categories.map((c) => (
                <ActiveChip key={`cat-${c}`} label={c} onRemove={() => toggleFilter("categories", c)} />
              ))}
              {filters.typologies.map((t) => (
                <ActiveChip key={`typ-${t}`} label={t} onRemove={() => toggleFilter("typologies", t)} />
              ))}
              {filters.terrains.map((t) => (
                <ActiveChip key={`ter-${t}`} label={t} onRemove={() => toggleFilter("terrains", t)} />
              ))}
              {filters.roofs.map((r) => (
                <ActiveChip key={`roof-${r}`} label={r} onRemove={() => toggleFilter("roofs", r)} />
              ))}
              {filters.client !== "all" && (
                <ActiveChip label={filters.client} onRemove={() => setFilters({ ...filters, client: "all" })} />
              )}
              {filters.year !== "all" && (
                <ActiveChip label={filters.year} onRemove={() => setFilters({ ...filters, year: "all" })} />
              )}
              {filters.commune !== "all" && (
                <ActiveChip label={filters.commune} onRemove={() => setFilters({ ...filters, commune: "all" })} />
              )}
              <button
                onClick={clearFilters}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline ml-1"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className={cn("flex-1 overflow-y-auto p-6", view === "kanban" && "overflow-x-auto overflow-y-hidden")}>
        {filteredProjects.length === 0 && view !== "kanban" ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No projects found</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-foreground underline mt-2">
                Clear filters
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  canEdit={permissions.canEdit}
                  onUpdate={(updated) =>
                    setProjects(projects.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
                  }
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : view === "list" ? (
          <ProjectListView
            projects={filteredProjects}
            canEdit={permissions.canEdit}
            canDelete={permissions.canDelete}
            onUpdate={(updated) =>
              setProjects(projects.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
            }
            onDelete={(id) => setProjects(projects.filter((p) => p.id !== id))}
          />
        ) : (
          <KanbanBoard
            projects={filteredProjects}
            canEdit={permissions.canEdit}
            onUpdate={(updated) =>
              setProjects(projects.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
            }
          />
        )}
      </div>

      {/* Modals */}
      <AddProjectModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        users={users}
        onSuccess={(project) => {
          setProjects([project as unknown as Project, ...projects]);
          setAddModalOpen(false);
        }}
      />
    </div>
  );
}

// ── Filter Popover (multi-select) ───────────────────────────────────────────
function FilterPopover({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string; color?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = selected.length;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-medium transition-colors",
          count > 0
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40"
        )}
      >
        {label}
        {count > 0 && (
          <span className="bg-background/20 text-background rounded-full px-1 text-[10px] font-bold">
            {count}
          </span>
        )}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 mt-1.5 bg-background border border-border rounded-xl shadow-xl p-1.5 min-w-[180px] z-50"
          >
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => onToggle(opt.value)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
                >
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "bg-foreground border-foreground" : "border-border"
                  )}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-background" />}
                  </div>
                  {opt.color && (
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />
                  )}
                  <span className={isSelected ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Filter Select (single value) ───────────────────────────────────────────
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = value !== "all";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-medium transition-colors",
          isActive
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40"
        )}
      >
        {isActive ? value : label}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 mt-1.5 bg-background border border-border rounded-xl shadow-xl p-1.5 min-w-[160px] z-50"
          >
            <button
              onClick={() => { onChange("all"); setOpen(false); }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
            >
              <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", !isActive ? "bg-foreground border-foreground" : "border-border")}>
                {!isActive && <Check className="w-2.5 h-2.5 text-background" />}
              </div>
              <span className="text-muted-foreground">All {label.toLowerCase()}s</span>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Active Filter Chip ─────────────────────────────────────────────────────
function ActiveChip({ label, color, onRemove }: { label: string; color?: string; onRemove: () => void }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-accent border border-border text-xs font-medium">
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
      {label}
      <button onClick={onRemove} className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// Project Card Component
function ProjectCard({
  project,
  canEdit,
  onUpdate,
}: {
  project: Project;
  canEdit: boolean;
  onUpdate: (p: Partial<Project>) => void;
}) {
  const phaseColor = PHASE_COLORS[project.phase] || "#94a3b8";

  return (
    <Link href={`/dashboard/projects/${project.id}`} target="_blank" rel="noopener noreferrer">
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ y: -2 }}
        className="group bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-foreground/20 transition-all"
      >
        {/* Project image */}
        <div className="aspect-[4/3] bg-muted relative overflow-hidden">
          {project.image ? (
            <img
              src={project.image}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
              <Building2 className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}
          {/* Phase badge */}
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white text-[10px] font-medium"
            style={{ background: phaseColor }}
          >
            {project.phase}
          </div>
          {/* Open in new tab indicator */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-1">
            <ExternalLink className="w-2.5 h-2.5 text-white" />
          </div>
          {/* Assignees */}
          {project.assignments.length > 0 && (
            <div className="absolute bottom-2 right-2 flex -space-x-1">
              {project.assignments.slice(0, 3).map((a) => (
                <Avatar key={a.userId} className="h-5 w-5 border border-background">
                  <AvatarFallback className="text-[8px] bg-foreground text-background">
                    {a.user.initials || a.user.name?.slice(0, 2).toUpperCase() || "??"}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
        </div>

        {/* Project info */}
        <div className="p-3">
          <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
          <h3 className="text-xs font-semibold mt-0.5 line-clamp-2 leading-tight group-hover:text-foreground transition-colors">
            {project.title.replace(project.code + " ", "")}
          </h3>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {project.category}
            </span>
            {project.commune && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {project.commune}
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// Project List View
function ProjectListView({
  projects,
  canEdit,
  canDelete,
  onUpdate,
  onDelete,
}: {
  projects: Project[];
  canEdit: boolean;
  canDelete: boolean;
  onUpdate: (p: Partial<Project>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground w-12"></th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">
              Project Name
            </th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">
              Phase
            </th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">
              Assigned To
            </th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
              Notes
            </th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
              Billing
            </th>
            <th className="text-right p-3 text-xs font-semibold text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, i) => (
            <motion.tr
              key={project.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
            >
              <td className="p-3">
                <div className="w-8 h-8 bg-muted rounded-lg overflow-hidden">
                  {project.image ? (
                    <img
                      src={project.image}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </td>
              <td className="p-3">
                <Link href={`/dashboard/projects/${project.id}`} target="_blank" rel="noopener noreferrer" className="group/title">
                  <p className="font-medium text-xs group-hover/title:underline">{project.title}</p>
                  <p className="text-[10px] text-muted-foreground">{project.category}</p>
                </Link>
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: PHASE_COLORS[project.phase] || "#94a3b8" }}
                  />
                  <select
                    value={project.phase}
                    onChange={async (e) => {
                      const res = await fetch(`/api/projects/${project.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phase: e.target.value }),
                      });
                      if (res.ok) onUpdate({ id: project.id, phase: e.target.value });
                    }}
                    disabled={!canEdit}
                    className="text-xs bg-transparent border-none outline-none cursor-pointer disabled:cursor-default"
                  >
                    {["ETUDE / AP", "MAE", "CHANTIER", "EXE / DG / DV / 3D", "TERMINATO", "STUCK"].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </td>
              <td className="p-3 hidden md:table-cell">
                <div className="flex -space-x-1">
                  {project.assignments.slice(0, 4).map((a) => (
                    <Avatar key={a.userId} className="h-6 w-6 border border-background">
                      <AvatarFallback className="text-[9px] bg-foreground text-background">
                        {a.user.initials || "??"}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {project.assignments.length === 0 && (
                    <span className="text-xs text-muted-foreground">N/A</span>
                  )}
                </div>
              </td>
              <td className="p-3 hidden lg:table-cell">
                <span className="text-xs text-muted-foreground">
                  {project.notes ? (
                    <span className="text-foreground">{project.notes}</span>
                  ) : (
                    "Add note..."
                  )}
                </span>
              </td>
              <td className="p-3 hidden xl:table-cell">
                <Badge
                  variant={
                    project.billing === "Completo"
                      ? "success"
                      : project.billing === "Parziale"
                      ? "warning"
                      : "secondary"
                  }
                  className="text-[10px]"
                >
                  {project.billing || "Non"}
                </Badge>
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1 justify-end">
                  <Link href={`/dashboard/projects/${project.id}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </Button>
                  </Link>
                  {canDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm("Delete this project?")) {
                          await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
                          onDelete(project.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Kanban Board ────────────────────────────────────────────────────────────

const KANBAN_PHASES = ["ETUDE / AP", "MAE", "CHANTIER", "EXE / DG / DV / 3D", "TERMINATO", "STUCK"];

function KanbanBoard({
  projects,
  canEdit,
  onUpdate,
}: {
  projects: Project[];
  canEdit: boolean;
  onUpdate: (p: Partial<Project>) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overPhase, setOverPhase] = useState<string | null>(null);

  const byPhase = KANBAN_PHASES.reduce<Record<string, Project[]>>((acc, phase) => {
    acc[phase] = projects.filter((p) => p.phase === phase);
    return acc;
  }, {});

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    setDraggingId(projectId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, phase: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverPhase(phase);
  };

  const handleDrop = async (e: React.DragEvent, phase: string) => {
    e.preventDefault();
    setOverPhase(null);
    if (!draggingId || !canEdit) return;
    const project = projects.find((p) => p.id === draggingId);
    if (!project || project.phase === phase) return;
    onUpdate({ id: draggingId, phase });
    await fetch(`/api/projects/${draggingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    setDraggingId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverPhase(null);
  };

  return (
    <div className="flex gap-3 h-full min-w-max pb-4">
      {KANBAN_PHASES.map((phase) => {
        const color = PHASE_COLORS[phase] || "#94a3b8";
        const cols = byPhase[phase];
        const isOver = overPhase === phase;
        return (
          <div
            key={phase}
            className={cn(
              "flex flex-col w-64 rounded-xl border transition-all",
              isOver
                ? "border-foreground/30 bg-accent/60"
                : "border-border bg-muted/30"
            )}
            onDragOver={(e) => handleDragOver(e, phase)}
            onDrop={(e) => handleDrop(e, phase)}
            onDragLeave={() => setOverPhase(null)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="text-xs font-semibold truncate">{phase}</span>
              </div>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: color }}
              >
                {cols.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
              <AnimatePresence>
                {cols.map((project) => (
                  <KanbanCard
                    key={project.id}
                    project={project}
                    isDragging={draggingId === project.id}
                    canEdit={canEdit}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </AnimatePresence>
              {cols.length === 0 && !isOver && (
                <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50 border-2 border-dashed border-border/50 rounded-lg">
                  Drop here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  project,
  isDragging,
  canEdit,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  isDragging: boolean;
  canEdit: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable={canEdit}
      onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, project.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden transition-shadow",
        canEdit && "cursor-grab active:cursor-grabbing",
        isDragging && "shadow-none"
      )}
    >
      {project.image && (
        <div className="h-20 overflow-hidden">
          <img
            src={project.image}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
          />
        </div>
      )}
      <div className="p-2.5">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-muted-foreground">{project.code}</p>
            <p className="text-xs font-medium leading-tight line-clamp-2 mt-0.5">
              {project.title.replace(project.code + " ", "")}
            </p>
          </div>
          {canEdit && (
            <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">{project.category}</span>
          <div className="flex items-center gap-1">
            {project.assignments?.slice(0, 2).map((a) => (
              <Avatar key={a.userId} className="h-4 w-4 border border-background">
                <AvatarFallback className="text-[7px] bg-foreground text-background">
                  {a.user.initials || "??"}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
        <Link
          href={`/dashboard/projects/${project.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-2.5 h-2.5" />
          Open
        </Link>
      </div>
    </motion.div>
  );
}
