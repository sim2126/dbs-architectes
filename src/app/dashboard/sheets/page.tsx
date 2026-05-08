"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { useSearchParams } from "next/navigation";
import { I } from "@/components/friday/icons";
import { AvatarStack } from "@/components/friday/avatar-stack";
import { showToast } from "@/components/toast";
import { getPhaseColor, getStatusColor } from "@/lib/friday-tokens";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
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
  team: { name: string; initials: string }[];
  notes: string;
  comments: number;
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

type ActiveView = "projects" | "workload" | string;

// ─── Constants ────────────────────────────────────────────────────
const PHASE_OPTIONS = [
  "ETUDE/AP",
  "CONCORSO",
  "MAE",
  "CHANTIER",
  "EXE/DG/DV/3D",
  "TERMINATO",
  "STUCK",
];

const STATUS_OPTIONS = ["todo", "doing", "stuck", "completed"];

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  doing: "Doing",
  stuck: "Stuck",
  completed: "Done",
};

function workloadCode(activeCount: number): number {
  if (activeCount > 4) return 3;
  if (activeCount > 3) return 2;
  if (activeCount > 2) return 1;
  return 0;
}

const WORKLOAD_LABELS: Record<number, string> = {
  0: "Available",
  1: "Steady",
  2: "Busy",
  3: "Overloaded",
};
const WORKLOAD_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: "#e8efe6", fg: "#3f6534" },
  1: { bg: "#fdf2dd", fg: "#9c6810" },
  2: { bg: "#fde4dd", fg: "#9b2c1a" },
  3: { bg: "#fcd1c8", fg: "#7a1f0d" },
};

