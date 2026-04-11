"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, User, Shield, Users } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ROLES } from "@/shared/lib/utils";

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
  createdAt: string;
  projectCount: number;
}

interface UsersClientProps {
  users: UserData[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

const ROLE_BADGES: Record<string, { label: string; variant: "default" | "info" | "success" | "warning" | "secondary" }> = {
  super_admin: { label: "Super Admin", variant: "default" },
  admin: { label: "Admin", variant: "info" },
  project_manager: { label: "Project Manager", variant: "success" },
  collaborator: { label: "Collaborator", variant: "warning" },
  viewer: { label: "Viewer", variant: "secondary" },
};

export function UsersClient({ users: initialUsers, isSuperAdmin, currentUserId }: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "password123",
    role: "viewer",
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (res.ok) {
        const created = await res.json();
        setUsers([...users, { ...created, projectCount: 0 }]);
        setAddModalOpen(false);
        setNewUser({ name: "", email: "", password: "password123", role: "viewer" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<UserData>) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setUsers(users.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      setUsers(users.filter((u) => u.id !== userId));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User & Permissions Management</h1>
          <p className="text-muted-foreground mt-1">{users.length} total users</p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(ROLE_BADGES).map(([role, { label, variant }]) => {
          const count = users.filter((u) => u.role === role).length;
          return (
            <div key={role} className="p-4 rounded-xl border border-border bg-card">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
            </div>
          );
        })}
      </div>

      {/* Users table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-4 text-xs font-semibold text-muted-foreground w-10">ID</th>
              <th className="text-left p-4 text-xs font-semibold text-muted-foreground">Full Name</th>
              <th className="text-left p-4 text-xs font-semibold text-muted-foreground hidden md:table-cell">Email</th>
              <th className="text-left p-4 text-xs font-semibold text-muted-foreground">Role</th>
              <th className="text-center p-4 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Create Projects</th>
              <th className="text-center p-4 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Edit</th>
              <th className="text-center p-4 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Delete</th>
              <th className="text-right p-4 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => {
              const badge = ROLE_BADGES[user.role] || { label: user.role, variant: "secondary" as const };
              return (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="p-4">
                    <span className="text-xs font-mono text-muted-foreground">
                      {user.initials || user.name?.slice(0, 2).toUpperCase() || "??"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">
                          {user.initials || user.name?.slice(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name || "N/A"}</p>
                        {user.id === currentUserId && (
                          <span className="text-xs text-muted-foreground">(You)</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 hidden md:table-cell">
                    <span className="text-muted-foreground text-xs">{user.email}</span>
                  </td>
                  <td className="p-4">
                    <select
                      value={user.role}
                      onChange={(e) => handleUpdateUser(user.id, { role: e.target.value })}
                      disabled={user.id === currentUserId && !isSuperAdmin}
                      className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4 text-center hidden lg:table-cell">
                    <input
                      type="checkbox"
                      checked={user.canCreate}
                      onChange={(e) => handleUpdateUser(user.id, { canCreate: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="p-4 text-center hidden lg:table-cell">
                    <input
                      type="checkbox"
                      checked={user.canEdit}
                      onChange={(e) => handleUpdateUser(user.id, { canEdit: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="p-4 text-center hidden lg:table-cell">
                    <input
                      type="checkbox"
                      checked={user.canDelete}
                      onChange={(e) => handleUpdateUser(user.id, { canDelete: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditUser(user)}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      {isSuperAdmin && user.id !== currentUserId && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </motion.div>

      {/* Add User Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                placeholder="First Last"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@dbsarc.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <Input
                type="text"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser({ ...newUser, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
