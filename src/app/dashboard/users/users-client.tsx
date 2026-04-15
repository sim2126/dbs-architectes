"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Globe, Building2, ChevronDown, X, Check, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, EMPLOYMENT_STATUSES, COUNTRIES } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────
interface RegionAccess { country: string; operatingRegion?: string | null; accessLevel: string; }
interface Department   { id: string; name: string; code: string; }
interface UserData {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  initials?: string | null;
  isActive: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  employmentStatus: string;
  defaultCountry?: string | null;
  defaultRegion?: string | null;
  departmentId?: string | null;
  createdAt: string;
  projectCount: number;
  department?: Department | null;
  regionAccess?: RegionAccess[];
}

interface UsersClientProps {
  users: UserData[];
  currentUserId: string;
  departments: Department[];
}

// ─── Role badge styling ───────────────────────────────────────
const ROLE_STYLE: Record<string, string> = {
  admin:           "bg-violet-600 text-white",
  director:        "bg-blue-600 text-white",
  manager:         "bg-teal-600 text-white",
  employee:        "bg-slate-500 text-white",
  intern:          "bg-amber-500 text-white",
  // legacy
  super_admin:     "bg-violet-600 text-white",
  project_manager: "bg-teal-600 text-white",
  viewer:          "bg-slate-500 text-white",
  collaborator:    "bg-indigo-500 text-white",
};

const COUNTRY_FLAG: Record<string, string> = { CH: "🇨🇭", IT: "🇮🇹", IN: "🇮🇳" };

