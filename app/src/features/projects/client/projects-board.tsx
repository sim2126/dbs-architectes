"use client";

/**
 * The projects board — the WorkBook's main surface.
 *
 * This is where the practice keeps its projects: every field editable in
 * place, grouped by phase, with each project's conversation one click away.
 * It binds the generic board (features/board) to real Project rows and the
 * real API. The board does the interaction; this file does the meaning.
 *
 * Two decisions worth naming:
 *
 *  - **There is no Save button.** A cell commits when you leave it, the row
 *    updates optimistically, and a refused or failed write puts the old
 *    value back with the server's own reason. The previous surface collected
 *    edits in browser memory behind a "Sync to DB" button, which meant a
 *    closed tab lost the afternoon's work.
 *
 *  - **What you may edit comes from the server.** Each row arrives with the
 *    caller's capabilities, so an unassigned employee sees status editable
 *    and the rest read-only, matching the policy exactly rather than
 *    approximately.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  Download,
  ExternalLink,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Table2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  applyView,
  Board,
  BoardControls,
  EMPTY_VIEW,
  Calendar,
  isFiltered,
  Kanban,
  toDayValue,
  useDismiss,
  ViewsMenu,
  type BoardCellValue,
  type BoardColumn,
  type BoardPerson,
  type BoardRow,
  type BoardView,
  type BulkAction,
  type SavedView,
} from "@/ui/board";
import { showToast } from "@/ui/components/toast";
import { cn, CATEGORIES, PHASES } from "@/ui/utils";
import {
  getPhaseColor,
  getPhaseOnColor,
  getStatusColor,
  getStatusOnColor,
} from "@/ui/tokens";
import { translatePhase, useT } from "@/i18n/translations";
import { getPusherClient } from "@/platform/integrations/pusher-client";
import { presenceChannelName, PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { ProjectThreadPanel } from "./project-thread-panel";

// ── Wire shape ───────────────────────────────────────────────────────────────

type Assignment = {
  userId: string;
  role?: string | null;
  user?: { id: string; name: string | null; initials: string | null; image?: string | null };
};

export type BoardProject = {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  category: string | null;
  client: string | null;
  commune: string | null;
  year: number | null;
  billing: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
  /** Messages in this project's conversation, for the row badge. */
  updateCount?: number;
  assignments: Assignment[];
  capabilities?: {
    read: boolean;
    update: boolean;
    updateStatus: boolean;
    assign: boolean;
  };
};

type RosterMember = {
  id: string;
  name: string | null;
  initials: string | null;
  image?: string | null;
  isExternal?: boolean;
};

const WORK_STATUS_LABELS: Record<string, string> = {
  todo: "status.not_started",
  doing: "status.working_on_it",
  stuck: "status.stuck",
  completed: "status.done",
};

const WORK_STATUSES = ["todo", "doing", "stuck", "completed"] as const;

/** Fields the board writes, and the capability each one needs. */
const STATUS_ONLY_FIELD = "workStatus";

