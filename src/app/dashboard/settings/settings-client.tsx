"use client";

import { useEffect, useState } from "react";
import { showToast } from "@/ui/components/toast";
import { Avatar } from "@/ui/friday/avatar";
import { I } from "@/ui/friday/icons";
import {
  Panel,
  Field,
  TextInput,
  Select,
  ToggleRow,
  RadioGroup,
} from "@/ui/friday/forms";
import { cn } from "@/ui/utils";
import { useLanguageStore, type Language } from "@/i18n/language-store";
import { ACTIONS, type Action } from "@/platform/authz/actions";
import { authorize, type Resource, type Subject } from "@/platform/authz/authorize";

// ─── Sub-nav data ─────────────────────────────────────────────────
const NAV_GROUPS: { label: string; items: { id: string; label: string; admin?: boolean }[] }[] = [
  {
    label: "Profile",
    items: [
      { id: "profile", label: "Profile" },
      { id: "notifications", label: "Notifications" },
      { id: "language", label: "Language" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "general", label: "General", admin: true },
      { id: "branding", label: "Branding", admin: true },
      { id: "members", label: "Members", admin: true },
      { id: "permissions", label: "Permissions", admin: true },
    ],
  },
  {
    label: "Billing",
    items: [
      { id: "plan", label: "Plan", admin: true },
      { id: "invoices", label: "Invoices", admin: true },
      { id: "apiusage", label: "API usage", admin: true },
    ],
  },
  {
    label: "Integrations",
    items: [{ id: "integrations", label: "Connected services" }],
  },
];