function StatusBadge({ status }: { status: string }) {
  const s = EMPLOYMENT_STATUSES.find((e) => e.value === status);
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", s?.color ?? "bg-muted text-muted-foreground")}>
      {s?.label ?? status}
    </span>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────
function EditUserDialog({
  user,
  departments,
  onClose,
  onSaved,
}: {
  user: UserData;
  departments: Department[];
  onClose: () => void;
  onSaved: (updated: Partial<UserData>) => void;
}) {
  const [form, setForm] = useState({
    role:             user.role,
    employmentStatus: user.employmentStatus,
    departmentId:     user.departmentId ?? "",
    defaultCountry:   user.defaultCountry ?? "",
    defaultRegion:    user.defaultRegion ?? "",
    canCreate:        user.canCreate,
    canEdit:          user.canEdit,
    canDelete:        user.canDelete,
    roleChangeReason: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role:             form.role,
        employmentStatus: form.employmentStatus,
        departmentId:     form.departmentId || null,
        defaultCountry:   form.defaultCountry || null,
        defaultRegion:    form.defaultRegion || null,
        canCreate:        form.canCreate,
        canEdit:          form.canEdit,
        canDelete:        form.canDelete,
        roleChangeReason: form.roleChangeReason || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      onSaved(updated);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Role */}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.role !== user.role && (
            <div className="space-y-1.5">
              <Label>Reason for role change <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Promoted to senior architect"
                value={form.roleChangeReason}
                onChange={(e) => setForm({ ...form, roleChangeReason: e.target.value })}
              />
            </div>
          )}

          {/* Employment Status */}
          <div className="space-y-1.5">
            <Label>Employment Status</Label>
            <Select value={form.employmentStatus} onValueChange={(v) => setForm({ ...form, employmentStatus: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Department */}
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.departmentId || "_none"} onValueChange={(v) => setForm({ ...form, departmentId: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="No department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Home country */}
          <div className="space-y-1.5">
            <Label>Home Country</Label>
            <Select value={form.defaultCountry || "_none"} onValueChange={(v) => setForm({ ...form, defaultCountry: v === "_none" ? "" : v, defaultRegion: "" })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Fine-grained permissions */}
          <div className="space-y-2">
            <Label>Capability overrides</Label>
            <div className="flex flex-wrap gap-3">
              {(["canCreate", "canEdit", "canDelete"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                  {key === "canCreate" ? "Create projects" : key === "canEdit" ? "Edit records" : "Delete records"}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────
export function UsersClient({ users: initialUsers, currentUserId, departments }: UsersClientProps) {
  const [users, setUsers]           = useState(initialUsers);
  const [addOpen, setAddOpen]       = useState(false);
  const [editUser, setEditUser]     = useState<UserData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [newUser, setNewUser] = useState({
    name: "", email: "", password: "password123", role: "employee",
    employmentStatus: "invited", departmentId: "", defaultCountry: "",
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newUser,
          departmentId:  newUser.departmentId  || null,
          defaultCountry: newUser.defaultCountry || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setUsers([...users, { ...created, projectCount: 0, regionAccess: [] }]);
        setAddOpen(false);
        setNewUser({ name: "", email: "", password: "password123", role: "employee", employmentStatus: "invited", departmentId: "", defaultCountry: "" });
      }
    } finally { setLoading(false); }
  };

  const handleSaved = (userId: string, updates: Partial<UserData>) => {
    setUsers(users.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
  };

  const handleTerminate = async (userId: string) => {
    if (!confirm("Terminate this user? Their records will be preserved.")) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employmentStatus: "terminated" }),
    });
    if (res.ok) {
      setUsers(users.map((u) => u.id === userId ? { ...u, isActive: false, employmentStatus: "terminated" } : u));
    }
  };

  const visible = users.filter((u) => {
    if (filterRole   !== "all" && u.role !== filterRole)             return false;
    if (filterStatus !== "all" && u.employmentStatus !== filterStatus) return false;
    return true;
  });

  // Stats by role
  const roleCounts = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r.value] = users.filter((u) => u.role === r.value).length;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users & Permissions</h1>
          <p className="text-muted-foreground mt-0.5">{users.filter((u) => u.isActive).length} active · {users.length} total</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />Add User
        </Button>
      </div>

      {/* Role stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ROLES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilterRole(filterRole === value ? "all" : value)}
            className={cn(
              "p-4 rounded-xl border text-left transition-colors",
              filterRole === value ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/30"
            )}
          >
            <p className="text-2xl font-bold">{roleCounts[value] ?? 0}</p>
            <p className={cn("text-xs font-semibold mt-0.5 inline-flex px-1.5 py-0.5 rounded-full", ROLE_STYLE[value])}>{label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status:</span>
        {["all", ...EMPLOYMENT_STATUSES.map((s) => s.value)].map((v) => (
          <button
            key={v}
            onClick={() => setFilterStatus(v)}
            className={cn(
              "text-xs px-3 py-1 rounded-full border transition-colors",
              filterStatus === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground"
            )}
          >
            {v === "all" ? "All" : EMPLOYMENT_STATUSES.find((s) => s.value === v)?.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">User</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Email</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Role</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Status</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">Department</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">Region</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {visible.map((user, i) => (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
                    !user.isActive && "opacity-50"
                  )}
                >
                  {/* User */}
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">
                          {user.initials || user.name?.slice(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm leading-none">
                          {user.name || "N/A"}
                          {user.id === currentUserId && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{user.projectCount} project{user.projectCount !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  </td>
                  {/* Email */}
                  <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">{user.email}</td>
                  {/* Role */}
                  <td className="p-3">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", ROLE_STYLE[user.role] ?? "bg-muted text-muted-foreground")}>
                      {ROLES.find((r) => r.value === user.role)?.label ?? user.role}
                    </span>
                  </td>
                  {/* Employment status */}
                  <td className="p-3 hidden lg:table-cell">
                    <StatusBadge status={user.employmentStatus} />
                  </td>
                  {/* Department */}
                  <td className="p-3 hidden xl:table-cell text-xs text-muted-foreground">
                    {user.department ? (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />{user.department.name}
                      </span>
                    ) : "—"}
                  </td>
                  {/* Country */}
                  <td className="p-3 hidden xl:table-cell text-xs text-muted-foreground">
                    {user.defaultCountry ? (
                      <span>{COUNTRY_FLAG[user.defaultCountry] ?? ""} {user.defaultCountry}</span>
                    ) : "—"}
                  </td>
                  {/* Actions */}
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditUser(user)}>
                        <Pencil className="w-3 h-3 mr-1" />Edit
                      </Button>
                      {user.id !== currentUserId && user.employmentStatus !== "terminated" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleTerminate(user.id)}
                        >
                          <X className="w-3 h-3 mr-1" />Terminate
                        </Button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No users match the selected filters.</div>
        )}
      </motion.div>

      {/* Edit dialog */}
      {editUser && (
        <EditUserDialog
          user={editUser}
          departments={departments}
          onClose={() => setEditUser(null)}
          onSaved={(updates) => { handleSaved(editUser.id, updates); setEditUser(null); }}
        />
      )}

      {/* Add user modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input placeholder="First Last" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="email@friday.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Home Country</Label>
                <Select value={newUser.defaultCountry || "_none"} onValueChange={(v) => setNewUser({ ...newUser, defaultCountry: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={newUser.departmentId || "_none"} onValueChange={(v) => setNewUser({ ...newUser, departmentId: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1">{loading ? "Creating..." : "Create User"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
