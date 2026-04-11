"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ExternalLink, Plug, RefreshCw, Search, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Integration catalogue ────────────────────────────────────────────────────

interface Integration {
  id: string;
  name: string;
  description: string;
  category: "communication" | "calendar" | "storage" | "productivity" | "ai";
  logo: string;          // emoji fallback
  color: string;         // brand color
  connected: boolean;
  comingSoon?: boolean;
}

const INTEGRATIONS: Integration[] = [
  // Communication
  {
    id: "gmail",
    name: "Gmail",
    description: "Receive email notifications and create updates from email threads.",
    category: "communication",
    logo: "M",
    color: "#EA4335",
    connected: false,
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Sync emails and calendar events from Microsoft Outlook.",
    category: "communication",
    logo: "O",
    color: "#0078D4",
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get notified in Slack channels when projects are updated or mentioned.",
    category: "communication",
    logo: "S",
    color: "#4A154B",
    connected: false,
    comingSoon: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate directly from Teams and receive project notifications.",
    category: "communication",
    logo: "T",
    color: "#6264A7",
    connected: false,
    comingSoon: true,
  },
  // Calendar
  {
    id: "gcal",
    name: "Google Calendar",
    description: "Sync agenda items and project deadlines to your Google Calendar.",
    category: "calendar",
    logo: "G",
    color: "#4285F4",
    connected: false,
  },
  {
    id: "outlook-cal",
    name: "Outlook Calendar",
    description: "Two-way sync with Microsoft Outlook Calendar for deadlines.",
    category: "calendar",
    logo: "O",
    color: "#0078D4",
    connected: false,
    comingSoon: true,
  },
  // Storage
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Attach Google Drive files directly to projects and updates.",
    category: "storage",
    logo: "D",
    color: "#34A853",
    connected: false,
    comingSoon: true,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Link Dropbox folders and share files across the workspace.",
    category: "storage",
    logo: "B",
    color: "#0061FF",
    connected: false,
    comingSoon: true,
  },
  // Productivity
  {
    id: "notion",
    name: "Notion",
    description: "Link Notion pages to projects and preview content inline.",
    category: "productivity",
    logo: "N",
    color: "#000000",
    connected: true,   // already in use (pageLink field)
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Start and schedule Zoom calls directly from project threads.",
    category: "productivity",
    logo: "Z",
    color: "#2D8CFF",
    connected: false,
    comingSoon: true,
  },
  // AI
  {
    id: "openai",
    name: "OpenAI (GPT)",
    description: "Power the DBS AI assistant with OpenAI models for summaries and analysis.",
    category: "ai",
    logo: "⬡",
    color: "#10A37F",
    connected: true,
  },
];

const CATEGORIES = [
  { id: "all",           label: "All" },
  { id: "communication", label: "Communication" },
  { id: "calendar",      label: "Calendar" },
  { id: "storage",       label: "Storage" },
  { id: "productivity",  label: "Productivity" },
  { id: "ai",            label: "AI & Automation" },
] as const;

// ── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ integration, onToggle }: {
  integration: Integration;
  onToggle: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (integration.comingSoon) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800)); // simulate OAuth flow
    onToggle(integration.id);
    setLoading(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative flex flex-col gap-4 p-5 rounded-2xl border bg-card transition-all hover:shadow-md",
        integration.connected && "border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10",
        integration.comingSoon && "opacity-60"
      )}
    >
      {integration.comingSoon && (
        <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border uppercase tracking-wide">
          Coming soon
        </span>
      )}
      {integration.connected && !integration.comingSoon && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
          <Check className="w-2.5 h-2.5" /> Connected
        </span>
      )}

      <div className="flex items-center gap-3">
        {/* Logo */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-black shrink-0"
          style={{ background: integration.color }}
        >
          {integration.logo}
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">{integration.name}</h3>
          <span className="text-[10px] text-muted-foreground capitalize">{integration.category}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
        {integration.description}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={integration.comingSoon || loading}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all",
            integration.connected
              ? "bg-muted text-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              : integration.comingSoon
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-80"
          )}
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : integration.connected ? (
            <><X className="w-3.5 h-3.5" /> Disconnect</>
          ) : (
            <><Plug className="w-3.5 h-3.5" /> Connect</>
          )}
        </button>
        <button className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground" title="Learn more">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [integrations, setIntegrations] = useState(INTEGRATIONS);

  const toggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i))
    );
  };

  const filtered = integrations.filter((i) => {
    const matchCat = activeCategory === "all" || i.category === activeCategory;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm px-6 py-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">Integrations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connect DBS Architectes to your favourite tools
            </p>
          </div>
          {connectedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {connectedCount} active
              </span>
            </div>
          )}
        </div>

        {/* Search + category filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search integrations…"
              className="w-full pl-9 pr-3 h-8 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/30 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  activeCategory === cat.id
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <Plug className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No integrations match your search</p>
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {filtered.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onToggle={toggleIntegration}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