export function ProjectsBoard({ currentUserId }: { currentUserId: string }) {
  const t = useT();
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupByKey, setGroupByKey] = useState<"phase" | "workStatus">("phase");
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [canAdd, setCanAdd] = useState(false);
  const [liveUpdates, setLiveUpdates] = useState(false);
  // Person, Filter, Sort and Hide, held for this session only. Nothing
  // here is persisted: a saved view is a board setting, not a preference,
  // and inventing one now would be guessing at the shape.
  const [view, setView] = useState<BoardView>(EMPTY_VIEW);
  // Table or Kanban. The same rows, groups and rules either way — only the
  // shape changes, so this is a layout choice rather than a second board.
  const [layout, setLayout] = useState<"table" | "kanban" | "calendar">("table");
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  // The saved view currently on screen, cleared the moment anything is
  // changed — a name should describe what you are looking at, not what you
  // were looking at before you touched a filter.
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?limit=500");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProjects((await res.json()) as BoardProject[]);
    } catch (error) {
      console.error("[board] projects failed to load", error);
      showToast("The board could not be loaded. Try refreshing.", "danger");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Several people at DBS have this board open at once. Without this, one of
   * them edits a row the others cannot see has moved, and the next person to
   * type into it silently overwrites the change.
   *
   * What arrives is an id, not a row: a socket subscribed a moment ago may
   * since have lost access, so the board re-reads through the API and gets
   * only what this caller may see. Reloads are coalesced, because a bulk
   * action on twenty rows announces twenty times.
   */
  useEffect(() => {
    const channelName = presenceChannelName();
    let client: ReturnType<typeof getPusherClient> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      client = getPusherClient();
      const channel = client.subscribe(channelName);
      channel.bind(PUSHER_EVENTS.PROJECT_CHANGED, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void load(), 400);
      });
      /*
       * Whether the board is actually live is worth saying out loud. Between
       * mount and subscription there is a second in which a change made
       * elsewhere is simply not delivered, and a dropped connection can last
       * much longer — a board that looks current but is not is worse than one
       * that admits it.
       */
      channel.bind("pusher:subscription_succeeded", () => setLiveUpdates(true));
      channel.bind("pusher:subscription_error", () => setLiveUpdates(false));
      client.connection.bind("state_change", ({ current }: { current: string }) => {
        if (current !== "connected") setLiveUpdates(false);
      });
    } catch (error) {
      // Pusher unconfigured: the board still works, it just is not live.
      console.error("[board] live updates unavailable", error);
    }
    return () => {
      if (timer) clearTimeout(timer);
      client?.unsubscribe(channelName);
    };
  }, [load]);

  /*
   * Come back to the tab and the board re-reads. Events that arrived while
   * the socket was down, or before it had subscribed, are gone for good, so
   * something has to close that gap; returning to the tab is the moment a
   * person is about to trust what they are looking at.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const loadSavedViews = useCallback(async () => {
    try {
      const res = await fetch("/api/board-views?board=projects&groupBy=phase");
      if (!res.ok) return;
      const data = (await res.json()) as { views: SavedView[] };
      setSavedViews(data.views ?? []);
    } catch {
      // Saved views are a convenience; the board works without them.
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    void loadSavedViews();
  }, [loadSavedViews]);

  const applySavedView = useCallback((saved: SavedView) => {
    setView(saved.state.view);
    setLayout(saved.state.layout);
    // The stored grouping is a plain string; only the two this board groups by
    // are honoured, so a view saved before a column was renamed degrades to
    // the default rather than emptying the board.
    setGroupByKey(saved.state.groupBy === "workStatus" ? "workStatus" : "phase");
    setActiveViewId(saved.id);
  }, []);

  const resetView = useCallback(() => {
    setView(EMPTY_VIEW);
    setLayout("table");
    setGroupByKey("phase");
    setActiveViewId(null);
  }, []);

  const saveCurrentView = useCallback(
    async (name: string) => {
      try {
        const res = await fetch("/api/board-views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            board: "projects",
            name,
            groupBy: groupByKey,
            state: { view, layout, groupBy: groupByKey },
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const saved = (await res.json()) as SavedView;
        await loadSavedViews();
        setActiveViewId(saved.id);
        showToast(`Saved as ${saved.name}`, "success");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "That view was not saved.", "danger");
      }
    },
    [view, layout, groupByKey, loadSavedViews],
  );

  const deleteSavedView = useCallback(
    async (saved: SavedView) => {
      setSavedViews((prev) => prev.filter((v) => v.id !== saved.id));
      setActiveViewId((current) => (current === saved.id ? null : current));
      const res = await fetch(`/api/board-views/${saved.id}`, { method: "DELETE" });
      if (!res.ok) {
        await loadSavedViews();
        showToast("That view was not deleted.", "danger");
      }
    },
    [loadSavedViews],
  );

  useEffect(() => {
    // Creating a project is a workspace right, not a per-row one, so the
    // server is asked directly. A failure hides the add row, which is the
    // safe direction: the API would refuse the write anyway.
    fetch("/api/projects/capabilities")
      .then((r) => (r.ok ? r.json() : { create: false }))
      .then((data: { create?: boolean }) => setCanAdd(data.create === true))
      .catch(() => setCanAdd(false));
  }, []);

  useEffect(() => {
    // The roster feeds the people picker. A failure only costs assigning,
    // so it degrades to an empty picker rather than an error.
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RosterMember[]) => setRoster(data.filter((m) => !m.isExternal)))
      .catch(() => setRoster([]));
  }, []);

  // ── Columns ────────────────────────────────────────────────────────────────

  const statusLabel = useCallback(
    (value: string) => t(WORK_STATUS_LABELS[value] ?? value, value),
    [t],
  );
  const phaseLabel = useCallback((value: string) => translatePhase(value, t), [t]);

  const columns = useMemo<BoardColumn[]>(
    () => [
      {
        key: "workStatus",
        label: t("projects.col.status", "Status"),
        kind: "status",
        width: 132,
        options: WORK_STATUSES,
        colorFor: getStatusColor,
        onColorFor: getStatusOnColor,
        labelFor: statusLabel,
      },
      {
        key: "phase",
        label: t("projects.col.phase", "Phase"),
        kind: "status",
        width: 148,
        options: PHASES,
        colorFor: getPhaseColor,
        onColorFor: getPhaseOnColor,
        labelFor: phaseLabel,
      },
      {
        key: "people",
        label: t("projects.col.assignees", "Team"),
        kind: "people",
        width: 122,
      },
      {
        key: "category",
        label: t("projects.col.category", "Category"),
        kind: "select",
        width: 132,
        options: CATEGORIES,
      },
      { key: "startDate", label: "Start", kind: "date", width: 118 },
      { key: "endDate", label: "End", kind: "date", width: 118 },
      { key: "client", label: "Client", kind: "text", width: 160 },
      { key: "commune", label: "Commune", kind: "text", width: 140 },
      { key: "year", label: "Year", kind: "number", width: 78 },
      { key: "billing", label: t("projects.col.billing", "Billing"), kind: "text", width: 110 },
      { key: "notes", label: "Notes", kind: "longtext", width: 200 },
      { key: "updatedAt", label: "Last updated", kind: "readonly", width: 118 },
    ],
    [phaseLabel, statusLabel, t],
  );

  const groupBy = useMemo<BoardColumn>(
    () => columns.find((c) => c.key === groupByKey) ?? columns[1],
    [columns, groupByKey],
  );

  // ── Rows ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) =>
      [p.title, p.code, p.client, p.commune, p.notes]
        .some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [projects, search]);

  const allRows = useMemo<BoardRow[]>(
    () =>
      filtered.map((project) => ({
        id: project.id,
        title: project.title,
        subtitle: project.code,
        cells: {
          workStatus: project.workStatus,
          phase: project.phase,
          category: project.category,
          client: project.client,
          commune: project.commune,
          year: project.year,
          billing: project.billing,
          notes: project.notes,
          // The board works in whole days; the record keeps a timestamp.
          startDate: project.startDate ? toDayValue(new Date(project.startDate)) : null,
          endDate: project.endDate ? toDayValue(new Date(project.endDate)) : null,
          updatedAt: relativeDay(project.updatedAt),
        },
        updateCount: project.updateCount,
        people: project.assignments.map((a) => ({
          id: a.userId,
          name: a.user?.name ?? null,
          initials: a.user?.initials ?? null,
          image: a.user?.image ?? null,
        })),
      })),
    [filtered],
  );

  const { rows, columns: visibleColumns } = useMemo(
    () => applyView(allRows, columns, view),
    [allRows, columns, view],
  );

  // ── Writes ─────────────────────────────────────────────────────────────────

  const patch = useCallback(
    async (id: string, field: string, value: BoardCellValue) => {
      const previous = projects.find((p) => p.id === id);
      if (!previous) return;

      const caps = previous.capabilities;
      const allowed =
        field === STATUS_ONLY_FIELD ? caps?.updateStatus ?? true : caps?.update ?? true;
      if (!allowed) {
        showToast(
          field === STATUS_ONLY_FIELD
            ? "Only assignees or managers can change status."
            : "You can change the status of this project, not its other fields.",
          "warning",
        );
        return;
      }

      // Optimistic: the cell shows the new value at once, and goes back if
      // the server refuses. Nothing is queued in memory.
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
      );

      try {
        const res = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const saved = (await res.json()) as Partial<BoardProject>;
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, ...saved, capabilities: p.capabilities, assignments: p.assignments } : p,
          ),
        );
      } catch (error) {
        setProjects((prev) => prev.map((p) => (p.id === id ? previous : p)));
        showToast(error instanceof Error ? error.message : "That change was not saved.", "danger");
      }
    },
    [projects],
  );

  const assign = useCallback(
    async (id: string, userId: string, action: "add" | "remove") => {
      const previous = projects.find((p) => p.id === id);
      if (!previous) return;
      if (previous.capabilities && !previous.capabilities.assign) {
        showToast("Only directors or project leads can change the team.", "warning");
        return;
      }
      const person = roster.find((m) => m.id === userId);

      setProjects((prev) =>
        prev.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                assignments:
                  action === "add"
                    ? [
                        ...p.assignments,
                        {
                          userId,
                          role: "editor",
                          user: {
                            id: userId,
                            name: person?.name ?? null,
                            initials: person?.initials ?? null,
                            image: person?.image ?? null,
                          },
                        },
                      ]
                    : p.assignments.filter((a) => a.userId !== userId),
              },
        ),
      );

      try {
        const res =
          action === "add"
            ? await fetch(`/api/projects/${id}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role: "editor" }),
              })
            : await fetch(`/api/projects/${id}/members/${userId}`, { method: "DELETE" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
      } catch (error) {
        setProjects((prev) => prev.map((p) => (p.id === id ? previous : p)));
        showToast(error instanceof Error ? error.message : "The team was not changed.", "danger");
      }
    },
    [projects, roster],
  );

  const addRow = useCallback(
    async (groupValue: string | null, title: string) => {
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The code is allocated by the server: the board asks for a name,
          // as Monday does, not for a reference number.
          body: JSON.stringify({
            title,
            ...(groupValue ? { [groupByKey]: groupValue } : {}),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const created = (await res.json()) as BoardProject;
        setProjects((prev) => [
          { ...created, assignments: created.assignments ?? [] },
          ...prev,
        ]);
        showToast(`${created.code} added`, "success");
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "That project was not created.",
          "danger",
        );
      }
    },
    [groupByKey],
  );

  /**
   * Export what is on screen, as the board sees it: the visible rows, the
   * visible columns, with the labels a reader would recognise rather than the
   * stored codes. Sits here rather than on the page toolbar because it is the
   * board's own data, and Monday puts it on the board too.
   *
   * A leading =, +, - or @ is prefixed with an apostrophe so a spreadsheet
   * opening the file treats it as text, not a formula.
   */
  const exportCsv = useCallback(() => {
    const header = ["Code", "Project", ...visibleColumns.map((c) => c.label)];
    const body = rows.map((row) => [
      row.subtitle ?? "",
      row.title,
      ...visibleColumns.map((column) => {
        if (column.kind === "people") return row.people.map((p) => p.name ?? "").join(", ");
        const value = row.cells[column.key];
        if (value === null || value === undefined || value === "") return "";
        return column.labelFor ? column.labelFor(String(value)) : String(value);
      }),
    ]);
    const cell = (value: unknown) => {
      let text = value == null ? "" : String(value);
      if (/^[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [header, ...body].map((line) => line.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `DBS_Projects_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [visibleColumns, rows]);

  const moveRow = useCallback(
    (rowId: string, groupValue: string | null) => {
      // The ungrouped bucket is not a destination: it is where rows with no
      // value land, and dropping into it would mean clearing the phase, which
      // is never what the gesture meant.
      if (groupValue === null) return;
      void patch(rowId, groupByKey, groupValue);
    },
    [patch, groupByKey],
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        label: "Set status",
        run: () => undefined,
        options: WORK_STATUSES.map((value) => ({
          value,
          label: statusLabel(value),
          color: getStatusColor(value),
        })),
        runOption: async (ids, value) => {
          for (const id of ids) await patch(id, "workStatus", value);
        },
      },
      {
        label: "Move to phase",
        run: () => undefined,
        options: PHASES.map((value) => ({
          value,
          label: phaseLabel(value),
          color: getPhaseColor(value),
        })),
        runOption: async (ids, value) => {
          for (const id of ids) await patch(id, "phase", value);
        },
      },
    ],
    [patch, phaseLabel, statusLabel],
  );

  // A row is editable if the caller may change anything on it at all; which
  // of its cells, cell by cell, is canEditCell's answer below.
  const canEditAnything = useMemo(
    () =>
      filtered.some(
        (p) => (p.capabilities?.update ?? true) || (p.capabilities?.updateStatus ?? true),
      ),
    [filtered],
  );

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  /**
   * The server's answer, applied cell by cell. An employee assigned to one
   * project as reviewer gets its status cell and nothing else; a lead on the
   * next row gets that whole row including its team. Nothing is offered that
   * the API would then refuse.
   */
  const canEditCell = useCallback(
    (row: { id: string }, column: { key: string }) => {
      const caps = byId.get(row.id)?.capabilities;
      if (!caps) return true;
      if (column.key === "people") return caps.assign;
      if (column.key === STATUS_ONLY_FIELD) return caps.updateStatus;
      return caps.update;
    },
    [byId],
  );

  const groupMenuRef = useDismiss<HTMLDivElement>(useCallback(() => setGroupMenuOpen(false), []));
  const overflowRef = useDismiss<HTMLDivElement>(useCallback(() => setOverflowOpen(false), []));

  const openProject = openItemId ? projects.find((p) => p.id === openItemId) ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Board toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-friday-border-soft px-4 py-2.5">
        <ViewsMenu
          views={savedViews}
          columns={columns}
          activeId={activeViewId}
          onApply={applySavedView}
          onReset={resetView}
          onSave={saveCurrentView}
          onDelete={deleteSavedView}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-friday-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this board"
            aria-label="Search the board"
            className="h-8 w-56 rounded-md border border-friday-border-soft bg-friday-surface pl-8 pr-3 text-[12.5px] text-friday-fg outline-none transition-colors placeholder:text-friday-fg-subtle focus:border-friday-accent"
          />
        </div>

        {/* One button rather than a label and two toggles: the toolbar has
            four control groups on it now, and the words were wrapping. */}
        <div ref={groupMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setGroupMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={groupMenuOpen}
            aria-label={`Group by ${groupBy.label}`}
            className="flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[12px] text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
          >
            Group
            <span className="font-medium text-friday-fg">{groupBy.label}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {groupMenuOpen && (
            <div
              role="menu"
              aria-label="Group by"
              className="absolute left-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
            >
              {(
                [
                  { key: "phase" as const, label: t("projects.col.phase", "Phase") },
                  { key: "workStatus" as const, label: t("projects.col.status", "Status") },
                ]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={groupByKey === key}
                  onClick={() => {
                    setGroupByKey(key);
                    setActiveViewId(null);
                    setGroupMenuOpen(false);
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] text-friday-fg transition-colors hover:bg-friday-surface-2"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <BoardControls
          columns={columns}
          roster={roster as BoardPerson[]}
          view={view}
          onChange={(next) => {
            setView(next);
            setActiveViewId(null);
          }}
        />

        <div className="flex items-center gap-1 rounded-md border border-friday-border-soft p-0.5">
          {(
            [
              { key: "table" as const, label: "Table", icon: Table2 },
              { key: "kanban" as const, label: "Kanban", icon: LayoutGrid },
              { key: "calendar" as const, label: "Calendar", icon: CalendarDays },
            ]
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setLayout(key);
                setActiveViewId(null);
              }}
              aria-pressed={layout === key}
              aria-label={`${label} view`}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-[11.5px] transition-colors",
                layout === key
                  ? "bg-friday-fg text-friday-bg"
                  : "text-friday-fg-subtle hover:text-friday-fg",
              )}
            >
              <Icon className="h-3 w-3" />
              {/* Only the current view is named. Three labelled buttons pushed
                  the toolbar past its width; each button keeps its full name
                  for a screen reader either way. */}
              {layout === key && label}
            </button>
          ))}
        </div>

        <span className="flex-1" />

        <span
          className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-friday-fg-subtle"
          aria-label={liveUpdates ? "Live updates on" : "Live updates unavailable"}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              liveUpdates ? "bg-friday-success-fg" : "bg-friday-fg-subtle",
            )}
          />
          {liveUpdates ? "Live" : "Not live"}
        </span>
        <span className="whitespace-nowrap text-[11px] text-friday-fg-subtle">
          <span aria-hidden>
            {rows.length} of {projects.length}
          </span>
          <span className="sr-only">
            {rows.length} of {projects.length} projects shown
          </span>
        </span>
        <div ref={overflowRef} className="relative">
          <button
            type="button"
            onClick={() => setOverflowOpen((o) => !o)}
            aria-label="Board actions"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            className="rounded-md p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {overflowOpen && (
            <div
              role="menu"
              aria-label="Board actions"
              className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOverflowOpen(false);
                  void load();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-friday-fg transition-colors hover:bg-friday-surface-2"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Refresh the board
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOverflowOpen(false);
                  exportCsv();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-friday-fg transition-colors hover:bg-friday-surface-2"
              >
                <Download className="h-3.5 w-3.5" />
                Export as CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && projects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-friday-fg-subtle">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the board
        </div>
      ) : layout === "calendar" ? (
        <Calendar
          rows={rows}
          colourBy={groupBy}
          startKey="startDate"
          endKey="endDate"
          onOpenRow={setOpenItemId}
          itemNoun="project"
        />
      ) : layout === "kanban" ? (
        <Kanban
          columns={visibleColumns}
          rows={rows}
          groupBy={groupBy}
          canEdit={canEditAnything}
          canEditCell={canEditCell}
          canAdd={canAdd}
          onCellChange={patch}
          onAddRow={addRow}
          onOpenRow={setOpenItemId}
          onOpenConversation={setOpenItemId}
          itemNoun="project"
          emptyNote={
            isFiltered(view) || search.trim() ? "Nothing here matches" : "No projects"
          }
        />
      ) : (
        <Board
          columns={visibleColumns}
          allColumns={columns}
          rows={rows}
          groupBy={groupBy}
          view={view}
          onViewChange={(next) => {
            setView(next);
            setActiveViewId(null);
          }}
          label="Projects"
          roster={roster as BoardPerson[]}
          canEdit={canEditAnything}
          canEditCell={canEditCell}
          canAdd={canAdd}
          onCellChange={patch}
          onAssign={assign}
          onAddRow={addRow}
          onMoveRow={moveRow}
          onOpenRow={setOpenItemId}
          onOpenConversation={setOpenItemId}
          bulkActions={bulkActions}
          itemNoun="project"
          emptyNote={
            isFiltered(view) || search.trim()
              ? "Nothing here matches"
              : "No projects in this group"
          }
        />
      )}

      {/* Item panel — the project's conversation, where Monday puts Updates. */}
      <AnimatePresence>
        {openProject && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenItemId(null)}
              className="fixed inset-0 z-40 bg-black/20"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              role="dialog"
              aria-label={`${openProject.title} updates`}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-friday-border bg-friday-bg shadow-2xl"
            >
              <div className="flex shrink-0 items-start gap-2 border-b border-friday-border-soft px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-friday-fg-subtle">
                    {openProject.code}
                  </p>
                  <h2 className="truncate font-display text-[17px] italic text-friday-fg">
                    {openProject.title}
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-friday-fg-subtle">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: getStatusColor(openProject.workStatus),
                        color: getStatusOnColor(openProject.workStatus),
                      }}
                    >
                      {statusLabel(openProject.workStatus)}
                    </span>
                    {phaseLabel(openProject.phase)}
                  </p>
                </div>
                <Link
                  href={`/dashboard/projects/${openProject.id}`}
                  className="rounded-md p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
                  aria-label={`Open the full page for ${openProject.title}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpenItemId(null)}
                  aria-label="Close updates"
                  className="rounded-md p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ProjectThreadPanel projectId={openProject.id} currentUserId={currentUserId} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Today", "Yesterday", or a short date — a board row has no space for more. */
function relativeDay(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return "Today";
  if (days === 0) return "Yesterday";
  if (days < 7) return `${days + 1} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
