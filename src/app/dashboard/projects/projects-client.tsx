"use client";

import { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Grid,
  List,
  Filter,
  X,
  Building2,
  MapPin,
  Calendar,
  Tag,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AddProjectModal } from "@/components/projects/add-project-modal";
import { ProjectManageModal } from "@/components/projects/project-manage-modal";
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
  const [view, setView] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
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
    <div className="flex h-screen overflow-hidden">
      {/* Filters Sidebar */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-r border-border bg-card overflow-hidden shrink-0"
          >
            <div className="p-4 h-full overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Filters</h3>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {/* Category */}
              <FilterSection label="Category">
                {CATEGORIES.map((cat) => (
                  <CheckItem
                    key={cat}
                    label={cat}
                    checked={filters.categories.includes(cat)}
                    onChange={() => toggleFilter("categories", cat)}
                  />
                ))}
              </FilterSection>

              {/* Phase */}
              <FilterSection label="Phase">
                {PHASES.map((phase) => (
                  <CheckItem
                    key={phase}
                    label={phase}
                    checked={filters.phases.includes(phase)}
                    onChange={() => toggleFilter("phases", phase)}
                    color={PHASE_COLORS[phase]}
                  />
                ))}
              </FilterSection>

              {/* Typology */}
              <FilterSection label="Typology">
                {TYPOLOGIES.map((t) => (
                  <CheckItem
                    key={t}
                    label={t}
                    checked={filters.typologies.includes(t)}
                    onChange={() => toggleFilter("typologies", t)}
                  />
                ))}
              </FilterSection>

              {/* Terrain */}
              <FilterSection label="Terrain">
                {TERRAINS.map((t) => (
                  <CheckItem
                    key={t}
                    label={t}
                    checked={filters.terrains.includes(t)}
                    onChange={() => toggleFilter("terrains", t)}
                  />
                ))}
              </FilterSection>

              {/* Roof */}
              <FilterSection label="Roof">
                {ROOFS.map((r) => (
                  <CheckItem
                    key={r}
                    label={r}
                    checked={filters.roofs.includes(r)}
                    onChange={() => toggleFilter("roofs", r)}
                  />
                ))}
              </FilterSection>

              {/* Client */}
              <FilterSection label="Client">
                <select
                  value={filters.client}
                  onChange={(e) => setFilters({ ...filters, client: e.target.value })}
                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All clients</option>
                  {clients.map((c) => (
                    <option key={c} value={c!}>{c}</option>
                  ))}
                </select>
              </FilterSection>

              {/* Year */}
              <FilterSection label="Year">
                <select
                  value={filters.year}
                  onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All years</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </FilterSection>

              {/* Commune */}
              <FilterSection label="Commune">
                <select
                  value={filters.commune}
                  onChange={(e) => setFilters({ ...filters, commune: e.target.value })}
                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All communes</option>
                  {communes.map((c) => (
                    <option key={c} value={c!}>{c}</option>
                  ))}
                </select>
              </FilterSection>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && "bg-accent")}
            >
              <Filter className="w-4 h-4" />
            </Button>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <span className="text-sm text-muted-foreground">
              {filteredProjects.length} projects
            </span>

            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("grid")}
                className={cn(view === "grid" && "bg-accent")}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("list")}
                className={cn(view === "list" && "bg-accent")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>

            {permissions.canCreate && (
              <Button onClick={() => setAddModalOpen(true)} size="sm">
                <Plus className="w-4 h-4" />
                Add Project
              </Button>
            )}
          </div>
        </div>

        {/* Projects grid/list */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No projects found</p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-foreground underline mt-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === "grid" ? (
            <motion.div
              layout
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            >
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
          ) : (
            <ProjectListView
              projects={filteredProjects}
              canEdit={permissions.canEdit}
              canDelete={permissions.canDelete}
              onUpdate={(updated) =>
                setProjects(projects.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
              }
              onDelete={(id) => setProjects(projects.filter((p) => p.id !== id))}
            />
          )}
        </div>
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

// Filter Section Component
function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CheckItem({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  color?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 rounded border-border"
      />
      {color && (
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
      )}
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
    </label>
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
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className="group bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
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
        <h3 className="text-xs font-semibold mt-0.5 line-clamp-2 leading-tight">
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
                <p className="font-medium text-xs">{project.title}</p>
                <p className="text-[10px] text-muted-foreground">{project.category}</p>
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
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {/* Edit modal */}}
                    >
                      Edit
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                    >
                      Duplicate
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
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
