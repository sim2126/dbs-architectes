"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/dialog";
import { Input } from "@/ui/components/input";
import { Label } from "@/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/select";
import { showToast } from "@/ui/components/toast";
import { GuestBadge } from "@/ui/components/guest-badge";
import { cn } from "@/ui/utils";
import { domainOf, isExternalAddress } from "../domain/guests";

const INVITABLE_ROLES = ["admin", "director", "manager", "employee", "intern"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const ROLE_LABEL: Record<InvitableRole, string> = {
  admin: "Admin",
  director: "Director",
  manager: "Manager",
  employee: "Member",
  intern: "Intern",
};

interface Invitation {
  id: string;
  email: string;
  role: string;
  isExternal: boolean;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  inviter: { name: string | null; initials: string | null } | null;
}

function relativeWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function PendingInvitations() {
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/invitations");
      if (!response.ok) {
        setItems([]);
        return;
      }
      const invitations = (await response.json()) as Invitation[];
      setItems(invitations.filter((invitation) => invitation.status === "pending"));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("invitations:refresh", refresh);
    return () => window.removeEventListener("invitations:refresh", refresh);
  }, [load]);

  const resend = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/invitations/${id}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? "Couldn't resend invitation", "danger");
        return;
      }
      const body = (await response.json()) as { inviteUrl: string | null };
      if (body.inviteUrl) {
        void navigator.clipboard?.writeText(body.inviteUrl).catch(() => {});
        showToast("Invite link copied (SMTP not configured)", "info");
      } else {
        showToast("Invitation re-sent");
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? "Couldn't revoke invitation", "danger");
        return;
      }
      showToast("Invitation revoked");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-friday-fg-muted m-0">
          {items.length} pending invitation{items.length === 1 ? "" : "s"}
        </h2>
      </div>
      <div className="border border-friday-border-soft rounded overflow-hidden">
        {items.map((invitation, index) => {
          const expired = new Date(invitation.expiresAt).getTime() < Date.now();
          return (
            <div
              key={invitation.id}
              className={cn(
                "grid items-center px-3.5 py-2.5 gap-3 text-[12px]",
                index < items.length - 1 && "border-b border-friday-border-soft",
              )}
              style={{ gridTemplateColumns: "2fr 1.1fr 1.4fr 1fr 1.2fr" }}
            >
              <span className="font-mono text-[11.5px] text-friday-fg truncate inline-flex items-center gap-2">
                <span className="truncate">{invitation.email}</span>
                {invitation.isExternal && <GuestBadge />}
              </span>
              <span className="text-friday-fg-muted">
                {ROLE_LABEL[invitation.role as InvitableRole] ?? invitation.role}
              </span>
              <span className="text-[11px] text-friday-fg-subtle">
                Invited {relativeWhen(invitation.createdAt)}
                {invitation.inviter?.name ? ` · by ${invitation.inviter.name}` : ""}
              </span>
              <span>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-px rounded-full text-[10px] font-medium tracking-wide"
                  style={
                    expired
                      ? { background: "var(--friday-surface-2)", color: "var(--friday-fg-subtle)" }
                      : { background: "rgba(30, 58, 138, 0.10)", color: "var(--friday-accent)" }
                  }
                >
                  {expired ? "expired" : "pending"}
                </span>
              </span>
              <span className="text-right space-x-2">
                {!expired && (
                  <>
                    <button
                      type="button"
                      onClick={() => resend(invitation.id)}
                      disabled={busyId === invitation.id}
                      className="text-[11px] text-friday-fg-muted hover:text-friday-fg transition-colors disabled:opacity-60"
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke(invitation.id)}
                      disabled={busyId === invitation.id}
                      className="text-[11px] text-red-600 hover:text-red-700 transition-colors disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("employee");
  const [markedExternal, setMarkedExternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("employee");
    setMarkedExternal(false);
    setError(null);
  }, [open]);

  const normalisedEmail = email.trim().toLowerCase();
  const addressForcesExternal =
    domainOf(normalisedEmail) !== null && isExternalAddress(normalisedEmail);
  const willBeGuest = markedExternal || addressForcesExternal;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalisedEmail,
          role: willBeGuest ? "employee" : role,
          isExternal: willBeGuest,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't send invitation.");
        return;
      }
      const body = (await response.json()) as { inviteUrl: string | null };
      onOpenChange(false);
      if (body.inviteUrl) {
        void navigator.clipboard?.writeText(body.inviteUrl).catch(() => {});
        showToast(
          `Invite link for ${normalisedEmail} copied to clipboard (SMTP not configured)`,
          "info",
        );
      } else {
        showToast(`Invite sent to ${normalisedEmail}`);
      }
      window.dispatchEvent(new CustomEvent("invitations:refresh"));
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            They&apos;ll get an email with a link to set their password and join. The link expires in 7 days.
          </p>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="alice@dbsarc.com"
              required
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={willBeGuest}
              disabled={addressForcesExternal}
              onChange={(event) => setMarkedExternal(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              Guest — outside the practice. Guests can only see conversations
              they are explicitly invited to.
            </span>
          </label>
          {addressForcesExternal && (
            <p className="text-xs text-muted-foreground">
              Addresses outside dbsarc.com are always invited as guests.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select
              value={willBeGuest ? "employee" : role}
              disabled={willBeGuest}
              onValueChange={(value) => setRole(value as InvitableRole)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>{ROLE_LABEL[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {willBeGuest
                ? "Guest access is conversation-only; staff roles and project access do not apply."
                : "Admins manage users and workspace settings. Directors and managers can run projects firm-wide. Members and interns are project-scoped."}
            </p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!email || submitting} className="flex-1">
              {submitting ? "Sending..." : "Send invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
