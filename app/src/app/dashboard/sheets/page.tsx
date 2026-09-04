"use client";

/**
 * WorkBook — the practice's boards.
 *
 * Projects is a Monday-style board (features/board, bound in
 * features/projects/client/projects-board): grouped, typed cells, editable
 * in place, each row's conversation a click away, and every change saved as
 * it is made. It replaced a flat table whose edits sat in browser memory
 * behind a "Sync to DB" button — a closed tab lost the afternoon's work, and
 * this is the surface the whole studio is meant to work in all day.
 *
 * Team Workload and the personal sheets are unchanged.
 */

import { useState, useEffect, useCallback } from "react";
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
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/ui/components/button";
import { cn } from "@/ui/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectsBoard } from "@/features/projects/client/projects-board";

// ─── Types ─────────────────────────────────────────────────────

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

// ─── Editable text cell (personal sheets) ──────────────────────

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

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    onChange(draft);
  };

  if (editing) {
    return (
      <input
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
      {value || <span className="text-friday-fg-subtle">—</span>}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────

export default function SheetsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [activeView, setActiveView] = useState<ActiveView>("projects");
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [customSheets, setCustomSheets] = useState<SheetMeta[]>([]);
  const [activeCustomSheet, setActiveCustomSheet] = useState<CustomSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [newSheetName, setNewSheetName] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const requestedSheetId = searchParams.get("sheet");

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
  }, [loadCustomSheets]);

  useEffect(() => {
    if (requestedSheetId) {
      setActiveView(requestedSheetId);
    }
  }, [requestedSheetId]);

  useEffect(() => {
    // The projects board loads and refreshes itself.
    if (activeView === "workload") loadWorkload();
    else if (activeView !== "projects") loadCustomSheetData(activeView);
  }, [activeView, loadWorkload, loadCustomSheetData]);

  // ── Export the current view ───────────────────────────────
  // Projects export lives on the board's own toolbar, beside the data.

  const exportCsv = () => {
    let wsData: unknown[][];
    let sheetName: string;

    if (activeView === "workload") {
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

    const csvCell = (value: unknown) => {
      let text = value == null ? "" : String(value);
      if (/^[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = wsData.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `DBS_${sheetName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    setSaving(true);
    await fetch(`/api/sheets/${activeCustomSheet.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: activeCustomSheet.name, columns: activeCustomSheet.columns, rows: activeCustomSheet.rows }),
    });
    setCustomSheets((prev) => prev.map((sheet) =>
      sheet.id === activeCustomSheet.id ? { ...sheet, name: activeCustomSheet.name } : sheet
    ));
    setSaving(false);
    setSaveResult("Saved");
    setTimeout(() => setSaveResult(null), 3000);
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

  const onProjects = activeView === "projects";
  const onWorkload = activeView === "workload";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-56 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            WorkBook
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Built-in boards */}
          <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Boards</p>
          {[
            { id: "projects", label: "Projects", icon: Table2 },
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
                "group flex items-center gap-1 pr-4 hover:bg-accent/60 transition-colors",
                activeView === s.id && "bg-accent font-medium"
              )}
            >
              <button
                onClick={() => setActiveView(s.id)}
                aria-current={activeView === s.id ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-1 px-4 py-2 text-left"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{s.name}</span>
              </button>
              <button
                onClick={() => deleteCustomSheet(s.id)}
                aria-label={`Delete ${s.name}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:text-destructive"
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
                aria-label="New sheet name"
                className="flex-1 text-xs bg-muted/40 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/50"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={createSheet} disabled={creatingSheet || !newSheetName.trim()} aria-label="Create sheet">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0 flex-col overflow-hidden">
        {onProjects ? (
          /* The board carries its own toolbar: search, grouping, export. */
          session?.user?.id ? (
            <ProjectsBoard currentUserId={session.user.id} />
          ) : (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )
        ) : (
          <>
            {/* Toolbar */}
            <div className="shrink-0 border-b border-border bg-card/80 px-5 py-3 flex items-center gap-3">
              <div className="flex-1">
                {onWorkload ? (
                  <h3 className="text-sm font-semibold">Team Workload</h3>
                ) : (
                  <input
                    value={activeCustomSheet?.name ?? ""}
                    onChange={(e) => updateCustomSheetName(e.target.value)}
                    placeholder="Sheet name"
                    aria-label="Sheet name"
                    className="w-full max-w-[320px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none transition-colors focus:border-border focus:bg-background"
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  {onWorkload
                    ? `${teamRows.length} team members`
                    : `${activeCustomSheet?.rows.length ?? 0} rows`}
                </p>
              </div>

              <AnimatePresence>
                {saveResult && (
                  <motion.span
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-friday-success-fg font-medium flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {saveResult}
                  </motion.span>
                )}
              </AnimatePresence>

              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  if (onWorkload) loadWorkload();
                  else if (activeCustomSheet) loadCustomSheetData(activeCustomSheet.id);
                }}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Refresh
              </Button>

              {!onWorkload && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={saveCustomSheet}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
              )}

              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            {/* Table area */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : onWorkload ? (
                <WorkloadTable rows={teamRows} />
              ) : activeCustomSheet ? (
                <CustomSheetTable
                  sheet={activeCustomSheet}
                  onUpdateCell={updateCustomCell}
                  onAddRow={addCustomRow}
                  onAddColumn={addCustomColumn}
                  onDeleteRow={deleteCustomRow}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Select a board or sheet
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Workload table ────────────────────────────────────────────

function WorkloadTable({ rows }: { rows: TeamRow[] }) {
  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <tr className="border-b border-border">
            {["Name", "Role", "Total", "Doing", "Stuck", "Completed", "Workload"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60 hover:bg-accent/30 transition-colors">
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.role}</td>
              <td className="px-3 py-2">{row.total}</td>
              <td className="px-3 py-2">{row.doing}</td>
              <td className="px-3 py-2">{row.stuck}</td>
              <td className="px-3 py-2">{row.completed}</td>
              <td className="px-3 py-2">
                <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-medium", WORKLOAD_COLORS[row.workloadCode])}>
                  {WORKLOAD_LABELS[row.workloadCode]}
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
  onAddRow,
  onAddColumn,
  onDeleteRow,
}: {
  sheet: CustomSheet;
  onUpdateCell: (rowIdx: number, col: string, val: string) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onDeleteRow: (rowIdx: number) => void;
}) {
  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <tr className="border-b border-border">
            {sheet.columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                {col}
              </th>
            ))}
            <th className="px-2 py-2 w-10">
              <button onClick={onAddColumn} aria-label="Add column" className="text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 hover:bg-accent/30 transition-colors group">
              {sheet.columns.map((col) => (
                <td key={col} className="px-3 py-1.5">
                  <EditableCell value={row[col] ?? ""} onChange={(v) => onUpdateCell(i, col, v)} />
                </td>
              ))}
              <td className="px-2 py-1.5">
                <button
                  onClick={() => onDeleteRow(i)}
                  aria-label={`Delete row ${i + 1}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={onAddRow}
        className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add row
      </button>
    </div>
  );
}