// ─── Sheet picker ─────────────────────────────────────────────────
function SheetIcon({
  kind,
  size = 12,
  className,
}: {
  kind: "table" | "users" | "sheet";
  size?: number;
  className?: string;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  if (kind === "table")
    return (
      <svg {...props}>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
      </svg>
    );
  if (kind === "users")
    return (
      <svg {...props}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20a6 6 0 0112 0" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15 20a4 4 0 016-3.4" />
      </svg>
    );
  return (
    <svg {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M4 9h16M4 15h16" />
    </svg>
  );
}

function SheetRow({
  active,
  onSelect,
  icon,
  label,
  count,
}: {
  active: boolean;
  onSelect: () => void;
  icon: "table" | "users" | "sheet";
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 w-full pl-3 pr-3.5 py-1.5 border-0 text-left text-[12.5px] cursor-pointer transition-colors duration-150",
        active
          ? "bg-friday-surface-2 text-friday-fg font-medium"
          : "bg-transparent text-friday-fg-muted hover:bg-friday-surface hover:text-friday-fg",
      )}
      style={{
        borderLeft: `2px solid ${active ? "var(--friday-accent)" : "transparent"}`,
      }}
    >
      <SheetIcon kind={icon} />
      <span className="flex-1 truncate">{label}</span>
      {count != null ? (
        <span className="font-mono text-[9.5px] text-friday-fg-subtle">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SheetPicker({
  activeView,
  onSelect,
  customSheets,
  projectCount,
  teamCount,
  onCreateSheet,
}: {
  activeView: ActiveView;
  onSelect: (id: ActiveView) => void;
  customSheets: SheetMeta[];
  projectCount: number;
  teamCount: number;
  onCreateSheet: (name: string) => Promise<void>;
}) {
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const submit = async () => {
    if (!name.trim()) {
      setCreating(false);
      return;
    }
    await onCreateSheet(name.trim());
    setName("");
    setCreating(false);
  };

  return (
    <div className="w-[240px] shrink-0 border-r border-friday-border-soft bg-friday-bg flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-3.5 pb-1.5 text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-subtle font-medium">
          Live Views
        </div>
        <SheetRow
          active={activeView === "projects"}
          onSelect={() => onSelect("projects")}
          icon="table"
          label="Projects Status"
          count={projectCount}
        />
        <SheetRow
          active={activeView === "workload"}
          onSelect={() => onSelect("workload")}
          icon="users"
          label="Team Workload"
          count={teamCount}
        />

        <div className="h-3.5" />

        <div className="px-3.5 pb-1 flex items-center justify-between">
          <span className="text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-subtle font-medium">
            My Sheets
          </span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="New sheet"
            className="w-[18px] h-[18px] p-0 flex items-center justify-center bg-transparent border-0 cursor-pointer text-friday-fg-muted hover:bg-friday-surface-2 hover:text-friday-fg rounded-sm"
          >
            <I.Plus size={11} />
          </button>
        </div>

        {creating ? (
          <div className="px-3.5 pb-1">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  setName("");
                  setCreating(false);
                }
              }}
              placeholder="Sheet name"
              className="w-full h-7 px-2 border border-friday-accent rounded-[3px] bg-friday-surface text-[12px] text-friday-fg outline-none"
              style={{ boxShadow: "0 0 0 3px var(--friday-accent-ring)" }}
            />
          </div>
        ) : null}

        {customSheets.map((s) => (
          <SheetRow
            key={s.id}
            active={activeView === s.id}
            onSelect={() => onSelect(s.id)}
            icon="sheet"
            label={s.name}
          />
        ))}
      </div>
      <div className="border-t border-friday-border-soft px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-0 text-[11.5px] text-friday-fg-muted hover:text-friday-fg"
        >
          <I.Plus size={11} />
          Create from template
        </button>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────
function SheetsHeader({
  name,
  count,
  dirtyCount,
  syncing,
  onRefresh,
  onSync,
  onExport,
}: {
  name: string;
  count: number;
  dirtyCount: number;
  syncing: boolean;
  onRefresh: () => void;
  onSync: () => void;
  onExport: () => void;
}) {
  return (
    <div
      className="px-6 border-b border-friday-border-soft bg-friday-bg shrink-0 flex items-center gap-4"
      style={{ height: 60 }}
    >
      <div className="flex-1 min-w-0">
        <h1 className="font-display italic font-medium text-[18px] text-friday-fg m-0 -tracking-[0.2px] leading-tight">
          {name}
        </h1>
        <div className="text-[11px] text-friday-fg-muted mt-0.5 flex items-center gap-1.5">
          <span>{count} rows</span>
          <span className="text-friday-fg-subtle">·</span>
          <span style={{ color: dirtyCount > 0 ? "#a16207" : undefined }}>
            {dirtyCount === 0
              ? "0 unsaved changes"
              : `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
          </span>
          {dirtyCount > 0 ? (
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: "#e9b850" }}
            />
          ) : null}
        </div>
      </div>
      <button
        type="button"
        title="Refresh"
        onClick={onRefresh}
        className="w-8 h-8 p-0 flex items-center justify-center bg-transparent border border-friday-border-soft rounded cursor-pointer text-friday-fg-muted hover:bg-friday-surface hover:text-friday-fg"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4v6h6" />
          <path d="M20 12A8 8 0 116 6.3L4 10" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing || dirtyCount === 0}
        className={cn(
          "h-8 px-3 border border-friday-border-soft rounded text-[12px] font-medium flex items-center gap-1.5 hover:border-friday-border",
          syncing || dirtyCount === 0
            ? "bg-friday-surface-2 text-friday-fg-subtle cursor-default"
            : "bg-transparent text-friday-fg cursor-pointer",
        )}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h12M9 6l6 6-6 6" />
          <path d="M21 6v12" />
        </svg>
        {syncing ? "Syncing…" : "Sync to DB"}
      </button>
      <button
        type="button"
        onClick={onExport}
        className="h-8 px-3.5 bg-friday-accent text-white border-0 rounded text-[12px] font-medium flex items-center gap-1.5 cursor-pointer hover:opacity-90"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v12M6 10l6 6 6-6" />
          <path d="M4 20h16" />
        </svg>
        Export Excel
      </button>
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────
function SheetsToolbar({
  search,
  setSearch,
  density,
  setDensity,
  count,
}: {
  search: string;
  setSearch: (v: string) => void;
  density: "compact" | "comfortable";
  setDensity: (v: "compact" | "comfortable") => void;
  count: number;
}) {
  return (
    <div
      className="px-6 border-b border-friday-border-soft bg-friday-bg shrink-0 flex items-center gap-2"
      style={{ height: 44 }}
    >
      <div className="relative" style={{ width: 220 }}>
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none leading-none">
          <I.Search size={11} className="text-friday-fg-muted" />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rows…"
          className="w-full h-[26px] pl-7 pr-2 border border-friday-border-soft rounded-[3px] bg-friday-surface text-[11.5px] text-friday-fg outline-none focus:border-friday-border focus:ring-2 focus:ring-friday-accent-ring"
        />
      </div>
      <span className="flex-1" />
      <span className="font-mono text-[10px] text-friday-fg-subtle tracking-wide">
        {count} rows
      </span>
      <div
        className="flex h-[26px] border border-friday-border-soft rounded-[3px] bg-friday-surface overflow-hidden"
      >
        {(
          [
            { v: "compact" as const, l: "Compact" },
            { v: "comfortable" as const, l: "Comfortable" },
          ]
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setDensity(o.v)}
            className={cn(
              "px-2.5 border-0 text-[10.5px] font-medium cursor-pointer",
              density === o.v
                ? "bg-friday-fg text-friday-bg"
                : "bg-transparent text-friday-fg-muted",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Phase / Status pickers ───────────────────────────────────────
function PickerCell({
  value,
  options,
  onChange,
  colorFor,
  labelFor,
  shape,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  colorFor: (v: string) => string;
  labelFor: (v: string) => string;
  shape: "square" | "round";
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 h-[22px] px-2 border border-transparent hover:border-friday-border-soft rounded-full cursor-pointer text-[11px] text-friday-fg bg-transparent"
      >
        <span
          className={shape === "round" ? "w-2 h-2 rounded-full" : "w-2 h-2"}
          style={{ background: colorFor(value) }}
        />
        <span>{labelFor(value)}</span>
        <I.ChevDown size={9} className="text-friday-fg-muted" />
      </button>
      {open ? (
        <div
          className="absolute z-30 bg-friday-surface border border-friday-border rounded p-1"
          style={{
            top: 26,
            left: -2,
            minWidth: 200,
            boxShadow: "0 10px 30px rgba(20,18,12,0.16)",
          }}
        >
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(o);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 border-0 cursor-pointer text-left text-[11.5px] text-friday-fg rounded-sm",
                o === value ? "bg-friday-surface-2" : "hover:bg-friday-surface-2",
              )}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: colorFor(o) }}
              />
              <span>{labelFor(o)}</span>
              {o === value ? (
                <I.Check
                  size={11}
                  className="text-friday-fg-muted"
                  strokeWidth={2}
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Editable text cell ───────────────────────────────────────────
function EditableCell({
  value,
  onChange,
  mono,
  serif,
  fontSize,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  serif?: boolean;
  fontSize?: number;
  placeholder?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    setDraft(value);
  }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);
  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };
  const fontFamily = mono
    ? "var(--font-friday-mono), ui-monospace, monospace"
    : serif
      ? "var(--font-friday-display), Georgia, serif"
      : "var(--font-friday-sans), system-ui, sans-serif";
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full h-[22px] px-1.5 border border-friday-accent rounded-[3px] bg-friday-surface outline-none"
        style={{
          fontFamily,
          fontSize: fontSize ?? 12,
          color: "var(--friday-fg)",
          boxShadow: "0 0 0 3px var(--friday-accent-ring)",
        }}
      />
    );
  }
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="flex items-center cursor-text rounded-[3px] truncate hover:bg-friday-surface px-1.5"
      style={{
        height: 22,
        fontFamily,
        fontSize: fontSize ?? 12,
        color: value ? "var(--friday-fg)" : "var(--friday-fg-subtle)",
        fontStyle: serif ? "italic" : "normal",
        fontWeight: serif ? 500 : 400,
      }}
    >
      {value || placeholder || "—"}
    </div>
  );
}

// ─── Workbook grid ────────────────────────────────────────────────
const COLS = [
  { key: "dirty", label: "", width: 18, sticky: true },
  { key: "comm", label: "", width: 28, sticky: true },
  { key: "code", label: "Code", width: 110 },
  { key: "name", label: "Title", width: 220 },
  { key: "phase", label: "Phase", width: 150 },
  { key: "cat", label: "Category", width: 120 },
  { key: "client", label: "Client", width: 200 },
  { key: "commune", label: "Commune", width: 130 },
  { key: "status", label: "Work Status", width: 130 },
  { key: "billing", label: "Billing", width: 100 },
  { key: "year", label: "Year", width: 60 },
  { key: "team", label: "Team", width: 110 },
  { key: "notes", label: "Notes", width: 280 },
];

const COL_TEMPLATE = COLS.map((c) => `${c.width}px`).join(" ");

function HeaderRow() {
  return (
    <div
      className="sticky top-0 z-[5] grid bg-friday-surface-2 border-b border-friday-border"
      style={{ gridTemplateColumns: COL_TEMPLATE, height: 32 }}
    >
      {COLS.map((c) => (
        <div
          key={c.key}
          className="px-2.5 flex items-center text-[9.5px] tracking-[0.16em] uppercase text-friday-fg-muted font-medium border-r border-friday-border-soft"
        >
          {c.label}
        </div>
      ))}
    </div>
  );
}

function ProjectsGrid({
  rows,
  density,
  dirtyIds,
  search,
  onUpdate,
  onChat,
}: {
  rows: ProjectRow[];
  density: "compact" | "comfortable";
  dirtyIds: Set<string>;
  search: string;
  onUpdate: (id: string, field: keyof ProjectRow, value: string) => void;
  onChat: (r: ProjectRow) => void;
}) {
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  const rowH = density === "compact" ? 30 : 36;

  const filtered = React.useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q) ||
        r.commune.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="flex-1 overflow-auto bg-friday-bg">
      <div style={{ minWidth: 1700 }}>
        <HeaderRow />
        {filtered.map((r, i) => {
          const dirty = dirtyIds.has(r.id);
          const bg = i % 2 === 0 ? "var(--friday-bg)" : "#fbfaf6";
          return (
            <div
              key={r.id}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(-1)}
              className="relative grid border-b border-friday-border-soft"
              style={{
                gridTemplateColumns: COL_TEMPLATE,
                height: rowH,
                background: hoverIdx === i ? "var(--friday-surface-2)" : bg,
              }}
            >
              <Cell>
                <span
                  className="rounded-full ml-1"
                  style={{
                    width: 6,
                    height: 6,
                    background: dirty ? "#e9b850" : "transparent",
                  }}
                />
              </Cell>
              <Cell>
                {hoverIdx === i || r.comments > 0 ? (
                  <button
                    type="button"
                    onClick={() => onChat(r)}
                    title={
                      r.comments > 0
                        ? `${r.comments} message${r.comments === 1 ? "" : "s"}`
                        : "Open thread"
                    }
                    className={cn(
                      "w-[22px] h-[22px] p-0 flex items-center justify-center border rounded-[3px] cursor-pointer",
                      r.comments > 0
                        ? "bg-friday-surface border-friday-border-soft text-friday-fg"
                        : "bg-transparent border-transparent text-friday-fg-muted",
                    )}
                  >
                    <I.Chat size={11} />
                  </button>
                ) : null}
              </Cell>
              <Cell>
                <span className="font-mono text-[10.5px] text-friday-fg-muted tracking-wide truncate">
                  {r.code}
                </span>
              </Cell>
              <Cell>
                <EditableCell
                  value={r.title}
                  onChange={(v) => onUpdate(r.id, "title", v)}
                  serif
                  fontSize={13}
                />
              </Cell>
              <Cell>
                <PickerCell
                  value={r.phase}
                  options={PHASE_OPTIONS}
                  onChange={(v) => onUpdate(r.id, "phase", v)}
                  colorFor={getPhaseColor}
                  labelFor={(v) => v}
                  shape="round"
                />
              </Cell>
              <Cell>
                <EditableCell
                  value={r.category}
                  onChange={(v) => onUpdate(r.id, "category", v)}
                />
              </Cell>
              <Cell>
                <EditableCell
                  value={r.client}
                  onChange={(v) => onUpdate(r.id, "client", v)}
                />
              </Cell>
              <Cell>
                <EditableCell
                  value={r.commune}
                  onChange={(v) => onUpdate(r.id, "commune", v)}
                />
              </Cell>
              <Cell>
                <PickerCell
                  value={r.workStatus}
                  options={STATUS_OPTIONS}
                  onChange={(v) => onUpdate(r.id, "workStatus", v)}
                  colorFor={getStatusColor}
                  labelFor={(v) => STATUS_LABELS[v] ?? v}
                  shape="round"
                />
              </Cell>
              <Cell>
                <EditableCell
                  value={r.billing}
                  onChange={(v) => onUpdate(r.id, "billing", v)}
                  mono
                  fontSize={11}
                />
              </Cell>
              <Cell>
                <span className="font-mono text-[11px] text-friday-fg-muted">
                  {r.year}
                </span>
              </Cell>
              <Cell>
                {r.team.length > 0 ? (
                  <AvatarStack
                    members={r.team.slice(0, 3).map((t) => t.initials)}
                    extra={Math.max(0, r.team.length - 3)}
                    size={20}
                  />
                ) : null}
              </Cell>
              <Cell>
                <EditableCell
                  value={r.notes}
                  onChange={(v) => onUpdate(r.id, "notes", v)}
                  fontSize={11.5}
                  placeholder="Add a note…"
                />
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center px-1.5 border-r border-friday-border-soft min-w-0">
      {children}
    </div>
  );
}

// ─── Workload grid (read-only) ────────────────────────────────────
function WorkloadGrid({ rows }: { rows: TeamRow[] }) {
  const COL_TEMPLATE_WL = "1.6fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr 1.2fr";
  return (
    <div className="flex-1 overflow-auto bg-friday-bg">
      <div className="min-w-[800px]">
        <div
          className="sticky top-0 z-[5] grid bg-friday-surface-2 border-b border-friday-border px-6 items-center text-[9.5px] tracking-[0.16em] uppercase text-friday-fg-muted font-medium"
          style={{
            gridTemplateColumns: COL_TEMPLATE_WL,
            height: 32,
            gap: 12,
          }}
        >
          <span>Person</span>
          <span>Role</span>
          <span className="text-right">Total</span>
          <span className="text-right">Doing</span>
          <span className="text-right">Stuck</span>
          <span className="text-right">Done</span>
          <span className="text-right">Tier</span>
        </div>
        {rows.map((r, i) => {
          const tier = WORKLOAD_COLORS[r.workloadCode];
          return (
            <div
              key={r.id}
              className="grid items-center px-6 border-b border-friday-border-soft text-[12px] text-friday-fg"
              style={{
                gridTemplateColumns: COL_TEMPLATE_WL,
                height: 36,
                gap: 12,
                background: i % 2 === 0 ? "var(--friday-bg)" : "#fbfaf6",
              }}
            >
              <span className="truncate">{r.name}</span>
              <span className="text-friday-fg-muted truncate">{r.role}</span>
              <span className="text-right font-mono text-[11px]">{r.total}</span>
              <span className="text-right font-mono text-[11px] text-friday-fg-muted">
                {r.doing}
              </span>
              <span
                className="text-right font-mono text-[11px]"
                style={{
                  color: r.stuck > 0 ? "#9b2c1a" : "var(--friday-fg-subtle)",
                }}
              >
                {r.stuck}
              </span>
              <span className="text-right font-mono text-[11px] text-friday-fg-muted">
                {r.completed}
              </span>
              <span className="text-right">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: tier.bg, color: tier.fg }}
                >
                  {WORKLOAD_LABELS[r.workloadCode]}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Custom sheet grid ────────────────────────────────────────────
function CustomSheetGrid({
  sheet,
  onUpdateName,
  onUpdateCell,
  onAddRow,
  onAddCol,
  onDeleteRow,
}: {
  sheet: CustomSheet;
  onUpdateName: (v: string) => void;
  onUpdateCell: (rowIdx: number, col: string, val: string) => void;
  onAddRow: () => void;
  onAddCol: () => void;
  onDeleteRow: (rowIdx: number) => void;
}) {
  return (
    <div className="flex-1 overflow-auto bg-friday-bg p-6 flex flex-col gap-3">
      <div>
        <EditableCell
          value={sheet.name}
          onChange={onUpdateName}
          serif
          fontSize={20}
        />
      </div>
      <div className="border border-friday-border-soft rounded overflow-hidden bg-friday-surface">
        <div
          className="grid bg-friday-surface-2 border-b border-friday-border-soft text-[9.5px] tracking-[0.16em] uppercase text-friday-fg-muted font-medium items-center"
          style={{
            gridTemplateColumns: `36px ${sheet.columns.map(() => "minmax(140px, 1fr)").join(" ")}`,
          }}
        >
          <span />
          {sheet.columns.map((c) => (
            <span key={c} className="px-2.5 py-2">
              {c}
            </span>
          ))}
        </div>
        {sheet.rows.map((row, i) => (
          <div
            key={i}
            className="grid items-center border-b border-friday-border-soft last:border-b-0"
            style={{
              gridTemplateColumns: `36px ${sheet.columns.map(() => "minmax(140px, 1fr)").join(" ")}`,
              height: 36,
              background: i % 2 === 0 ? "var(--friday-bg)" : "#fbfaf6",
            }}
          >
            <button
              type="button"
              onClick={() => onDeleteRow(i)}
              aria-label="Delete row"
              className="bg-transparent border-0 cursor-pointer text-friday-fg-muted hover:text-[#9b2c1a] flex items-center justify-center"
            >
              <I.X size={11} />
            </button>
            {sheet.columns.map((c) => (
              <Cell key={c}>
                <EditableCell
                  value={row[c] ?? ""}
                  onChange={(v) => onUpdateCell(i, c, v)}
                  fontSize={11.5}
                />
              </Cell>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className="h-8 px-3 bg-transparent border border-friday-border-soft hover:border-friday-border rounded text-[11.5px] text-friday-fg cursor-pointer flex items-center gap-1.5"
        >
          <I.Plus size={11} />
          Add row
        </button>
        <button
          type="button"
          onClick={onAddCol}
          className="h-8 px-3 bg-transparent border border-friday-border-soft hover:border-friday-border rounded text-[11.5px] text-friday-fg cursor-pointer flex items-center gap-1.5"
        >
          <I.Plus size={11} />
          Add column
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function SheetsPage() {
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = React.useState<ActiveView>("projects");
  const [projectRows, setProjectRows] = React.useState<ProjectRow[]>([]);
  const [teamRows, setTeamRows] = React.useState<TeamRow[]>([]);
  const [customSheets, setCustomSheets] = React.useState<SheetMeta[]>([]);
  const [activeCustomSheet, setActiveCustomSheet] =
    React.useState<CustomSheet | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [dirtyProjectIds, setDirtyProjectIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [search, setSearch] = React.useState("");
  const [density, setDensity] = React.useState<"compact" | "comfortable">(
    "compact",
  );
  const requestedSheetId = searchParams.get("sheet");

  // ── Loaders ────────────────────────────────────────────────
  const loadProjects = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = (await res.json()) as Array<{
        id: string;
        code: string;
        title: string;
        phase: string;
        category: string;
        client?: string;
        commune?: string;
        workStatus: string;
        billing?: string;
        year?: number;
        notes?: string;
        assignments: { user: { name?: string | null; initials?: string | null } }[];
      }>;
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
          team: p.assignments
            .map((a) => ({
              name: a.user.name ?? "",
              initials:
                a.user.initials ??
                (a.user.name
                  ? a.user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()
                  : "??"),
            }))
            .filter((t) => t.name),
          notes: p.notes ?? "",
          comments: 0,
        })),
      );
      setDirtyProjectIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, projectsRes] = await Promise.all([
        fetch("/api/team"),
        fetch("/api/projects"),
      ]);
      const users = (await usersRes.json()) as Array<{
        id: string;
        name?: string | null;
        role: string;
      }>;
      const projects = (await projectsRes.json()) as Array<{
        workStatus: string;
        assignments: { userId: string }[];
      }>;
      const rows: TeamRow[] = users
        .map((u) => {
          const assigned = projects.filter((p) =>
            p.assignments.some((a) => a.userId === u.id),
          );
          const active = assigned.filter((p) => p.workStatus !== "completed");
          return {
            id: u.id,
            name: u.name ?? "—",
            role: u.role,
            total: assigned.length,
            doing: assigned.filter((p) => p.workStatus === "doing").length,
            stuck: assigned.filter((p) => p.workStatus === "stuck").length,
            completed: assigned.filter((p) => p.workStatus === "completed").length,
            workloadCode: workloadCode(active.length),
          };
        })
        .sort((a, b) => b.workloadCode - a.workloadCode);
      setTeamRows(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomSheets = React.useCallback(async () => {
    const res = await fetch("/api/sheets");
    const data = (await res.json()) as SheetMeta[];
    setCustomSheets(data);
  }, []);

  const loadCustomSheetData = React.useCallback(async (id: string) => {
    setLoading(true);
    const res = await fetch(`/api/sheets/${id}`);
    const data = (await res.json()) as CustomSheet;
    setActiveCustomSheet(data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadCustomSheets();
    loadProjects();
  }, [loadCustomSheets, loadProjects]);

  React.useEffect(() => {
    if (requestedSheetId) setActiveView(requestedSheetId);
  }, [requestedSheetId]);

  React.useEffect(() => {
    if (activeView === "projects") loadProjects();
    else if (activeView === "workload") loadWorkload();
    else loadCustomSheetData(activeView);
  }, [activeView, loadProjects, loadWorkload, loadCustomSheetData]);

  // ── Mutations ──────────────────────────────────────────────
  const updateProjectRow = (
    id: string,
    field: keyof ProjectRow,
    value: string,
  ) => {
    setProjectRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
    setDirtyProjectIds((prev) => new Set([...prev, id]));
  };

  const syncProjects = async () => {
    if (dirtyProjectIds.size === 0) return;
    setSyncing(true);
    try {
      const updates = projectRows
        .filter((r) => dirtyProjectIds.has(r.id))
        .map(({ id, phase, workStatus, billing, notes }) => ({
          id,
          phase,
          workStatus,
          billing,
          notes,
        }));
      const res = await fetch("/api/sheets/sync-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = (await res.json()) as { succeeded: number; failed: number };
      setDirtyProjectIds(new Set());
      showToast(
        `Synced ${data.succeeded} project${data.succeeded !== 1 ? "s" : ""}${
          data.failed > 0 ? ` (${data.failed} failed)` : ""
        }`,
      );
    } finally {
      setSyncing(false);
    }
  };

  const exportExcel = () => {
    let wsData: unknown[][];
    let sheetName: string;
    if (activeView === "projects") {
      sheetName = "Projects Status";
      wsData = [
        [
          "Code", "Title", "Phase", "Category", "Client", "Commune",
          "Work Status", "Billing", "Year", "Team", "Notes",
        ],
        ...projectRows.map((r) => [
          r.code, r.title, r.phase, r.category, r.client, r.commune,
          r.workStatus, r.billing, r.year,
          r.team.map((t) => t.name).join(", "),
          r.notes,
        ]),
      ];
    } else if (activeView === "workload") {
      sheetName = "Team Workload";
      wsData = [
        [
          "Name", "Role", "Total", "Doing", "Stuck", "Completed",
          "Workload Code", "Tier",
        ],
        ...teamRows.map((r) => [
          r.name, r.role, r.total, r.doing, r.stuck, r.completed,
          r.workloadCode, WORKLOAD_LABELS[r.workloadCode],
        ]),
      ];
    } else if (activeCustomSheet) {
      sheetName = activeCustomSheet.name.slice(0, 31);
      wsData = [
        activeCustomSheet.columns,
        ...activeCustomSheet.rows.map((row) =>
          activeCustomSheet.columns.map((col) => row[col] ?? ""),
        ),
      ];
    } else {
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(
      wb,
      `DBS_${sheetName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    showToast("Exported");
  };

  const refresh = () => {
    if (activeView === "projects") loadProjects();
    else if (activeView === "workload") loadWorkload();
    else loadCustomSheetData(activeView);
  };

  const createSheet = async (name: string) => {
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        columns: ["Column 1", "Column 2", "Column 3"],
        rows: [{}],
      }),
    });
    const sheet = (await res.json()) as { id: string };
    await loadCustomSheets();
    setActiveView(sheet.id);
  };

  const saveCustomSheet = async () => {
    if (!activeCustomSheet) return;
    setSyncing(true);
    await fetch(`/api/sheets/${activeCustomSheet.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activeCustomSheet.name,
        columns: activeCustomSheet.columns,
        rows: activeCustomSheet.rows,
      }),
    });
    setCustomSheets((prev) =>
      prev.map((s) =>
        s.id === activeCustomSheet.id ? { ...s, name: activeCustomSheet.name } : s,
      ),
    );
    setSyncing(false);
    showToast("Saved");
  };

  // ── Render ─────────────────────────────────────────────────
  const sheetName =
    activeView === "projects"
      ? "Projects Status"
      : activeView === "workload"
        ? "Team Workload"
        : activeCustomSheet?.name ?? "Sheet";

  const count =
    activeView === "projects"
      ? projectRows.length
      : activeView === "workload"
        ? teamRows.length
        : activeCustomSheet?.rows.length ?? 0;

  const dirtyCount = activeView === "projects" ? dirtyProjectIds.size : 0;

  return (
    <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden bg-friday-bg">
      <SheetPicker
        activeView={activeView}
        onSelect={setActiveView}
        customSheets={customSheets}
        projectCount={projectRows.length}
        teamCount={teamRows.length}
        onCreateSheet={createSheet}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <SheetsHeader
          name={sheetName}
          count={count}
          dirtyCount={dirtyCount}
          syncing={syncing}
          onRefresh={refresh}
          onSync={
            activeView === "projects"
              ? syncProjects
              : activeView === "workload"
                ? () => showToast("Workload is read-only")
                : saveCustomSheet
          }
          onExport={exportExcel}
        />
        {activeView === "projects" ? (
          <SheetsToolbar
            search={search}
            setSearch={setSearch}
            density={density}
            setDensity={setDensity}
            count={projectRows.length}
          />
        ) : null}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[12px] text-friday-fg-muted">
            Loading…
          </div>
        ) : activeView === "projects" ? (
          <ProjectsGrid
            rows={projectRows}
            density={density}
            dirtyIds={dirtyProjectIds}
            search={search}
            onUpdate={updateProjectRow}
            onChat={(r) => {
              window.location.href = `/dashboard/chat?project=${r.id}&code=${encodeURIComponent(r.code)}`;
            }}
          />
        ) : activeView === "workload" ? (
          <WorkloadGrid rows={teamRows} />
        ) : activeCustomSheet ? (
          <CustomSheetGrid
            sheet={activeCustomSheet}
            onUpdateName={(v) => {
              setActiveCustomSheet((prev) =>
                prev ? { ...prev, name: v.slice(0, 100) } : prev,
              );
              setCustomSheets((prev) =>
                prev.map((s) =>
                  s.id === activeCustomSheet.id ? { ...s, name: v.slice(0, 100) } : s,
                ),
              );
            }}
            onUpdateCell={(rowIdx, col, val) => {
              setActiveCustomSheet((prev) => {
                if (!prev) return prev;
                const rows = prev.rows.map((r, i) =>
                  i === rowIdx ? { ...r, [col]: val } : r,
                );
                return { ...prev, rows };
              });
            }}
            onAddRow={() => {
              setActiveCustomSheet((prev) =>
                prev ? { ...prev, rows: [...prev.rows, {}] } : prev,
              );
            }}
            onAddCol={() => {
              setActiveCustomSheet((prev) => {
                if (!prev) return prev;
                const name = `Column ${prev.columns.length + 1}`;
                return { ...prev, columns: [...prev.columns, name] };
              });
            }}
            onDeleteRow={(rowIdx) => {
              setActiveCustomSheet((prev) =>
                prev
                  ? {
                      ...prev,
                      rows: prev.rows.filter((_, i) => i !== rowIdx),
                    }
                  : prev,
              );
            }}
          />
        ) : null}
      </div>

    </div>
  );
}