// ─── Sub-nav ──────────────────────────────────────────────────────
function SubNav({
  active,
  onSelect,
  isAdmin,
}: {
  active: string;
  onSelect: (id: string) => void;
  isAdmin: boolean;
}) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-friday-border-soft bg-friday-bg py-6 overflow-y-auto">
      {NAV_GROUPS.map((g) => {
        const visible = g.items.filter((it) => !it.admin || isAdmin);
        if (visible.length === 0) return null;
        return (
          <div key={g.label} className="mb-[22px]">
            <h3 className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-friday-fg-muted m-0 px-6 pb-2">
              {g.label}
            </h3>
            {visible.map((it) => {
              const isActive = active === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelect(it.id)}
                  className={cn(
                    "relative flex items-center gap-2 w-full h-[30px] px-6 bg-transparent border-0 cursor-pointer text-left text-[12.5px] transition-colors duration-100",
                    isActive
                      ? "text-friday-fg font-medium"
                      : "text-friday-fg-muted hover:text-friday-fg",
                  )}
                >
                  {isActive ? (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-friday-accent rounded-sm" />
                  ) : null}
                  {it.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}

// ─── Profile ──────────────────────────────────────────────────────
type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  defaultCountry: string;
};

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "·";
}

function ProfilePanel() {
  const [data, setData] = useState<ProfileForm | null>(null);
  const [orig, setOrig] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me");
        if (!res.ok) throw new Error("load failed");
        const u = await res.json() as Partial<ProfileForm> & { defaultCountry?: string | null };
        if (cancelled) return;
        const next: ProfileForm = {
          name: u.name ?? "",
          email: u.email ?? "",
          phone: u.phone ?? "",
          defaultCountry: u.defaultCountry ?? "",
        };
        setData(next);
        setOrig(next);
      } catch {
        if (!cancelled) showToast("Couldn't load profile", "danger");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = data !== null && orig !== null && JSON.stringify(data) !== JSON.stringify(orig);

  const set =
    <K extends keyof ProfileForm>(k: K) =>
    (v: string) => {
      if (!data) return;
      setData({ ...data, [k]: v });
    };

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          defaultCountry: data.defaultCountry || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setOrig(data);
      showToast("Profile saved");
    } catch {
      showToast("Couldn't save — try again", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Panel title="Profile" description="Personal information shown to your team.">
        <div className="text-[12px] text-friday-fg-muted italic">Loading…</div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Profile"
      description="Personal information shown to your team."
      dirty={dirty}
      onSave={save}
      onCancel={() => orig && setData(orig)}
    >
      <div className="grid gap-[18px] items-start" style={{ gridTemplateColumns: "120px 1fr 1fr" }}>
        <div className="flex flex-col items-center gap-2">
          <Avatar initials={initialsFrom(data.name)} size={88} />
          <button
            type="button"
            className="bg-transparent border-0 p-0 text-friday-accent text-[11px] font-medium cursor-pointer opacity-50 cursor-not-allowed"
            title="Photo upload coming soon"
            disabled
          >
            Change photo
          </button>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3.5">
          <Field label="Full name">
            <TextInput value={data.name} onChange={set("name")} />
          </Field>
          <Field label="Email" hint="Contact an admin to change your email.">
            <TextInput value={data.email} onChange={() => {}} mono disabled />
          </Field>
          <Field label="Phone">
            <TextInput value={data.phone} onChange={set("phone")} mono />
          </Field>
          <Field label="Default country">
            <Select
              value={data.defaultCountry || ""}
              onChange={set("defaultCountry")}
              options={[
                { v: "", l: "— not set —" },
                { v: "CH", l: "Switzerland" },
                { v: "IT", l: "Italy" },
                { v: "IN", l: "India" },
                { v: "FR", l: "France" },
              ]}
            />
          </Field>
        </div>
      </div>
    </Panel>
  );
}

// ─── Notifications ────────────────────────────────────────────────
function NotificationsPanel() {
  const [n, setN] = useState({ updates: true, mentions: true, agenda: true, digest: false });
  const set =
    <K extends keyof typeof n>(k: K) =>
    (v: boolean) => {
      setN({ ...n, [k]: v });
      showToast(v ? "Enabled" : "Disabled");
    };

  return (
    <Panel
      title="Notifications"
      description="Pick what you'd like to hear about. Changes save instantly."
    >
      <div className="flex flex-col gap-2">
        <ToggleRow
          label="Project updates"
          hint="When a project you follow changes phase or status."
          value={n.updates}
          onChange={set("updates")}
        />
        <ToggleRow
          label="@mentions"
          hint="When someone mentions you in a thread or comment."
          value={n.mentions}
          onChange={set("mentions")}
        />
        <ToggleRow
          label="Agenda reminders"
          hint="15 min before scheduled meetings."
          value={n.agenda}
          onChange={set("agenda")}
        />
        <ToggleRow
          label="Weekly digest"
          hint="Friday evening recap of the week."
          value={n.digest}
          onChange={set("digest")}
        />
      </div>
    </Panel>
  );
}

// ─── Language ─────────────────────────────────────────────────────
const LANG_OPTIONS: { v: Language; l: string }[] = [
  { v: "en", l: "English" },
  { v: "fr", l: "Français" },
  { v: "it", l: "Italiano" },
  { v: "de", l: "Deutsch" },
];

function LanguagePanel() {
  // Drive the same Zustand store that the topbar switcher uses, so changes
  // here propagate everywhere instantly (and survive reload via persist).
  const { language, setLanguage } = useLanguageStore();

  return (
    <Panel
      title="Language"
      description="Interface language. Project content stays in the language it was written in."
    >
      <RadioGroup
        value={language}
        options={LANG_OPTIONS.map((o) => ({ v: o.v, l: o.l }))}
        onChange={(v) => {
          const code = v as Language;
          setLanguage(code);
          const label = LANG_OPTIONS.find((o) => o.v === code)?.l ?? code.toUpperCase();
          showToast(`Language: ${label}`);
        }}
      />
    </Panel>
  );
}

// ─── Workspace > General ──────────────────────────────────────────
function GeneralPanel() {
  const [name, setName] = useState("DBS Architecture & Engineering");
  const [orig, setOrig] = useState(name);
  const dirty = name !== orig;
  return (
    <Panel
      title="General"
      description="Workspace-wide settings."
      dirty={dirty}
      onSave={() => {
        setOrig(name);
        showToast("Workspace saved");
      }}
      onCancel={() => setName(orig)}
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Workspace name">
          <TextInput value={name} onChange={setName} />
        </Field>
        <Field label="Workspace URL" hint="dbs.friday.work — contact support to change.">
          <TextInput value="dbs.friday.work" onChange={() => {}} mono disabled />
        </Field>
        <Field label="Time zone">
          <Select
            value="europe/zurich"
            onChange={() => {}}
            options={[
              { v: "europe/zurich", l: "Europe/Zurich (UTC+2)" },
              { v: "europe/rome", l: "Europe/Rome (UTC+2)" },
              { v: "asia/kolkata", l: "Asia/Kolkata (UTC+5:30)" },
            ]}
          />
        </Field>
        <Field label="Week starts on">
          <Select
            value="monday"
            onChange={() => {}}
            options={[
              { v: "monday", l: "Monday" },
              { v: "sunday", l: "Sunday" },
            ]}
          />
        </Field>
      </div>
    </Panel>
  );
}

// ─── Workspace > Branding ─────────────────────────────────────────
function BrandingPanel() {
  const palette = ["#1e3a8a", "#7a8b6f", "#c4994a", "#5a3a3a", "#2a3a3a", "#1a1a18"];
  const [color, setColor] = useState(palette[0]);
  const [orig, setOrig] = useState(color);
  const dirty = color !== orig;

  return (
    <Panel
      title="Branding"
      description="Logo and colors for emails, exports, and shared links."
      dirty={dirty}
      onSave={() => {
        setOrig(color);
        showToast("Branding saved");
      }}
      onCancel={() => setColor(orig)}
    >
      <div className="grid grid-cols-2 gap-[18px]">
        <Field label="Logo" hint="SVG or PNG, transparent background, ≤ 200KB.">
          <div className="w-full h-[100px] border-[1.5px] border-dashed border-friday-border rounded bg-friday-surface flex items-center justify-center gap-2.5 cursor-pointer">
            <div className="w-[50px] h-[50px] rounded-[3px] bg-friday-fg text-friday-bg flex items-center justify-center font-display italic font-medium text-[22px]">
              D
            </div>
            <div>
              <div className="text-[11.5px] text-friday-fg font-medium">dbs-mark.svg</div>
              <button
                type="button"
                className="bg-transparent border-0 p-0 text-friday-accent text-[10.5px] cursor-pointer"
              >
                Replace
              </button>
            </div>
          </div>
        </Field>
        <Field label="Primary color" hint="Used for accents, buttons, and the focus ring.">
          <div className="flex gap-2 flex-wrap items-center">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-[30px] h-[30px] rounded-[3px] cursor-pointer p-0"
                style={{
                  background: c,
                  border: `2px solid ${color === c ? "var(--friday-fg)" : "transparent"}`,
                }}
                aria-label={`Color ${c}`}
              />
            ))}
            <span className="font-mono text-[11px] text-friday-fg-muted py-1 px-2 bg-friday-surface rounded-[3px] ml-1.5">
              {color}
            </span>
          </div>
        </Field>
      </div>
    </Panel>
  );
}

// ─── Workspace > Members ──────────────────────────────────────────
// Roles offered in the picker. Legacy aliases (super_admin, project_manager,
// viewer, collaborator) are still supported in the DB and display as their
// canonical label, but new role assignments only use the five below.
const PICKABLE_ROLES = ["admin", "director", "manager", "employee", "intern"] as const;
type PickableRole = (typeof PICKABLE_ROLES)[number];

const ROLE_LABEL: Record<string, string> = {
  super_admin:     "Admin",
  admin:           "Admin",
  director:        "Director",
  manager:         "Manager",
  project_manager: "Manager",
  employee:        "Member",
  collaborator:    "Member",
  intern:          "Intern",
  viewer:          "Viewer",
};

type MemberRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;            // raw role value as stored in DB
  isActive: boolean;
  joined: string;          // formatted createdAt
  you: boolean;
};

function joinedShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function MembersPanel({
  onInvite,
  currentUserId,
}: {
  onInvite: () => void;
  currentUserId: string;
}) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    name: string;
    from: string;
    to: PickableRole;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("load failed");
        const raw = (await res.json()) as Array<{
          id: string;
          name: string | null;
          email: string;
          initials: string | null;
          role: string;
          isActive: boolean;
          createdAt: string;
        }>;
        if (cancelled) return;
        setMembers(
          raw.map((u) => ({
            id: u.id,
            name: u.name ?? u.email.split("@")[0],
            email: u.email,
            initials: u.initials ?? (u.name ?? "·").slice(0, 2).toUpperCase(),
            role: u.role,
            isActive: u.isActive,
            joined: joinedShort(u.createdAt),
            you: u.id === currentUserId,
          })),
        );
      } catch {
        if (!cancelled) showToast("Couldn't load team", "danger");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const requestRoleChange = (id: string, newRole: PickableRole) => {
    const m = members?.find((x) => x.id === id);
    if (!m || m.role === newRole) return;
    if (m.you) {
      showToast("You can't change your own role here.", "warning");
      return;
    }
    setConfirm({ id, name: m.name, from: ROLE_LABEL[m.role] ?? m.role, to: newRole });
  };

  const applyRoleChange = async () => {
    if (!confirm) return;
    setSavingId(confirm.id);
    try {
      const res = await fetch(`/api/users/${confirm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: confirm.to }),
      });
      if (!res.ok) {
        // The new authz layer puts the human-readable deny reason in
        // body.error — surface it directly instead of a generic message.
        let reason = "Couldn't change role — try again";
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) reason = j.error;
        } catch {
          /* fall through to generic */
        }
        showToast(reason, "danger");
        return;
      }
      setMembers((ms) =>
        ms?.map((m) => (m.id === confirm.id ? { ...m, role: confirm.to } : m)) ?? null,
      );
      showToast(`${confirm.name} is now ${ROLE_LABEL[confirm.to]}`);
      setConfirm(null);
    } catch {
      showToast("Couldn't change role — network error", "danger");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Panel
      title="Members"
      description={
        members === null
          ? "Loading…"
          : `${members.length} ${members.length === 1 ? "person" : "people"} in your workspace.`
      }
      footer={
        <button
          type="button"
          onClick={onInvite}
          className="h-[30px] px-3.5 bg-friday-accent text-white border-0 rounded-[3px] text-[11.5px] font-medium cursor-pointer inline-flex items-center gap-1.5 tracking-wide hover:opacity-90 transition-opacity"
        >
          <I.Plus size={11} strokeWidth={2.2} />
          Invite member
        </button>
      }
    >
      <div className="border border-friday-border-soft rounded overflow-hidden">
        <div
          className="grid px-3.5 py-2.5 bg-friday-surface-2 border-b border-friday-border-soft text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-muted font-semibold gap-3"
          style={{ gridTemplateColumns: "2fr 2fr 1.1fr 1fr 0.7fr" }}
        >
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Joined</span>
          <span>Status</span>
        </div>
        {members === null ? (
          <div className="px-3.5 py-6 text-[12px] text-friday-fg-muted italic">Loading team…</div>
        ) : members.length === 0 ? (
          <div className="px-3.5 py-6 text-[12px] text-friday-fg-muted italic">No members yet.</div>
        ) : (
          members.map((m, i) => {
            const isRoleSaving = savingId === m.id;
            const pickerValue = (PICKABLE_ROLES as readonly string[]).includes(m.role)
              ? m.role
              : ""; // Legacy role — picker shows "Change role to…" placeholder
            return (
              <div
                key={m.id}
                className={cn(
                  "grid px-3.5 py-3 text-[12px] text-friday-fg items-center gap-3",
                  i < members.length - 1 ? "border-b border-friday-border-soft" : "",
                  !m.isActive && "opacity-60",
                )}
                style={{ gridTemplateColumns: "2fr 2fr 1.1fr 1fr 0.7fr" }}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <Avatar initials={m.initials} size={24} />
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis">{m.name}</span>
                  {m.you ? (
                    <span className="text-[9.5px] text-friday-fg-muted px-1.5 py-px bg-friday-surface-2 rounded-full">
                      you
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[11px] text-friday-fg-muted whitespace-nowrap overflow-hidden text-ellipsis">
                  {m.email}
                </span>
                <span>
                  <select
                    value={pickerValue}
                    onChange={(e) => requestRoleChange(m.id, e.target.value as PickableRole)}
                    disabled={m.you || isRoleSaving}
                    title={
                      m.you
                        ? "Ask another admin to change your role"
                        : pickerValue === ""
                          ? `Current: ${ROLE_LABEL[m.role] ?? m.role} — pick a new role`
                          : undefined
                    }
                    className={cn(
                      "h-[26px] pl-2 pr-6 bg-friday-bg text-friday-fg border border-friday-border-soft rounded-[3px] text-[11px] appearance-none",
                      m.you || isRoleSaving ? "opacity-60 cursor-default" : "cursor-pointer",
                    )}
                  >
                    {pickerValue === "" && (
                      <option value="" disabled>
                        {ROLE_LABEL[m.role] ?? m.role}
                      </option>
                    )}
                    {PICKABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r] ?? r}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="text-[11px] text-friday-fg-muted">{m.joined}</span>
                <span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-px rounded-full text-[10px] font-medium tracking-wide",
                    )}
                    style={
                      m.isActive
                        ? { background: "#e8efe6", color: "#3f6534" }
                        : { background: "var(--friday-surface-2)", color: "var(--friday-fg-subtle)" }
                    }
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ background: m.isActive ? "#3f6534" : "var(--friday-fg-subtle)" }}
                    />
                    {m.isActive ? "Active" : "Inactive"}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      {confirm ? (
        <div
          onClick={() => setConfirm(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(20,18,12,0.32)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[340px] px-[22px] py-5 bg-friday-bg border border-friday-border rounded-md"
            style={{ boxShadow: "0 24px 60px rgba(20,18,12,0.18)" }}
          >
            <h3 className="font-display italic font-medium text-[18px] text-friday-fg m-0 mb-1.5 tracking-tight">
              Change role?
            </h3>
            <p className="text-[12px] text-friday-fg-muted m-0 mb-4 leading-relaxed">
              {confirm.name} will go from{" "}
              <strong className="text-friday-fg font-medium">{confirm.from}</strong> to{" "}
              <strong className="text-friday-fg font-medium">{ROLE_LABEL[confirm.to] ?? confirm.to}</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="h-[30px] px-3 bg-transparent border border-friday-border-soft rounded-[3px] text-[11.5px] text-friday-fg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyRoleChange}
                className="h-[30px] px-3.5 bg-friday-accent text-white border-0 rounded-[3px] text-[11.5px] font-medium cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

// ─── Workspace > Permissions ──────────────────────────────────────
// The matrix is derived from the live authorize() function — what you see
// IS what the gate will decide. Editing is disabled because the policy
// lives in code (src/lib/authz/authorize.ts); a future iteration can
// move it to a DB-backed policy and make these cells editable.

const PERM_ROLES: { id: PickableRole; label: string }[] = [
  { id: "admin",    label: "Admin"    },
  { id: "director", label: "Director" },
  { id: "manager",  label: "Manager"  },
  { id: "employee", label: "Member"   },
  { id: "intern",   label: "Intern"   },
];

// Group actions by resource prefix for readable presentation.
const RESOURCE_GROUPS: { key: string; label: string }[] = [
  { key: "project",  label: "Projects" },
  { key: "thread",   label: "Threads" },
  { key: "user",     label: "Users" },
  { key: "agenda",   label: "Agenda" },
  { key: "chat",     label: "Chat" },
  { key: "sheet",    label: "Sheets" },
  { key: "task",     label: "Tasks" },
  { key: "ai",       label: "AI" },
  { key: "billing",  label: "Billing" },
  { key: "settings", label: "Settings" },
];

// Build a synthetic Subject + Resource for a given role/action combo so
// authorize() can evaluate "in principle, can this role do this?".
// We grant a permissive context (global region access, editor-tier
// project assignment, own ownership for self-scoped resources) so the
// matrix reflects "yes if the user is otherwise eligible".
function previewSubject(role: PickableRole): Subject {
  return {
    userId: "__preview__",
    role,
    regions: [
      { country: "CH", accessLevel: "manage" },
      { country: "IT", accessLevel: "manage" },
      { country: "IN", accessLevel: "manage" },
    ],
  };
}

function previewResourceForAction(action: Action, subject: Subject): Resource {
  const prefix = action.split(":")[0];
  switch (prefix) {
    case "project":
    case "thread":
      return { kind: "project", id: "__preview__", country: "CH", assignmentRole: "editor" };
    case "user":
      return { kind: "user", id: "__other__" };
    case "agenda":
      return { kind: "agenda", userId: subject.userId, projectId: null };
    case "chat":
      return { kind: "chat", channelId: "__preview__", messageUserId: subject.userId };
    case "sheet":
      return { kind: "sheet", ownerId: subject.userId };
    case "task":
      return { kind: "task", userId: subject.userId, projectId: null };
    case "billing":
      return { kind: "billing" };
    case "ai":
      return { kind: "ai" };
    case "settings": {
      const isSelf = action.includes("self");
      const scope = isSelf
        ? "self"
        : action.includes("workspace")
          ? "workspace"
          : action.includes("integrations")
            ? "integrations"
            : "permissions";
      return {
        kind: "settings",
        scope,
        targetUserId: isSelf ? subject.userId : undefined,
      };
    }
    default:
      return null;
  }
}

function PermissionsPanel() {
  const allActions = (Object.keys(ACTIONS) as Action[]).sort();
  const byGroup = RESOURCE_GROUPS.map((g) => ({
    ...g,
    actions: allActions.filter((a) => a.split(":")[0] === g.key),
  })).filter((g) => g.actions.length > 0);

  return (
    <Panel
      title="Permissions"
      description="Derived from the live policy. Read-only — the policy lives in code (src/lib/authz/authorize.ts)."
    >
      <div className="space-y-5">
        {byGroup.map((group) => (
          <div key={group.key} className="border border-friday-border-soft rounded overflow-hidden">
            <div
              className="grid px-3.5 py-2.5 bg-friday-surface-2 border-b border-friday-border-soft text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-muted font-semibold gap-3"
              style={{ gridTemplateColumns: `2.2fr repeat(${PERM_ROLES.length}, 1fr)` }}
            >
              <span>{group.label}</span>
              {PERM_ROLES.map((r) => (
                <span key={r.id} className="text-center">{r.label}</span>
              ))}
            </div>
            {group.actions.map((action, i) => (
              <div
                key={action}
                className={cn(
                  "grid px-3.5 py-2.5 text-[12px] text-friday-fg items-center gap-3",
                  i < group.actions.length - 1 ? "border-b border-friday-border-soft" : "",
                )}
                style={{ gridTemplateColumns: `2.2fr repeat(${PERM_ROLES.length}, 1fr)` }}
              >
                <div className="min-w-0">
                  <div className="font-mono text-[10.5px] text-friday-fg-muted">{action}</div>
                  <div className="text-[11.5px] text-friday-fg leading-snug">
                    {ACTIONS[action]}
                  </div>
                </div>
                {PERM_ROLES.map((r) => {
                  const subj = previewSubject(r.id);
                  const res = previewResourceForAction(action, subj);
                  const decision = authorize(subj, action, res);
                  return (
                    <div key={r.id} className="flex justify-center">
                      {decision.allow ? (
                        <span
                          className="inline-flex w-5 h-5 rounded-sm items-center justify-center"
                          style={{ background: "var(--friday-accent)" }}
                          title="Allowed"
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="3.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12.5l4.5 4.5L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span
                          className="inline-flex w-5 h-5 rounded-sm items-center justify-center text-friday-fg-subtle"
                          title={decision.reason}
                        >
                          —
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        <p className="text-[11px] text-friday-fg-subtle italic m-0">
          Hover a dash to see the deny reason. Some actions also depend on
          per-project assignment role or regional access — this preview
          grants both, so the matrix shows the best case for each role.
        </p>
      </div>
    </Panel>
  );
}

// ─── Billing > Plan ───────────────────────────────────────────────
function UsageBar({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const warn = pct > 80;
  return (
    <div className="px-3.5 py-3 bg-friday-surface border border-friday-border-soft rounded">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[11px] text-friday-fg-muted tracking-wide font-medium">{label}</span>
        <span className="font-mono text-[10.5px] text-friday-fg tracking-wide">
          {value.toLocaleString()}
          {unit}{" "}
          <span className="text-friday-fg-subtle">
            / {max.toLocaleString()}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-friday-surface-3 overflow-hidden">
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: warn ? "#c4994a" : "var(--friday-accent)",
          }}
        />
      </div>
    </div>
  );
}

function PlanPanel() {
  return (
    <Panel title="Plan" description="You're on Studio. Renews 1 Sep 2026.">
      <div className="grid gap-4" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div
          className="px-[22px] py-5 rounded text-white"
          style={{ background: "linear-gradient(135deg, #1a1a18 0%, #2a2a26 100%)" }}
        >
          <div
            className="text-[9.5px] uppercase tracking-[0.22em] mb-2 font-semibold"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Current plan
          </div>
          <h3 className="font-display italic font-medium text-[32px] m-0 tracking-tight">Studio</h3>
          <p
            className="text-[12.5px] my-2 leading-relaxed"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Up to 25 seats, unlimited projects, 100K AI queries / month.
          </p>
          <div className="flex items-baseline gap-1.5 mb-4">
            <span className="font-display text-[28px] font-medium tracking-tight">CHF 980</span>
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              / month
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-[30px] px-3.5 bg-white text-friday-fg border-0 rounded-[3px] text-[11.5px] font-medium cursor-pointer"
            >
              Upgrade →
            </button>
            <button
              type="button"
              className="h-[30px] px-3 bg-transparent text-white rounded-[3px] text-[11.5px] cursor-pointer"
              style={{ border: "1px solid rgba(255,255,255,0.25)" }}
            >
              Manage
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <UsageBar label="AI queries" value={47820} max={100000} unit="" />
          <UsageBar label="Storage" value={184} max={500} unit=" GB" />
          <UsageBar label="Seats" value={6} max={25} unit="" />
        </div>
      </div>
    </Panel>
  );
}

// ─── Billing > Invoices ───────────────────────────────────────────
function InvoicesPanel() {
  const rows = [
    { d: "01 Apr 2026", amt: "CHF 980.00", s: "Paid" },
    { d: "01 Mar 2026", amt: "CHF 980.00", s: "Paid" },
    { d: "01 Feb 2026", amt: "CHF 980.00", s: "Paid" },
    { d: "01 Jan 2026", amt: "CHF 980.00", s: "Paid" },
    { d: "01 Dec 2025", amt: "CHF 720.00", s: "Paid" },
  ];
  return (
    <Panel title="Invoices" description="Last 12 months. Click any invoice to download as PDF.">
      <div className="border border-friday-border-soft rounded overflow-hidden">
        {rows.map((r, i) => (
          <div
            key={i}
            className={cn(
              "grid px-3.5 py-3 text-[12px] text-friday-fg items-center",
              i < rows.length - 1 ? "border-b border-friday-border-soft" : "",
            )}
            style={{ gridTemplateColumns: "1fr 1fr 1fr 60px" }}
          >
            <span className="font-mono text-[11.5px] text-friday-fg">{r.d}</span>
            <span className="font-mono text-[11.5px] text-friday-fg">{r.amt}</span>
            <span>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-px rounded-full text-[10.5px] font-medium"
                style={{ background: "#e8efe6", color: "#3f6534" }}
              >
                <span
                  className="w-[5px] h-[5px] rounded-full"
                  style={{ background: "#3f6534" }}
                />
                {r.s}
              </span>
            </span>
            <button
              type="button"
              className="bg-transparent border-0 text-friday-accent text-[11px] cursor-pointer text-right"
            >
              PDF
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Billing > API usage ──────────────────────────────────────────
function ApiUsagePanel() {
  const queriesByDay = [
    320, 510, 820, 1100, 940, 1320, 1480, 980, 1100, 1240, 1620, 1810, 1450, 1220, 1380, 1690,
    1540, 1380, 1900, 2120, 1760, 1480, 1920, 2240, 1980, 1620, 2080, 2360, 2180, 1940,
  ];
  const max = Math.max(...queriesByDay);
  const total = queriesByDay.reduce((a, b) => a + b, 0);
  const cost = (total * 0.0024).toFixed(2);
  const byUser = [
    { k: "GS", n: "Giulio Sovran", q: 14820 },
    { k: "LD", n: "Luigi Di Berardino", q: 11340 },
    { k: "FS", n: "Florencia Schilling", q: 9180 },
    { k: "MI", n: "Marco Iebba", q: 7220 },
    { k: "EV", n: "Erica Vidale", q: 5260 },
  ];
  const userMax = Math.max(...byUser.map((u) => u.q));

  return (
    <Panel
      title="API usage"
      description={`Last 30 days · ${total.toLocaleString()} queries · CHF ${cost} projected.`}
    >
      <div className="grid grid-cols-2 gap-[18px]">
        <div className="px-4 py-3.5 bg-friday-surface border border-friday-border-soft rounded">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-muted mb-3 font-semibold">
            Queries / day
          </div>
          <div className="flex items-end gap-px h-[100px]">
            {queriesByDay.map((q, i) => (
              <div
                key={i}
                className="flex-1 bg-friday-accent rounded-t-[1px]"
                style={{
                  height: `${(q / max) * 100}%`,
                  opacity: 0.85,
                  minHeight: 2,
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 font-mono text-[10px] text-friday-fg-subtle">
            <span>Apr 16</span>
            <span>May 15</span>
          </div>
        </div>
        <div className="px-4 py-3.5 bg-friday-surface border border-friday-border-soft rounded">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-muted mb-3 font-semibold">
            Top users
          </div>
          <div className="flex flex-col gap-2">
            {byUser.map((u) => (
              <div key={u.k}>
                <div className="flex items-center gap-2 mb-0.5">
                  <Avatar initials={u.k} size={18} />
                  <span className="text-[11.5px] text-friday-fg flex-1">{u.n}</span>
                  <span className="font-mono text-[10.5px] text-friday-fg tracking-wide">
                    {u.q.toLocaleString()}
                  </span>
                </div>
                <div className="h-1 bg-friday-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-friday-accent"
                    style={{ width: `${(u.q / userMax) * 100}%`, opacity: 0.75 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ─── Integrations ─────────────────────────────────────────────────
type Integration = {
  k: string;
  name: string;
  desc: string;
  connected: boolean;
  account: string | null;
};

const INTEGRATIONS: Integration[] = [
  { k: "google", name: "Google Workspace", desc: "Calendar, Drive, and SSO via Google.", connected: true, account: "g.sovran@dbsarc.com" },
  { k: "pusher", name: "Pusher", desc: "Real-time channels for thread updates.", connected: true, account: "app · dbs-prod" },
  { k: "daily", name: "Daily.co", desc: "Embedded video meetings inside threads.", connected: true, account: "workspace · dbs" },
  { k: "openai", name: "OpenAI", desc: "Powers Aria, summaries, and insights.", connected: false, account: null },
];

function IntegrationGlyph({ k }: { k: string }) {
  const map: Record<string, { bg: string; fg: string; label: string; bordered?: boolean }> = {
    google: { bg: "#fff", fg: "#1a1a18", label: "G", bordered: true },
    pusher: { bg: "#1a1a18", fg: "#fff", label: "P" },
    daily: { bg: "#22c55e", fg: "#fff", label: "D" },
    openai: { bg: "#0e1f15", fg: "#fff", label: "◉" },
  };
  const m = map[k] ?? { bg: "var(--friday-surface-2)", fg: "var(--friday-fg)", label: "·" };
  return (
    <div
      className="w-[38px] h-[38px] rounded shrink-0 flex items-center justify-center font-display italic font-medium text-[18px]"
      style={{
        background: m.bg,
        color: m.fg,
        border: m.bordered ? "1px solid var(--friday-border-soft)" : "none",
      }}
    >
      {m.label}
    </div>
  );
}

function IntegrationsPanel() {
  const [list, setList] = useState<Integration[]>(INTEGRATIONS);
  const toggle = (k: string) => {
    const item = list.find((i) => i.k === k);
    if (!item) return;
    setList((l) =>
      l.map((i) =>
        i.k === k ? { ...i, connected: !i.connected, account: i.connected ? null : "workspace · dbs" } : i,
      ),
    );
    showToast(`${item.connected ? "Disconnected" : "Connected"} · ${item.name}`);
  };
  return (
    <Panel
      title="Connected services"
      description="Apps that have access to your DBS workspace."
    >
      <div className="grid grid-cols-2 gap-3">
        {list.map((it) => (
          <div
            key={it.k}
            className="px-4 py-3.5 border border-friday-border-soft rounded bg-friday-bg flex items-start gap-3"
          >
            <IntegrationGlyph k={it.k} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h4 className="text-[13px] text-friday-fg m-0 font-medium">{it.name}</h4>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-px rounded-full text-[9.5px] font-medium tracking-wide",
                    it.connected ? "" : "bg-friday-surface-2 text-friday-fg-muted",
                  )}
                  style={
                    it.connected ? { background: "#e8efe6", color: "#3f6534" } : undefined
                  }
                >
                  <span
                    className="w-[5px] h-[5px] rounded-full"
                    style={{
                      background: it.connected ? "#3f6534" : "var(--friday-fg-subtle)",
                    }}
                  />
                  {it.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <p className="text-[11.5px] text-friday-fg-muted m-0 mb-2 leading-snug">{it.desc}</p>
              {it.account ? (
                <div className="font-mono text-[10.5px] text-friday-fg-subtle mb-2">
                  {it.account}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => toggle(it.k)}
                className={cn(
                  "h-[26px] px-3 rounded-[3px] cursor-pointer text-[11px] font-medium tracking-wide",
                  it.connected
                    ? "bg-transparent text-friday-fg-muted border border-friday-border-soft hover:text-friday-fg"
                    : "bg-friday-fg text-friday-bg border-0 hover:opacity-90",
                )}
              >
                {it.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Invite drawer ────────────────────────────────────────────────
function InviteDrawer({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (email: string, role: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Editor");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{ background: "rgba(20,18,12,0.32)" }}
      />
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[51] flex flex-col bg-friday-bg border-l border-friday-border transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          width: 480,
          maxWidth: "92vw",
          boxShadow: "-12px 0 32px rgba(20,18,12,0.10)",
        }}
      >
        <div className="px-[22px] py-4 border-b border-friday-border-soft flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display italic font-medium text-[22px] text-friday-fg m-0 tracking-tight">
              Invite member
            </h2>
            <p className="text-[11.5px] text-friday-fg-muted mt-1 m-0">
              They&apos;ll get an email with a link to join.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border-0 p-1.5 cursor-pointer text-friday-fg-muted leading-none"
          >
            <I.X size={16} />
          </button>
        </div>
        <div className="flex-1 px-[22px] py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Email">
            <TextInput
              value={email}
              onChange={setEmail}
              placeholder="alice@example.com"
              mono
            />
          </Field>
          <Field
            label="Role"
            hint="Editors can edit projects and threads. Viewers can only read."
          >
            <Select
              value={role}
              onChange={setRole}
              options={[
                { v: "Admin", l: "Admin" },
                { v: "Editor", l: "Editor" },
                { v: "Viewer", l: "Viewer" },
              ]}
            />
          </Field>
          <Field label="Personal message" hint="Optional.">
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Welcome to DBS — looking forward to working with you."
              className="w-full min-h-20 px-3 py-2.5 bg-friday-bg text-friday-fg border border-friday-border-soft rounded-[3px] text-[12px] leading-relaxed resize-y outline-none focus:border-friday-accent"
            />
          </Field>
        </div>
        <div className="px-[22px] py-3.5 border-t border-friday-border-soft bg-friday-surface flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 bg-transparent border border-friday-border-soft rounded-[3px] text-[12px] text-friday-fg-muted cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (email) {
                onSend(email, role);
                setEmail("");
                setMsg("");
              }
            }}
            disabled={!email}
            className={cn(
              "h-8 px-3.5 border-0 rounded-[3px] text-[12px] font-medium tracking-wide",
              email ? "bg-friday-accent text-white cursor-pointer" : "bg-friday-surface-2 text-friday-fg-subtle cursor-default",
            )}
          >
            Send invite →
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export function SettingsClient({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [active, setActive] = useState("profile");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Auto-redirect non-admin away from admin-only sections
  useEffect(() => {
    if (!isAdmin) {
      const adminIds = new Set<string>();
      NAV_GROUPS.forEach((g) =>
        g.items.forEach((it) => {
          if (it.admin) adminIds.add(it.id);
        }),
      );
      if (adminIds.has(active)) setActive("profile");
    }
  }, [isAdmin, active]);

  const renderPanel = () => {
    switch (active) {
      case "profile":
        return <ProfilePanel />;
      case "notifications":
        return <NotificationsPanel />;
      case "language":
        return <LanguagePanel />;
      case "general":
        return <GeneralPanel />;
      case "branding":
        return <BrandingPanel />;
      case "members":
        return (
          <MembersPanel
            onInvite={() => setInviteOpen(true)}
            currentUserId={currentUserId}
          />
        );
      case "permissions":
        return <PermissionsPanel />;
      case "plan":
        return <PlanPanel />;
      case "invoices":
        return <InvoicesPanel />;
      case "apiusage":
        return <ApiUsagePanel />;
      case "integrations":
        return <IntegrationsPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden bg-friday-bg h-full">
      <SubNav active={active} onSelect={setActive} isAdmin={isAdmin} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[880px] mx-auto px-8 pt-6 pb-15">
          {renderPanel()}
          {!isAdmin && active === "profile" ? (
            <p className="text-[11px] text-friday-fg-subtle text-center italic mt-2 mb-0">
              Workspace and billing settings are visible to admins only.
            </p>
          ) : null}
        </div>
      </div>

      <InviteDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSend={(email) => {
          setInviteOpen(false);
          showToast(`Invite sent to ${email}`);
        }}
      />
    </div>
  );
}
