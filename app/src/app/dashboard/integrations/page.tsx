"use client";

import React, { useState } from "react";
import { useT } from "@/i18n/translations";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ExternalLink, Plug, RefreshCw, Search, X, Zap } from "lucide-react";
import { cn } from "@/ui/utils";
import { VENDOR_BRAND } from "@/ui/vendor-brand";

// ── Brand SVG logos ──────────────────────────────────────────────────────────

function GmailLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.GMAIL.GREEN} d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z"/>
      <path fill={VENDOR_BRAND.GMAIL.BLUE} d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z"/>
      <polygon fill={VENDOR_BRAND.GMAIL.RED} points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/>
      <path fill={VENDOR_BRAND.GMAIL.DARK_RED} d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0 C4.924,8,3,9.924,3,12.298z"/>
      <path fill={VENDOR_BRAND.GMAIL.YELLOW} d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0 C43.076,8,45,9.924,45,12.298z"/>
    </svg>
  );
}

function OutlookLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.OUTLOOK.DARK_BLUE} d="M29,6H8C6.343,6,5,7.343,5,9v30c0,1.657,1.343,3,3,3h21V6z"/>
      <path fill={VENDOR_BRAND.OUTLOOK.BLUE} d="M29,6l14,8v20L29,42V6z"/>
      <path fill={VENDOR_BRAND.FIXED.WHITE} d="M29,6L15,14v6h14V6z" opacity=".2"/>
      <path fill={VENDOR_BRAND.OUTLOOK.PALE_BLUE} d="M43,14l-14,8V6L43,14z"/>
      <path fill={VENDOR_BRAND.OUTLOOK.DARK_BLUE} d="M43,14v20l-14,8V22L43,14z"/>
      <ellipse cx="17" cy="24" fill={VENDOR_BRAND.FIXED.WHITE} rx="7" ry="8"/>
      <ellipse cx="17" cy="24" fill={VENDOR_BRAND.OUTLOOK.BLUE} rx="5" ry="6"/>
    </svg>
  );
}

function SlackLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.SLACK.GREEN} d="M10.667 30.667a4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4h4v4z"/>
      <path fill={VENDOR_BRAND.SLACK.GREEN} d="M12.667 30.667a4 4 0 0 1 4-4 4 4 0 0 1 4 4v10a4 4 0 0 1-4 4 4 4 0 0 1-4-4v-10z"/>
      <path fill={VENDOR_BRAND.SLACK.CYAN} d="M16.667 10.667a4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4 4v4h-4z"/>
      <path fill={VENDOR_BRAND.SLACK.CYAN} d="M16.667 12.667a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-10a4 4 0 0 1-4-4 4 4 0 0 1 4-4h10z"/>
      <path fill={VENDOR_BRAND.SLACK.MAGENTA} d="M37.333 16.667a4 4 0 0 1 4-4 4 4 0 0 1 4 4 4 4 0 0 1-4 4h-4v-4z"/>
      <path fill={VENDOR_BRAND.SLACK.MAGENTA} d="M35.333 16.667a4 4 0 0 1-4 4 4 4 0 0 1-4-4v-10a4 4 0 0 1 4-4 4 4 0 0 1 4 4v10z"/>
      <path fill={VENDOR_BRAND.SLACK.YELLOW} d="M31.333 37.333a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4v-4h4z"/>
      <path fill={VENDOR_BRAND.SLACK.YELLOW} d="M31.333 35.333a4 4 0 0 1-4-4 4 4 0 0 1 4-4h10a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-10z"/>
    </svg>
  );
}

function TeamsLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.TEAMS.PRIMARY_PURPLE} d="M44,22v8c0,5.523-4.477,10-10,10c-0.342,0-0.682-0.018-1.016-0.052 C31.686,38.576,30,36.006,30,33v-9h8C40.418,24,42.671,23.218,44,22z"/>
      <circle cx="38" cy="13" fill={VENDOR_BRAND.TEAMS.PRIMARY_PURPLE} r="5"/>
      <path fill={VENDOR_BRAND.TEAMS.SECONDARY_PURPLE} d="M32,24v11c0,4.971-4.029,9-9,9s-9-4.029-9-9V24H32z"/>
      <circle cx="23" cy="12" fill={VENDOR_BRAND.TEAMS.SECONDARY_PURPLE} r="7"/>
      <path d="M24,12H9v13c0,3.866,3.134,7,7,7h0c3.866,0,7-3.134,7-7V12z" opacity=".05"/>
      <path d="M23,12H9v13c0,3.314,2.686,6,6,6h0c3.314,0,6-2.686,6-6V12z" opacity=".07"/>
      <path d="M22,12H9v13c0,2.761,2.239,5,5,5h0c2.761,0,5-2.239,5-5V12z" opacity=".09"/>
      <path fill={VENDOR_BRAND.FIXED.WHITE} d="M23,6H9C7.343,6,6,7.343,6,9v14c0,7.732,6.268,14,14,14s14-6.268,14-14V9 C34,7.343,32.657,6,31,6H23z"/>
      <path fill={VENDOR_BRAND.TEAMS.DARK_PURPLE} d="M20,15v10.167C20,26.727,18.727,28,17.167,28h0C15.607,28,14.333,26.727,14.333,25.167V15H20z"/>
      <rect width="8" height="2" fill={VENDOR_BRAND.TEAMS.DARK_PURPLE} x="14" y="15"/>
    </svg>
  );
}

function GoogleCalendarLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <rect width="22" height="22" x="13" y="13" fill={VENDOR_BRAND.FIXED.WHITE}/>
      <polygon fill={VENDOR_BRAND.GOOGLE_CALENDAR.BLUE} points="25.68,20.92 26.688,22.36 28.272,21.208 28.272,29.56 30,29.56 30,18.616 28.56,18.616"/>
      <path fill={VENDOR_BRAND.GOOGLE_CALENDAR.BLUE} d="M22.943,23.745c0.625-0.574,1.013-1.243,1.013-2.138c0-1.596-1.269-2.459-2.748-2.459 c-1.537,0-2.864,0.951-2.864,2.687h1.728c0-0.700,0.471-1.151,1.136-1.151c0.642,0,1.02,0.474,1.02,1.035 c0,0.707-0.556,1.128-1.35,1.128H20.2v1.442h0.73c0.945,0,1.479,0.420,1.479,1.2c0,0.715-0.547,1.175-1.306,1.175 c-0.763,0-1.32-0.464-1.32-1.231h-1.728c0,1.692,1.293,2.767,3.043,2.767c1.692,0,3.043-1.041,3.043-2.767 C23.942,24.783,23.61,24.155,22.943,23.745z"/>
      <path fill={VENDOR_BRAND.GOOGLE_CALENDAR.YELLOW} d="M34,42H14l-1-4l1-4h20l1,4L34,42z"/>
      <path fill={VENDOR_BRAND.GOOGLE_CALENDAR.GREEN} d="M38,35l4-1V14l-4-1l-4,1v20L38,35z"/>
      <path fill={VENDOR_BRAND.GOOGLE_CALENDAR.BLUE} d="M34,10l1,4l-1,4H14l-1-4l1-4H34z"/>
      <polygon fill={VENDOR_BRAND.GOOGLE_CALENDAR.RED} points="38,10 34,10 34,14 38,14 42,14 42,10"/>
      <polygon fill={VENDOR_BRAND.GOOGLE_CALENDAR.DARK_BLUE} points="38,35 34,35 34,39 38,39 42,39 42,35"/>
      <polygon fill={VENDOR_BRAND.GOOGLE_CALENDAR.RED} points="14,10 10,10 10,14 14,14"/>
      <polygon fill={VENDOR_BRAND.GOOGLE_CALENDAR.YELLOW} points="14,39 10,39 10,35 14,35"/>
      <rect width="4" height="4" x="10" y="14" fill={VENDOR_BRAND.FIXED.WHITE}/>
      <rect width="4" height="4" x="10" y="18" fill={VENDOR_BRAND.FIXED.WHITE}/>
      <rect width="4" height="4" x="10" y="22" fill={VENDOR_BRAND.FIXED.WHITE}/>
      <rect width="4" height="4" x="10" y="26" fill={VENDOR_BRAND.FIXED.WHITE}/>
      <rect width="4" height="4" x="10" y="30" fill={VENDOR_BRAND.FIXED.WHITE}/>
    </svg>
  );
}

function GoogleDriveLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.BLUE} d="M6.153,35.15L8,32l18-31.15L44,32L37.847,43H10.153z" opacity=".4"/>
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.YELLOW} d="M26,1H22L4,32l4,7l18-31.15z"/>
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.GREEN} d="M26,1l18,31H8l-4-7h34L26,1z"/>
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.BLUE} d="M44,32l-6.153,11H10.153L4,32h40z" opacity=".6"/>
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.ACCENT_YELLOW} d="M22,1h4l18,31l-4,7z"/>
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.RED} d="M4,32l6.153,11H37.847L44,32H4z" opacity=".4"/>
      <path fill={VENDOR_BRAND.GOOGLE_DRIVE.GREEN} d="M8,39h32l4-7H4L8,39z" opacity=".6"/>
    </svg>
  );
}

function DropboxLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.DROPBOX.DARK_BLUE} d="M24,11.5l-12,7.5l12,7.5l12-7.5L24,11.5z"/>
      <path fill={VENDOR_BRAND.DROPBOX.BLUE} d="M12,19l-8,5l12,7.5L24,26L12,19z"/>
      <path fill={VENDOR_BRAND.DROPBOX.BLUE} d="M36,19l-12,7l8,5l12-7.5L36,19z"/>
      <path fill={VENDOR_BRAND.DROPBOX.DARK_BLUE} d="M16,31.5L24,26l8,5.5l-8,5L16,31.5z"/>
      <path fill={VENDOR_BRAND.DROPBOX.BLUE} d="M16,36.5l8-5l8,5l-4,2.5h-8L16,36.5z"/>
    </svg>
  );
}

function NotionLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill={VENDOR_BRAND.FIXED.WHITE} d="M8,6h28c1.1,0,2,0.9,2,2v32c0,1.1-0.9,2-2,2H8c-1.1,0-2-0.9-2-2V8C6,6.9,6.9,6,8,6z"/>
      <path d="M15.5,13.5h10l8.5,11V13.5H37v21h-9L19.5,23v11.5H15.5V13.5z"/>
      <path fill={VENDOR_BRAND.FIXED.WHITE} d="M19.5,23L28,34.5H37v-1L19.5,13.5H15.5v1L19.5,23z" opacity=".3"/>
    </svg>
  );
}

function ZoomLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <circle cx="24" cy="24" fill={VENDOR_BRAND.ZOOM.BLUE} r="20"/>
      <path fill={VENDOR_BRAND.FIXED.WHITE} d="M28,18H14c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V20C30,18.9,29.1,18,28,18z"/>
      <polygon fill={VENDOR_BRAND.FIXED.WHITE} points="36,18 30,22 30,26 36,30"/>
    </svg>
  );
}

function OpenAILogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6" fill={VENDOR_BRAND.FIXED.WHITE}>
      <path d="M44.1,20.6c1.1-3.3,0.3-7-2.1-9.5c-3.5-3.7-8.9-4.7-13.4-2.5c-1.7-2-4.2-3.1-6.8-3.1 c-5.1,0-9.3,4.1-9.3,9.3c0,0.3,0,0.6,0,0.9C9.1,16.8,6,20.1,6,24.1c0,0,0,0,0,0c-1.1,3.3-0.3,7,2.1,9.5 c2.4,2.5,5.9,3.7,9.3,3.1c1.7,2,4.2,3.1,6.8,3.1c3.7,0,7-2.1,8.5-5.4c3.5-0.1,6.8-1.8,8.9-4.7C43.8,27.1,44.6,23.6,44.1,20.6z M24.1,36.8c-1.6,0-3.1-0.6-4.3-1.6c0.1-0.1,0.2-0.1,0.3-0.2l7.1-4.1c0.4-0.2,0.6-0.6,0.6-1v-10l3,1.7c0,0,0,0.1,0,0.1v8.3 C30.8,33.7,27.7,36.8,24.1,36.8z M10,29.5c-0.8-1.4-1.1-3-0.8-4.6c0.1,0.1,0.2,0.1,0.3,0.2l7.1,4.1c0.4,0.2,0.8,0.2,1.2,0 l8.7-5v3.4c0,0.1,0,0.1-0.1,0.1l-7.2,4.2C16.5,33.4,11.8,32.5,10,29.5z M8.4,17.2c0.8-1.4,2.1-2.5,3.6-3.1 c0,0.1,0,0.2,0,0.3v8.3c0,0.4,0.2,0.8,0.6,1l8.7,5l-3,1.7c-0.1,0-0.1,0-0.2,0L11,26.3C8.4,24.7,7.5,21.2,8.4,17.2z M37.3,24 L28.6,19l3-1.7c0.1,0,0.1,0,0.2,0l7.2,4.2c2.5,1.5,3.5,4.6,2.3,7.3c-0.8,1.8-2.4,3-4.2,3.4c0-0.1,0-0.2,0-0.3v-8.3 C37.9,24.6,37.7,24.2,37.3,24z M39.6,20.5c-0.1-0.1-0.2-0.1-0.3-0.2l-7.1-4.1c-0.4-0.2-0.8-0.2-1.2,0l-8.7,5v-3.4 c0-0.1,0-0.1,0.1-0.1l7.2-4.2c2.7-1.6,6.2-0.9,8,1.7C38.5,16.8,39.3,18.7,39.6,20.5z M21,26.6l-3-1.7v-3.4c0-0.1,0-0.1,0.1-0.1 l0,0L21,19.7l1.5,0.9l1.5,0.9v3.4L21,26.6z"/>
    </svg>
  );
}

// ── Integration catalogue ────────────────────────────────────────────────────

type LogoComponent = () => React.ReactElement;

