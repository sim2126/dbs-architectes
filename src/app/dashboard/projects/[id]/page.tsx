"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Building2, ExternalLink, Loader2, Send, Globe,
  MessageSquare, ChevronDown, AlertCircle, ThumbsUp, Reply,
  Paperclip, Smile, AtSign, FileText, Activity, MoreHorizontal,
  Upload, Image, File, Check, Clock, X, Trash2, Edit2,
  User, Tag, MapPin, CreditCard, Calendar, RotateCcw,
  Phone, Video, PhoneCall, PhoneOff, Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PHASE_COLORS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { useT } from "@/lib/translations";
import { useLanguageStore } from "@/lib/language-store";
import { ProjectThreadPanel, type ThreadMessage as _ThreadMessage } from "@/components/project-thread-panel";

// ── Types ───────────────────────────────────────────────────────────────────

// ThreadMessage is imported above from @/components/project-thread-panel.
// Alias to preserve the local name used throughout this file.
type ThreadMessage = _ThreadMessage;

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
  workStatus?: string;
  billing: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: Array<{
    userId: string;
    role: string | null;
    user: { id: string; name: string | null; initials: string | null; image: string | null; email: string; role: string };
  }>;
  agendaItems: Array<{ id: string; title: string; date: string; priority: string; status: string }>;
  activities: Array<{
    id: string; type: string; description: string; createdAt: string;
    user: { id: string; name: string | null; initials: string; image: string | null };
  }>;
}

// ── Work Status — monday.com palette ───────────────────────────────────────
const WORK_STATUS = {
  todo:      { label: "Not Started",   solid: "#c4c4cf" },
  doing:     { label: "Working on it", solid: "#fdab3d" },
  stuck:     { label: "Stuck",         solid: "#e2445c" },
  completed: { label: "Done",          solid: "#00c875" },
} as const;
type WorkStatusKey = keyof typeof WORK_STATUS;


// ── Files Tab ────────────────────────────────────────────────────────────────

function FilesTab({ projectId }: { projectId: string }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors">
          <Upload className="w-3.5 h-3.5" /> Add file
        </button>
        <span className="text-xs text-muted-foreground ml-2">Upload documents, images, and more</span>
      </div>

      {/* Drop zone */}
      <div
        className="flex-1 p-6 flex flex-col items-center justify-center"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); /* handle files */ }}
      >
        <motion.div
          animate={{ scale: dragging ? 1.03 : 1 }}
          className={cn(
            "w-full max-w-md flex flex-col items-center gap-4 py-16 px-8 rounded-2xl border-2 border-dashed transition-colors",
            dragging ? "border-blue-400 bg-blue-50 dark:bg-blue-900/10" : "border-border bg-muted/20"
          )}
        >
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-xl bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
              <Image className="w-7 h-7 text-yellow-500" />
            </div>
            <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <File className="w-7 h-7 text-blue-500" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              <span className="font-bold">Drag &amp; drop</span> or{" "}
              <label className="text-blue-500 cursor-pointer hover:underline">
                browse files
                <input type="file" multiple className="hidden" onChange={() => {}} />
              </label>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload, comment and review files to collaborate in context
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Activity Log Tab ─────────────────────────────────────────────────────────

