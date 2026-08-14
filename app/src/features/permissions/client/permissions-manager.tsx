"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/ui/components/button";
import { Input } from "@/ui/components/input";
import { Avatar, AvatarFallback } from "@/ui/components/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/dialog";
import { showToast } from "@/ui/components/toast";
import { cn } from "@/ui/utils";
import type {
  GrantRow,
  PermissionSubjectRow,
} from "@/features/permissions/server/load-permission-grants";

interface Props {
  subjects: PermissionSubjectRow[];
  /** Actions an allow-grant may confer. Deny may target any action. */
  grantableActions: readonly string[];
  /** Full vocabulary — deny may target any of these. */
  allActions: readonly string[];
}

function initialsOf(row: PermissionSubjectRow["user"]): string {
  if (row.initials) return row.initials;
  const source = row.name ?? row.email;
  return source.slice(0, 2).toUpperCase();
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PermissionsManager({ subjects, grantableActions, allActions }: Props) {
  const [rows, setRows] = useState(subjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/permissions/grants");
    if (!res.ok) return;
    const data = (await res.json()) as { subjects: PermissionSubjectRow[] };
    setRows(data.subjects);
  }, []);

  const remove = useCallback(
    async (userId: string, action: string) => {
      const key = `${userId}:${action}`;
      setBusy(key);
      try {
        const res = await fetch(
          `/api/permissions/grants?userId=${encodeURIComponent(userId)}&action=${encodeURIComponent(action)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          showToast(body?.error ?? "Could not remove the override.", "danger");
          return;
        }
        await refresh();
        showToast("Override removed", "success");
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withGrants = rows.filter((r) => r.grants.length > 0);
    if (!q) return withGrants;
    return withGrants.filter(
      (r) =>
        (r.user.name ?? "").toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-display italic text-foreground text-xl leading-tight">
            Permission overrides
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Grants adjust a single person&rsquo;s access without changing their role.
            A denial always takes effect. A grant only widens actions that carry no
            project- or region-level scoping of their own.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Add override
        </Button>
      </div>

      {rows.some((r) => r.grants.length > 0) && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or email"
          className="max-w-sm"
        />
      )}

      {visible.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-foreground">No overrides in place</p>
          <p className="text-sm text-muted-foreground mt-1.5">
            Everyone&rsquo;s access currently follows their role.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border divide-y divide-border bg-card">
          {visible.map((row) => (
            <div key={row.user.id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {initialsOf(row.user)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {row.user.name ?? row.user.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.user.role}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5 pl-11">
                {row.grants.map((g) => (
                  <GrantChip
                    key={g.action}
                    grant={g}
                    busy={busy === `${row.user.id}:${g.action}`}
                    onRemove={() => remove(row.user.id, g.action)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddOverrideDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        people={rows}
        grantableActions={grantableActions}
        allActions={allActions}
        onSaved={async () => {
          setDialogOpen(false);
          await refresh();
        }}
      />
    </div>
  );
}

function GrantChip({
  grant,
  busy,
  onRemove,
}: {
  grant: GrantRow;
  busy: boolean;
  onRemove: () => void;
}) {
  const expiry = formatExpiry(grant.expiresAt);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs border",
        grant.effect === "deny"
          ? "border-friday-error-border bg-friday-error-bg text-friday-error-fg"
          : "border-border bg-secondary text-foreground",
      )}
      title={grant.reason ?? undefined}
    >
      <span className="font-mono">{grant.action}</span>
      <span className="text-muted-foreground">
        {grant.effect === "deny" ? "denied" : "granted"}
        {expiry ? ` · until ${expiry}` : ""}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${grant.action} override`}
        className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      </button>
    </span>
  );
}

function AddOverrideDialog({
  open,
  onOpenChange,
  people,
  grantableActions,
  allActions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: PermissionSubjectRow[];
  grantableActions: readonly string[];
  allActions: readonly string[];
  onSaved: () => void | Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  // A denial may target any action; a grant only the overridable set.
  const options = effect === "deny" ? allActions : grantableActions;

  const submit = async () => {
    if (!userId || !action) return;
    setSaving(true);
    try {
      const res = await fetch("/api/permissions/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action,
          effect,
          reason: reason.trim() || null,
          expiresAt: expiresAt || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        showToast(body?.error ?? "Could not save the override.", "danger");
        return;
      }
      setUserId("");
      setAction("");
      setReason("");
      setExpiresAt("");
      showToast("Override saved", "success");
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add override</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">Person</span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={cn(selectClass, "mt-1")}
            >
              <option value="">Select a person</option>
              {people.map((p) => (
                <option key={p.user.id} value={p.user.id}>
                  {p.user.name ?? p.user.email} — {p.user.role}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Effect</span>
              <select
                value={effect}
                onChange={(e) => {
                  setEffect(e.target.value as "allow" | "deny");
                  setAction("");
                }}
                className={cn(selectClass, "mt-1")}
              >
                <option value="allow">Grant</option>
                <option value="deny">Deny</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">Expires</span>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-muted-foreground">Action</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={cn(selectClass, "mt-1 font-mono")}
            >
              <option value="">Select an action</option>
              {options.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {effect === "allow" && (
              <span className="text-xs text-muted-foreground mt-1.5 block leading-relaxed">
                Only actions without project- or region-level scoping can be
                granted. Widening the others is a code change, not a setting.
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">Reason</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Covering for the studio lead until 30 September"
              className="mt-1"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!userId || !action || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save override
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
