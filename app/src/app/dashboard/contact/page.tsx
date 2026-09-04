"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Users,
  Mail,
  Phone,
  MessageSquare,
  Video,
  Building2,
  Shield,
  Filter,
  UserCheck,
  Crown,
  Briefcase,
  Eye,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Input } from "@/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/select";
import { cn } from "@/ui/utils";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  initials: string | null;
  image: string | null;
  role: string;
  department: string | null;
  phone: string | null;
  isActive: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  super_admin: { label: "Super Admin", icon: Crown, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-200 dark:border-yellow-800/50" },
  admin: { label: "Admin", icon: Shield, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-800/50" },
  project_manager: { label: "Project Manager", icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-200 dark:border-blue-800/50" },
  collaborator: { label: "Collaborator", icon: UserCheck, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-200 dark:border-green-800/50" },
  viewer: { label: "Viewer", icon: Eye, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
};

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer;
}

const ROLE_ORDER = ["super_admin", "admin", "project_manager", "collaborator", "viewer"];

function ContactCard({ member, onMessage, onCall }: { member: TeamMember; onMessage: (id: string) => void; onCall: () => void }) {
  const rc = getRoleConfig(member.role);
  const Icon = rc.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={cn(
        "relative flex flex-col p-5 rounded-2xl border bg-card hover:shadow-md transition-all duration-200 group",
        rc.border,
        !member.isActive && "opacity-60"
      )}
    >
      {/* Online indicator */}
      {member.isActive && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Active</span>
        </div>
      )}

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 mb-4">
        <Avatar className="h-16 w-16 ring-2 ring-background shadow-md">
          <AvatarImage src={member.image || ""} />
          <AvatarFallback className="text-lg font-bold bg-foreground text-background">
            {member.initials ?? member.name?.slice(0, 2).toUpperCase() ?? "??"}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="font-semibold text-sm">{member.name ?? member.email}</p>
          {member.department && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />
              {member.department}
            </p>
          )}
        </div>
      </div>

      {/* Role badge */}
      <div className="flex justify-center mb-4">
        <Badge className={cn("text-xs border gap-1.5", rc.bg, rc.color, rc.border)}>
          <Icon className="w-3 h-3" />
          {rc.label}
        </Badge>
      </div>

      {/* Contact info */}
      <div className="space-y-2 mb-4 min-h-[40px]">
        <a
          href={`mailto:${member.email}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group/link"
        >
          <Mail className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate group-hover/link:underline">{member.email}</span>
        </a>
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group/link"
          >
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span className="group-hover/link:underline">{member.phone}</span>
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 text-xs h-8"
          onClick={() => onMessage(member.id)}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Message
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 text-xs h-8"
          onClick={onCall}
        >
          <Video className="w-3.5 h-3.5" />
          Call
        </Button>
      </div>
    </motion.div>
  );
}

export default function ContactPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(() => {
    const deps = [...new Set(members.map((m) => m.department).filter(Boolean))] as string[];
    return deps.sort();
  }, [members]);

  const filtered = useMemo(() => {
    return members
      .filter((m) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          m.name?.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.department?.toLowerCase().includes(q);
        const matchesRole = roleFilter === "all" || m.role === roleFilter;
        const matchesDept = deptFilter === "all" || m.department === deptFilter;
        return matchesSearch && matchesRole && matchesDept;
      })
      .sort((a, b) => {
        const ra = ROLE_ORDER.indexOf(a.role);
        const rb = ROLE_ORDER.indexOf(b.role);
        return ra - rb;
      });
  }, [members, search, roleFilter, deptFilter]);

  async function handleMessage(userId: string) {
    // Create or find existing DM channel
    const res = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "direct", memberIds: [userId] }),
    });
    if (res.ok) {
      router.push("/dashboard/chat");
    }
  }

  function handleCall() {
    router.push("/dashboard/calls");
  }

  const groupedByRole = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    for (const m of filtered) {
      if (!groups[m.role]) groups[m.role] = [];
      groups[m.role].push(m);
    }
    return ROLE_ORDER.filter((r) => groups[r]?.length).map((r) => ({ role: r, members: groups[r] }));
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 bg-foreground/5 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Team Directory</h1>
            <p className="text-sm text-muted-foreground">{members.length} team members</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {Object.entries(ROLE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(search || roleFilter !== "all" || deptFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setSearch(""); setRoleFilter("all"); setDeptFilter("all"); }}
          >
            Clear filters
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {members.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl border border-border animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users className="w-12 h-12 text-friday-fg-subtle mb-4" />
            <p className="text-muted-foreground font-medium">No team members found</p>
            <p className="text-sm text-friday-fg-muted mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-8">
            <AnimatePresence mode="popLayout">
              {groupedByRole.map(({ role, members: roleMembers }) => {
                const rc = getRoleConfig(role);
                const Icon = rc.icon;
                return (
                  <motion.div
                    key={role}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className={cn("flex items-center justify-center w-6 h-6 rounded-lg", rc.bg)}>
                        <Icon className={cn("w-3.5 h-3.5", rc.color)} />
                      </div>
                      <span className="text-sm font-semibold">{rc.label}s</span>
                      <Badge variant="secondary" className="text-xs">{roleMembers.length}</Badge>
                      <div className="flex-1 h-px bg-border ml-1" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      <AnimatePresence mode="popLayout">
                        {roleMembers.map((m) => (
                          <ContactCard
                            key={m.id}
                            member={m}
                            onMessage={handleMessage}
                            onCall={handleCall}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
