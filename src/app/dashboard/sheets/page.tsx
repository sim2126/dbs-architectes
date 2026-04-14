"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { useSearchParams } from "next/navigation";
import {
  Download,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  Table2,
  Users,
  FileSpreadsheet,
  Check,
  X,
  ChevronDown,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ─────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  code: string;
  title: string;
  phase: string;
  category: string;
  client: string;
  commune: string;
  workStatus: string;
  billing: string;
  year: string;
  team: string;
  notes: string;
}

interface TeamRow {
  id: string;
  name: string;
  role: string;
  total: number;
  doing: number;
  stuck: number;
  completed: number;
  workloadCode: number;
}

interface CustomSheet {
  id: string;
  name: string;
  columns: string[];
  rows: Record<string, string>[];
}

interface SheetMeta {
  id: string;
  name: string;
  updatedAt: string;
}

type ActiveView = "projects" | "workload" | string; // string = custom sheet id

// ─── Constants ─────────────────────────────────────────────────

const WORK_STATUS_OPTIONS = ["todo", "doing", "stuck", "completed"];
const PHASE_OPTIONS = ["ETUDE / AP", "MAE", "CHANTIER", "EXE / DG / DV / 3D", "TERMINATO", "STUCK"];
const BILLING_OPTIONS = ["Completo", "Parziale", "Nessuno", ""];

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  doing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  stuck: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const WORKLOAD_COLORS: Record<number, string> = {
  0: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  1: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  2: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  3: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const WORKLOAD_LABELS: Record<number, string> = {
  0: "Low (0)",
  1: "Moderate (1)",
  2: "High (2)",
  3: "Critical (3)",
};

/** Workload code: 0 ≤2 tasks · 1 >2 · 2 >3 · 3 >4 */
function workloadCode(activeCount: number): number {
  if (activeCount > 4) return 3;
  if (activeCount > 3) return 2;
  if (activeCount > 2) return 1;
  return 0;
}

// ─── Dropdown cell ─────────────────────────────────────────────

function DropdownCell({
  value,
  options,
  onChange,
  colorMap,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  colorMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80",
          colorMap?.[value] ?? "bg-muted text-muted-foreground"
        )}
      >
        {value || "—"}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-7 z-50 min-w-[140px] rounded-xl border border-border bg-card shadow-xl overflow-hidden"
          >
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors",
                  value === opt && "font-semibold"
                )}
              >
                {colorMap && (
                  <span className={cn("h-2 w-2 rounded-full", colorMap[opt]?.split(" ")[0])} />
                )}
                {opt || "—"}
                {value === opt && <Check className="h-3 w-3 ml-auto text-primary" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Editable text cell ────────────────────────────────────────

function EditableCell({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    onChange(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={cn("w-full bg-transparent border-b border-primary outline-none text-xs py-0.5", className)}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn("cursor-text hover:bg-accent/40 rounded px-1 py-0.5 transition-colors text-xs block truncate", className)}
    >
      {value || <span className="text-muted-foreground/40">—</span>}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────

export default function SheetsPage() {
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<ActiveView>("projects");
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [customSheets, setCustomSheets] = useState<SheetMeta[]>([]);
  const [activeCustomSheet, setActiveCustomSheet] = useState<CustomSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [dirtyProjectIds, setDirtyProjectIds] = useState<Set<string>>(new Set());
  const [newSheetName, setNewSheetName] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const requestedSheetId = searchParams.get("sheet");

  // ── Load projects ──────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json() as {
        id: string; code: string; title: string; phase: string; category: string;
        client?: string; commune?: string; workStatus: string; billing?: string;
        year?: number; notes?: string;
        assignments: { user: { name?: string | null } }[];
      }[];
      setProjectRows(
        data.map((p) => ({
          id: p.id,
          code: p.code,
          title: p.title,
          phase: p.phase,
          category: p.category,
          client: p.client ?? "",
          commune: p.commune ?? "",
          workStatus: p.workStatus,
          billing: p.billing ?? "",
          year: p.year ? String(p.year) : "",
          team: p.assignments.map((a) => a.user.name).filter(Boolean).join(", "),
          notes: p.notes ?? "",
        }))
      );
      setDirtyProjectIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load team workload ────────────────────────────────────

  const loadWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, projectsRes] = await Promise.all([
        fetch("/api/team"),
        fetch("/api/projects"),
      ]);
      const users = await usersRes.json() as { id: string; name?: string | null; role: string }[];
      const projects = await projectsRes.json() as {
        workStatus: string;
        assignments: { userId: string }[];
      }[];

      const rows: TeamRow[] = users.map((u) => {
        const assigned = projects.filter((p) => p.assignments.some((a) => a.userId === u.id));
        const active = assigned.filter((p) => p.workStatus !== "completed");
        const doing = assigned.filter((p) => p.workStatus === "doing").length;
        const stuck = assigned.filter((p) => p.workStatus === "stuck").length;
        const completed = assigned.filter((p) => p.workStatus === "completed").length;
        return {
          id: u.id,
          name: u.name ?? "—",
          role: u.role,
          total: assigned.length,
          doing,
          stuck,
          completed,
          workloadCode: workloadCode(active.length),
        };
      }).sort((a, b) => b.workloadCode - a.workloadCode);

      setTeamRows(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load custom sheets list ───────────────────────────────

  const loadCustomSheets = useCallback(async () => {
    const res = await fetch("/api/sheets");
    const data = await res.json() as SheetMeta[];
    setCustomSheets(data);
  }, []);

  // ── Load custom sheet data ────────────────────────────────

  const loadCustomSheetData = useCallback(async (id: string) => {
    setLoading(true);
    const res = await fetch(`/api/sheets/${id}`);
    const data = await res.json() as CustomSheet;
    setActiveCustomSheet(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCustomSheets();
    loadProjects();
  }, [loadCustomSheets, loadProjects]);

  useEffect(() => {
    if (requestedSheetId) {
      setActiveView(requestedSheetId);
    }
  }, [requestedSheetId]);

  useEffect(() => {
    if (activeView === "projects") loadProjects();
    else if (activeView === "workload") loadWorkload();
    else if (activeView !== "projects" && activeView !== "workload") {
      loadCustomSheetData(activeView);
    }
  }, [activeView, loadProjects, loadWorkload, loadCustomSheetData]);

  // ── Update project row ────────────────────────────────────

  const updateProjectRow = (id: string, field: keyof ProjectRow, value: string) => {
    setProjectRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
    setDirtyProjectIds((prev) => new Set([...prev, id]));
  };

  // ── Sync project changes to DB ────────────────────────────

  const syncProjects = async () => {
    if (dirtyProjectIds.size === 0) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const updates = projectRows
        .filter((r) => dirtyProjectIds.has(r.id))
        .map(({ id, phase, workStatus, billing, notes }) => ({ id, phase, workStatus, billing, notes }));

      const res = await fetch("/api/sheets/sync-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json() as { succeeded: number; failed: number };
      setDirtyProjectIds(new Set());
      setSyncResult(`Synced ${data.succeeded} project${data.succeeded !== 1 ? "s" : ""}${data.failed > 0 ? ` (${data.failed} failed)` : ""}`);
      setTimeout(() => setSyncResult(null), 4000);
    } finally {
      setSyncing(false);
    }
  };

  // ── Export to Excel ───────────────────────────────────────

  const exportExcel = () => {
    let wsData: unknown[][];
    let sheetName: string;

    if (activeView === "projects") {
      sheetName = "Projects Status";
      wsData = [
        ["Code", "Title", "Phase", "Category", "Client", "Commune", "Work Status", "Billing", "Year", "Team", "Notes"],
        ...projectRows.map((r) => [r.code, r.title, r.phase, r.category, r.client, r.commune, r.workStatus, r.billing, r.year, r.team, r.notes]),
      ];
    } else if (activeView === "workload") {
      sheetName = "Team Workload";
      wsData = [
        ["Name", "Role", "Total Projects", "Doing", "Stuck", "Completed", "Workload Code", "Workload Level"],
        ...teamRows.map((r) => [r.name, r.role, r.total, r.doing, r.stuck, r.completed, r.workloadCode, WORKLOAD_LABELS[r.workloadCode]]),
      ];
    } else if (activeCustomSheet) {
      sheetName = activeCustomSheet.name.slice(0, 31);
      wsData = [
        activeCustomSheet.columns,
        ...activeCustomSheet.rows.map((row) => activeCustomSheet.columns.map((col) => row[col] ?? "")),
      ];
    } else {
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `DBS_${sheetName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Custom sheet operations ───────────────────────────────

  const createSheet = async () => {
    if (!newSheetName.trim()) return;
    setCreatingSheet(true);
    const defaultColumns = ["Column 1", "Column 2", "Column 3"];
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSheetName.trim(), columns: defaultColumns, rows: [{}] }),
    });
    const sheet = await res.json() as { id: string };
    await loadCustomSheets();
    setNewSheetName("");
    setCreatingSheet(false);
    setActiveView(sheet.id);
  };

  const deleteCustomSheet = async (id: string) => {
    await fetch(`/api/sheets/${id}`, { method: "DELETE" });
    await loadCustomSheets();
    if (activeView === id) setActiveView("projects");
  };

  const saveCustomSheet = async () => {
    if (!activeCustomSheet) return;
    setSyncing(true);
    await fetch(`/api/sheets/${activeCustomSheet.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: activeCustomSheet.name, columns: activeCustomSheet.columns, rows: activeCustomSheet.rows }),
    });
    setCustomSheets((prev) => prev.map((sheet) =>
      sheet.id === activeCustomSheet.id ? { ...sheet, name: activeCustomSheet.name } : sheet
    ));
    setSyncing(false);
    setSyncResult("Saved");
    setTimeout(() => setSyncResult(null), 3000);
  };

  const updateCustomSheetName = (value: string) => {
    setActiveCustomSheet((prev) => prev ? { ...prev, name: value.slice(0, 100) } : prev);
    setCustomSheets((prev) => prev.map((sheet) =>
      sheet.id === activeCustomSheet?.id ? { ...sheet, name: value.slice(0, 100) } : sheet
    ));
  };

  const addCustomRow = () => {
    if (!activeCustomSheet) return;
    setActiveCustomSheet({ ...activeCustomSheet, rows: [...activeCustomSheet.rows, {}] });
  };

  const addCustomColumn = () => {
    if (!activeCustomSheet) return;
    const name = `Column ${activeCustomSheet.columns.length + 1}`;
    setActiveCustomSheet({ ...activeCustomSheet, columns: [...activeCustomSheet.columns, name] });
  };

  const updateCustomCell = (rowIdx: number, col: string, val: string) => {
    if (!activeCustomSheet) return;
    const rows = activeCustomSheet.rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r);
    setActiveCustomSheet({ ...activeCustomSheet, rows });
  };

  const deleteCustomRow = (rowIdx: number) => {
    if (!activeCustomSheet) return;
    setActiveCustomSheet({ ...activeCustomSheet, rows: activeCustomSheet.rows.filter((_, i) => i !== rowIdx) });
  };

  // ─── Render ───────────────────────────────────────────────

  const isBuiltIn = activeView === "projects" || activeView === "workload";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-56 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Sheets
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Built-in views */}
          <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Live Views</p>
          {[
            { id: "projects", label: "Projects Status", icon: Table2 },
            { id: "workload", label: "Team Workload", icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-accent/60 transition-colors text-left",
                activeView === id && "bg-accent font-medium text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {label}
            </button>
          ))}

          {/* Custom sheets */}
          <p className="px-4 py-1 mt-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">My Sheets</p>
          {customSheets.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex items-center gap-1 px-4 py-2 hover:bg-accent/60 transition-colors cursor-pointer",
                activeView === s.id && "bg-accent font-medium"
              )}
              onClick={() => setActiveView(s.id)}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm truncate">{s.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteCustomSheet(s.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* New sheet input */}
          <div className="px-3 mt-2">
            <div className="flex gap-1">
              <input
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createSheet(); }}
                placeholder="New sheet name…"
                className="flex-1 text-xs bg-muted/40 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/50"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={createSheet} disabled={creatingSheet || !newSheetName.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="shrink-0 border-b border-border bg-card/80 px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            {activeView === "projects" || activeView === "workload" ? (
              <h3 className="text-sm font-semibold">
                {activeView === "projects" ? "Projects Status" : "Team Workload"}
              </h3>
            ) : (
              <input
                value={activeCustomSheet?.name ?? ""}
                onChange={(e) => updateCustomSheetName(e.target.value)}
                placeholder="Sheet name"
                className="w-full max-w-[320px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none transition-colors focus:border-border focus:bg-background"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              {activeView === "projects" ? `${projectRows.length} projects · ${dirtyProjectIds.size} unsaved changes` : activeView === "workload" ? `${teamRows.length} team members` : `${activeCustomSheet?.rows.length ?? 0} rows`}
            </p>
          </div>

          {/* Sync result */}
          <AnimatePresence>
            {syncResult && (
              <motion.span
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5" />
                {syncResult}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              if (activeView === "projects") loadProjects();
              else if (activeView === "workload") loadWorkload();
              else if (activeCustomSheet) loadCustomSheetData(activeCustomSheet.id);
            }}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>

          {/* Sync to DB (projects only) */}
          {activeView === "projects" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={syncProjects}
              disabled={syncing || dirtyProjectIds.size === 0}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
              Sync to DB {dirtyProjectIds.size > 0 && `(${dirtyProjectIds.size})`}
            </Button>
          )}

          {/* Save custom sheet */}
          {!isBuiltIn && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={saveCustomSheet}
              disabled={syncing}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          )}

          {/* Export Excel */}
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={exportExcel}
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </Button>
        </div>

        {/* Table area */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : activeView === "projects" ? (
            <ProjectsTable rows={projectRows} onUpdate={updateProjectRow} dirtyIds={dirtyProjectIds} />
          ) : activeView === "workload" ? (
            <WorkloadTable rows={teamRows} />
          ) : activeCustomSheet ? (
            <CustomSheetTable
              sheet={activeCustomSheet}
              onUpdateCell={updateCustomCell}
              onDeleteRow={deleteCustomRow}
              onAddRow={addCustomRow}
              onAddColumn={addCustomColumn}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Projects table ────────────────────────────────────────────

function ProjectsTable({
  rows,
  onUpdate,
  dirtyIds,
}: {
  rows: ProjectRow[];
  onUpdate: (id: string, field: keyof ProjectRow, value: string) => void;
  dirtyIds: Set<string>;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
        <tr>
          {["", "Code", "Title", "Phase", "Category", "Client", "Commune", "Work Status", "Billing", "Year", "Team", "Notes"].map((h) => (
            <th key={h} className="border-b border-border px-3 py-2.5 text-left font-semibold text-[11px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={cn(
              "border-b border-border/50 hover:bg-accent/20 transition-colors",
              dirtyIds.has(row.id) && "bg-amber-50/40 dark:bg-amber-900/10"
            )}
          >
            <td className="px-2 py-2 w-4">
              {dirtyIds.has(row.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" title="Unsaved" />}
            </td>
            <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{row.code}</td>
            <td className="px-3 py-2 max-w-[200px]">
              <EditableCell value={row.title} onChange={(v) => onUpdate(row.id, "title", v)} />
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              <DropdownCell value={row.phase} options={PHASE_OPTIONS} onChange={(v) => onUpdate(row.id, "phase", v)} />
            </td>
            <td className="px-3 py-2">
              <EditableCell value={row.category} onChange={(v) => onUpdate(row.id, "category", v)} />
            </td>
            <td className="px-3 py-2">
              <EditableCell value={row.client} onChange={(v) => onUpdate(row.id, "client", v)} />
            </td>
            <td className="px-3 py-2">
              <EditableCell value={row.commune} onChange={(v) => onUpdate(row.id, "commune", v)} />
            </td>
            <td className="px-3 py-2">
              <DropdownCell value={row.workStatus} options={WORK_STATUS_OPTIONS} onChange={(v) => onUpdate(row.id, "workStatus", v)} colorMap={STATUS_COLORS} />
            </td>
            <td className="px-3 py-2">
              <DropdownCell value={row.billing} options={BILLING_OPTIONS} onChange={(v) => onUpdate(row.id, "billing", v)} />
            </td>
            <td className="px-3 py-2 whitespace-nowrap">{row.year}</td>
            <td className="px-3 py-2 max-w-[160px] text-muted-foreground">{row.team || "—"}</td>
            <td className="px-3 py-2 max-w-[200px]">
              <EditableCell value={row.notes} onChange={(v) => onUpdate(row.id, "notes", v)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Workload table ────────────────────────────────────────────

function WorkloadTable({ rows }: { rows: TeamRow[] }) {
  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Workload Code:</span>
        {([0, 1, 2, 3] as const).map((c) => (
          <span key={c} className={cn("rounded-full px-2.5 py-0.5 font-medium", WORKLOAD_COLORS[c])}>
            {c} — {WORKLOAD_LABELS[c]}
          </span>
        ))}
        <span className="ml-auto text-[10px]">Formula: 0 ≤2 active · 1 &gt;2 · 2 &gt;3 · 3 &gt;4 tasks</span>
      </div>

      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <tr>
            {["Team Member", "Role", "Total", "Doing", "Stuck", "Completed", "Workload Code"].map((h) => (
              <th key={h} className="border-b border-border px-4 py-2.5 text-left font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 text-muted-foreground capitalize">{row.role.replace(/_/g, " ")}</td>
              <td className="px-4 py-3 font-mono">{row.total}</td>
              <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">{row.doing}</td>
              <td className="px-4 py-3 font-mono text-red-600 dark:text-red-400">{row.stuck}</td>
              <td className="px-4 py-3 font-mono text-emerald-600 dark:text-emerald-400">{row.completed}</td>
              <td className="px-4 py-3">
                <span className={cn("rounded-full px-2.5 py-0.5 font-semibold text-xs", WORKLOAD_COLORS[row.workloadCode])}>
                  {row.workloadCode} — {WORKLOAD_LABELS[row.workloadCode]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Custom sheet table ────────────────────────────────────────

function CustomSheetTable({
  sheet,
  onUpdateCell,
  onDeleteRow,
  onAddRow,
  onAddColumn,
}: {
  sheet: CustomSheet;
  onUpdateCell: (rowIdx: number, col: string, val: string) => void;
  onDeleteRow: (rowIdx: number) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
}) {
  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <tr>
            <th className="border-b border-border w-8" />
            {sheet.columns.map((col) => (
              <th key={col} className="border-b border-border px-3 py-2.5 text-left font-semibold text-[11px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                {col}
              </th>
            ))}
            <th className="border-b border-border w-8">
              <button onClick={onAddColumn} className="p-1 hover:text-foreground text-muted-foreground/40 transition-colors" title="Add column">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-accent/20 group transition-colors">
              <td className="px-2 py-2">
                <button onClick={() => onDeleteRow(i)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </td>
              {sheet.columns.map((col) => (
                <td key={col} className="px-3 py-1.5 min-w-[120px]">
                  <EditableCell value={row[col] ?? ""} onChange={(v) => onUpdateCell(i, col, v)} />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={onAddRow}
        className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 w-full transition-colors border-b border-border/30"
      >
        <Plus className="h-3.5 w-3.5" />
        Add row
      </button>
    </div>
  );
}
