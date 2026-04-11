"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  User,
  Tag,
  Layers,
  Mountain,
  Home,
  SquareStack,
  Ruler,
  CreditCard,
  FileText,
  ExternalLink,
  Clock,
  Activity,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { PHASE_COLORS } from "@/shared/lib/utils";
import { cn } from "@/shared/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ProjectDetail {
  id: string;
  code: string;
  title: string;
  category: string;
  phase: string;
  client: string | null;
  year: number | null;
  commune: string | null;
  typology: string | null;
  terrain: string | null;
  roof: string | null;
  description: string | null;
  pageLink: string | null;
  image: string | null;
  floors: number | null;
  area: number | null;
  status: string;
  billing: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: Array<{
    userId: string;
    role: string | null;
    user: {
      id: string;
      name: string | null;
      initials: string | null;
      image: string | null;
      email: string;
      role: string;
    };
  }>;
  agendaItems: Array<{
    id: string;
    title: string;
    date: string;
    priority: string;
    status: string;
  }>;
  activities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { id: string; name: string | null; initials: string; image: string | null };
  }>;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

const PRIORITY_CONFIG = {
  high: { label: "High", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
  medium: { label: "Medium", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  low: { label: "Low", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
} as Record<string, { label: string; color: string; bg: string }>;

export function ProjectDetail() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setProject)
      .catch(() => setError("Project not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">{error ?? "Project not found"}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    );
  }

  const phaseColor = PHASE_COLORS[project.phase] ?? "#6b7280";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border shrink-0">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Projects
        </Button>
        <div className="w-px h-5 bg-border" />
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 text-white text-xs font-bold"
            style={{ backgroundColor: phaseColor }}
          >
            {project.code.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{project.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{project.code}</span>
              <Badge
                className="text-xs border-0 text-white"
                style={{ backgroundColor: phaseColor }}
              >
                {project.phase}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">{project.status}</Badge>
            </div>
          </div>
        </div>
        {project.pageLink && (
          <a href={project.pageLink} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Notion
            </Button>
          </a>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-full">
          {/* Left — main info */}
          <div className="lg:col-span-2 p-6 space-y-6 border-r border-border">
            {/* Hero image or placeholder */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative h-52 rounded-xl overflow-hidden bg-muted flex items-center justify-center border border-border"
            >
              {project.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground/40">
                  <Building2 className="w-16 h-16" />
                  <span className="text-sm font-medium">{project.title}</span>
                </div>
              )}
              {/* Phase badge overlay */}
              <div
                className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: phaseColor }}
              >
                {project.phase}
              </div>
            </motion.div>

            {/* Description */}
            {project.description && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Description
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-xl p-4">
                  {project.description}
                </p>
              </motion.div>
            )}

            {/* Project details grid */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                Project Details
              </h2>
              <div className="divide-y divide-border">
                <InfoRow icon={Building2} label="Category" value={project.category} />
                <InfoRow icon={User} label="Client" value={project.client} />
                <InfoRow icon={Calendar} label="Year" value={project.year} />
                <InfoRow icon={MapPin} label="Commune" value={project.commune} />
                <InfoRow icon={Layers} label="Typology" value={project.typology} />
                <InfoRow icon={Mountain} label="Terrain" value={project.terrain} />
                <InfoRow icon={Home} label="Roof" value={project.roof} />
                <InfoRow icon={SquareStack} label="Floors" value={project.floors} />
                <InfoRow icon={Ruler} label="Area" value={project.area ? `${project.area} m²` : null} />
                <InfoRow icon={CreditCard} label="Billing" value={project.billing} />
              </div>
            </motion.div>

            {/* Notes */}
            {project.notes && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-muted-foreground" />
                  Notes
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-xl p-4">
                  {project.notes}
                </p>
              </motion.div>
            )}

            {/* Agenda items */}
            {project.agendaItems.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Upcoming Tasks
                  <Badge variant="secondary" className="text-xs">{project.agendaItems.length}</Badge>
                </h2>
                <div className="space-y-2">
                  {project.agendaItems.slice(0, 5).map((item) => {
                    const pc = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.low;
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                        <CheckCircle2 className={cn("w-4 h-4 shrink-0", item.status === "done" ? "text-green-500" : "text-muted-foreground/30")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.date).toLocaleDateString("it-CH")}
                          </p>
                        </div>
                        <Badge className={cn("text-xs border-0 shrink-0", pc.bg, pc.color)}>
                          {pc.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>

          {/* Right — team + activity */}
          <div className="p-6 space-y-6">
            {/* Team */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Team
                <Badge variant="secondary" className="text-xs">{project.assignments.length}</Badge>
              </h2>
              {project.assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team members assigned</p>
              ) : (
                <div className="space-y-2">
                  {project.assignments.map((a) => (
                    <div key={a.userId} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={a.user.image || ""} />
                        <AvatarFallback className="text-xs bg-foreground text-background">
                          {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.user.name ?? a.user.email}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {a.role ?? a.user.role.replace("_", " ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <div className="h-px bg-border" />

            {/* Meta */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Timeline
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Created</span>
                  <span className="text-xs font-medium">
                    {new Date(project.createdAt).toLocaleDateString("it-CH")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Last updated</span>
                  <span className="text-xs font-medium">
                    {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </motion.div>

            <div className="h-px bg-border" />

            {/* Recent activity */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  Recent Activity
                </h2>
                <Link href={`/dashboard/activity`}>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                    View all
                  </Button>
                </Link>
              </div>
              {project.activities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet</p>
              ) : (
                <div className="space-y-3 pl-1 border-l-2 border-border ml-1">
                  {project.activities.map((act) => (
                    <div key={act.id} className="relative ml-4">
                      <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-background border-2 border-border" />
                      <div className="flex items-start gap-2">
                        <Avatar className="h-5 w-5 shrink-0 mt-0.5">
                          <AvatarImage src={act.user.image || ""} />
                          <AvatarFallback className="text-[8px] bg-foreground text-background">
                            {act.user.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-snug">{act.description}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