interface Integration {
  id: string;
  name: string;
  description: string;
  category: "communication" | "calendar" | "storage" | "productivity" | "ai";
  LogoComponent: LogoComponent;
  color: string;
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
    LogoComponent: GmailLogo,
    color: VENDOR_BRAND.GMAIL.TILE_RED,
    connected: false,
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Sync emails and calendar events from Microsoft Outlook.",
    category: "communication",
    LogoComponent: OutlookLogo,
    color: VENDOR_BRAND.OUTLOOK.TILE_BLUE,
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get notified in Slack channels when projects are updated or mentioned.",
    category: "communication",
    LogoComponent: SlackLogo,
    color: VENDOR_BRAND.SLACK.AUBERGINE,
    connected: false,
    comingSoon: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate directly from Teams and receive project notifications.",
    category: "communication",
    LogoComponent: TeamsLogo,
    color: VENDOR_BRAND.TEAMS.TILE_PURPLE,
    connected: false,
    comingSoon: true,
  },
  // Calendar
  {
    id: "gcal",
    name: "Google Calendar",
    description: "Sync agenda items and project deadlines to your Google Calendar.",
    category: "calendar",
    LogoComponent: GoogleCalendarLogo,
    color: VENDOR_BRAND.GOOGLE_CALENDAR.TILE_BLUE,
    connected: false,
  },
  {
    id: "outlook-cal",
    name: "Outlook Calendar",
    description: "Two-way sync with Microsoft Outlook Calendar for deadlines.",
    category: "calendar",
    LogoComponent: OutlookLogo,
    color: VENDOR_BRAND.OUTLOOK.TILE_BLUE,
    connected: false,
    comingSoon: true,
  },
  // Storage
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Attach Google Drive files directly to projects and updates.",
    category: "storage",
    LogoComponent: GoogleDriveLogo,
    color: VENDOR_BRAND.GOOGLE_DRIVE.TILE_GREEN,
    connected: false,
    comingSoon: true,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Link Dropbox folders and share files across the workspace.",
    category: "storage",
    LogoComponent: DropboxLogo,
    color: VENDOR_BRAND.DROPBOX.TILE_BLUE,
    connected: false,
    comingSoon: true,
  },
  // Productivity
  {
    id: "notion",
    name: "Notion",
    description: "Link Notion pages to projects and preview content inline.",
    category: "productivity",
    LogoComponent: NotionLogo,
    color: VENDOR_BRAND.NOTION.TILE_BLACK,
    connected: true,
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Start and schedule Zoom calls directly from project threads.",
    category: "productivity",
    LogoComponent: ZoomLogo,
    color: VENDOR_BRAND.ZOOM.TILE_BLUE,
    connected: false,
    comingSoon: true,
  },
  // AI
  {
    id: "openai",
    name: "OpenAI (GPT)",
    description: "Power the DBS AI assistant with OpenAI models for summaries and analysis.",
    category: "ai",
    LogoComponent: OpenAILogo,
    color: VENDOR_BRAND.OPENAI.GREEN,
    connected: true,
  },
];

const CATEGORIES = [
  { id: "all",           tKey: "integrations.cat.all" },
  { id: "communication", tKey: "integrations.cat.communication" },
  { id: "calendar",      tKey: "integrations.cat.calendar" },
  { id: "storage",       tKey: "integrations.cat.storage" },
  { id: "productivity",  tKey: "integrations.cat.productivity" },
  { id: "ai",            tKey: "integrations.cat.ai" },
] as const;

// ── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ integration, onToggle }: {
  integration: Integration;
  onToggle: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const t = useT();

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
        integration.connected && "border-emerald-400 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/15",
        integration.comingSoon && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: integration.color }}
        >
          <integration.LogoComponent />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">{integration.name}</h3>
            {integration.comingSoon && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border uppercase tracking-wide shrink-0">
                {t("common.coming_soon")}
              </span>
            )}
            {integration.connected && !integration.comingSoon && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shrink-0">
                <Check className="w-2.5 h-2.5" /> {t("common.connected")}
              </span>
            )}
          </div>
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
            <><X className="w-3.5 h-3.5" /> {t("common.disconnect")}</>
          ) : (
            <><Plug className="w-3.5 h-3.5" /> {t("common.connect")}</>
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
  const t = useT();
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
            <h1 className="text-lg font-bold text-foreground">{t("integrations.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("integrations.subtitle")}
            </p>
          </div>
          {connectedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 rounded-xl">
              <Zap className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-white">
                {connectedCount} {t("integrations.active")}
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
              placeholder={t("integrations.search")}
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
                {t(cat.tKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <Plug className="w-10 h-10 text-friday-fg-subtle" />
            <p className="text-sm text-muted-foreground">{t("integrations.none")}</p>
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