function ActivityTab({ activities }: {
  activities: Array<{
    id: string; type: string; description: string; createdAt: string;
    user: { id: string; name: string | null; initials: string; image: string | null };
  }>;
}) {
  const TYPE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
    updated:  { icon: Edit2,        color: "#3b82f6" },
    created:  { icon: Check,        color: "#00c875" },
    assigned: { icon: User,         color: "#8b5cf6" },
    comment:  { icon: MessageSquare,color: "#f59e0b" },
    default:  { icon: Activity,     color: "#94a3b8" },
  };

  return (
    <div className="overflow-y-auto h-full px-5 py-4">
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Activity className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">No activity yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
          <div className="space-y-0">
            {activities.map((act) => {
              const cfg = TYPE_ICON[act.type] ?? TYPE_ICON.default;
              const Icon = cfg.icon;
              return (
                <div key={act.id} className="flex gap-3 py-3 relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 relative z-10"
                    style={{ background: cfg.color }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-xs text-foreground leading-relaxed">{act.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {act.user.name && (
                        <span className="text-[10px] font-semibold text-muted-foreground">{act.user.name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Call Panel ──────────────────────────────────────────────────────────────

interface CallPanelProps {
  assignments: ProjectDetail["assignments"];
  onClose: () => void;
}

function CallPanel({ assignments, onClose }: CallPanelProps) {
  const [activeCall, setActiveCall] = useState<{ userId: string; type: "voice" | "video" } | null>(null);

  const handleCall = (userId: string, type: "voice" | "video") => {
    if (activeCall?.userId === userId && activeCall?.type === type) {
      setActiveCall(null);
    } else {
      setActiveCall({ userId, type });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute right-4 top-14 z-50 w-80 rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Phone className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Connect</p>
            <p className="text-[10px] text-white/40">{assignments.length} team member{assignments.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-3 h-3 text-white/70" />
        </button>
      </div>

      {/* Group call */}
      <div className="px-4 pt-3 pb-2">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-violet-600/30 to-blue-600/30 border border-violet-500/20 hover:from-violet-600/40 hover:to-blue-600/40 transition-all group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="text-left flex-1">
            <p className="text-xs font-semibold text-white">Start Group Call</p>
            <p className="text-[10px] text-white/40">All {assignments.length} members</p>
          </div>
          <PhoneCall className="w-4 h-4 text-violet-400 group-hover:text-violet-300 transition-colors" />
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] text-white/30 font-medium">or call individually</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Members list */}
      <div className="px-3 pb-3 space-y-1 max-h-64 overflow-y-auto">
        {assignments.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-white/30">No team members assigned</p>
          </div>
        ) : (
          assignments.map((a) => {
            const isVoiceActive = activeCall?.userId === a.userId && activeCall?.type === "voice";
            const isVideoActive = activeCall?.userId === a.userId && activeCall?.type === "video";
            return (
              <div key={a.userId} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white">
                    {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "?"}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0f172a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{a.user.name ?? "Unknown"}</p>
                  <p className="text-[10px] text-white/40 truncate capitalize">{a.role ?? a.user.role}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCall(a.userId, "voice")}
                    title="Voice call"
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                      isVoiceActive
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-white/10 hover:bg-emerald-500/80 text-white/60 hover:text-white"
                    )}
                  >
                    {isVoiceActive ? <PhoneOff className="w-3 h-3 text-white" /> : <Phone className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => handleCall(a.userId, "video")}
                    title="Video call"
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                      isVideoActive
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-white/10 hover:bg-blue-500/80 text-white/60 hover:text-white"
                    )}
                  >
                    <Video className="w-3 h-3 text-white" />
                  </button>
                  <button
                    title="Direct message"
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-violet-500/80 flex items-center justify-center text-white/60 hover:text-white transition-all"
                  >
                    <MessageSquare className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Active call banner */}
      {activeCall && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          className="border-t border-white/10 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">
                {activeCall.type === "voice" ? "Voice" : "Video"} call in progress
              </span>
            </div>
            <button
              onClick={() => setActiveCall(null)}
              className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              <PhoneOff className="w-3 h-3" /> End
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

type DetailView = "updates" | "files" | "activity";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailView>("updates");

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(setProject)
      .catch(() => setError("Project not found"))
      .finally(() => setLoading(false));
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      if (s?.user?.id) setCurrentUserId(s.user.id);
    });
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
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  const phaseColor = PHASE_COLORS[project.phase] ?? "#6b7280";
  const wsKey = (project.workStatus as WorkStatusKey) in WORK_STATUS ? project.workStatus as WorkStatusKey : "todo";
  const ws = WORK_STATUS[wsKey];

  const TABS: { id: DetailView; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "updates", label: "Updates", icon: MessageSquare },
    { id: "files",   label: "Files",   icon: Paperclip },
    { id: "activity",label: "Activity Log", icon: Activity, count: project.activities.length },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Header ── */}
      <div className="relative border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
        {/* Row 1: breadcrumb + title + status */}
        <div className="flex items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")} className="gap-1.5 shrink-0 h-8 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Projects
          </Button>
          <div className="w-px h-4 bg-border" />
          {project.image && <img src={project.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate leading-tight">{project.title}</h1>
            <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: phaseColor }}>
              {project.phase}
            </span>
            {/* Monday.com style status chip */}
            <span className="text-[10px] font-bold px-3 py-1 rounded text-white" style={{ background: ws.solid }}>
              {ws.label}
            </span>
            {project.pageLink && (
              <a href={project.pageLink} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <ExternalLink className="w-3 h-3" /> Notion
                </Button>
              </a>
            )}
            <button
              onClick={() => setShowCall((v) => !v)}
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-lg transition-all",
                showCall
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-violet-100 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-400"
              )}
              title="Connect with team"
            >
              <Phone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Call Panel */}
        <AnimatePresence>
          {showCall && (
            <CallPanel
              assignments={project.assignments}
              onClose={() => setShowCall(false)}
            />
          )}
        </AnimatePresence>

        {/* Row 2: assignees + meta + toggle */}
        <div className="flex items-center gap-3 px-5 pb-2.5 flex-wrap">
          <div className="flex -space-x-1.5">
            {project.assignments.slice(0, 5).map((a) => (
              <Avatar key={a.userId} className="h-6 w-6 border-2 border-background" title={a.user.name ?? ""}>
                <AvatarImage src={a.user.image || ""} />
                <AvatarFallback className="text-[8px] font-bold bg-foreground text-background">
                  {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "??"}
                </AvatarFallback>
              </Avatar>
            ))}
            {project.assignments.length === 0 && <span className="text-[11px] text-muted-foreground">No assignees</span>}
          </div>
          {[project.category, project.commune, project.client, project.year ? String(project.year) : null].filter(Boolean).map((v) => (
            <span key={v} className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{v}</span>
          ))}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDetails && "rotate-180")} />
            {showDetails ? "Hide" : "Show"} details
          </button>
        </div>

        {/* Expandable details */}
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border"
            >
              <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
                {[
                  { label: "Category", value: project.category, icon: Tag },
                  { label: "Client", value: project.client, icon: User },
                  { label: "Year", value: project.year, icon: Calendar },
                  { label: "Commune", value: project.commune, icon: MapPin },
                  { label: "Typology", value: project.typology, icon: Building2 },
                  { label: "Terrain", value: project.terrain, icon: Building2 },
                  { label: "Roof", value: project.roof, icon: Building2 },
                  { label: "Billing", value: project.billing, icon: CreditCard },
                  { label: "Area", value: project.area ? `${project.area} m²` : null, icon: Building2 },
                  { label: "Floors", value: project.floors, icon: Building2 },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex items-start gap-2">
                    <row.icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">{row.label}</p>
                      <p className="text-xs font-medium">{String(row.value)}</p>
                    </div>
                  </div>
                ))}
                {project.notes && (
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-[10px] text-muted-foreground mb-1">Notes</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{project.notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 px-5 border-t border-border">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors relative",
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30" : "bg-muted text-muted-foreground"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "updates" && currentUserId && (
            <motion.div
              key="updates"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ProjectThreadPanel projectId={id} currentUserId={currentUserId} />
            </motion.div>
          )}
          {activeTab === "files" && (
            <motion.div
              key="files"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <FilesTab projectId={id} />
            </motion.div>
          )}
          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ActivityTab activities={project.activities} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
