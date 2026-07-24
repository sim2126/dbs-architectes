import {
  CheckSquare,
  AlertTriangle,
  HelpCircle,
  Target,
  Users,
  Quote,
  TrendingUp,
  Calendar,
  Film,
  Sparkles,
} from "lucide-react";
import type { AnySummary, DetailedSummary, SimpleSummary } from "@/platform/integrations/meeting-summarizer";

function Section({
  icon: Icon,
  title,
  accent = "slate",
  children,
}: {
  icon: React.ElementType;
  title: string;
  accent?: "slate" | "emerald" | "amber" | "rose" | "blue" | "violet";
  children: React.ReactNode;
}) {
  const color =
    {
      slate: "text-slate-600 dark:text-slate-400",
      emerald: "text-emerald-600",
      amber: "text-amber-600",
      rose: "text-rose-600",
      blue: "text-blue-600",
      violet: "text-violet-600",
    }[accent];
  return (
    <div className="mb-7">
      <h2 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${color} mb-3`}>
        <Icon className="w-4 h-4" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function PriorityDot({ p }: { p: "high" | "medium" | "low" }) {
  const color = p === "high" ? "bg-rose-500" : p === "medium" ? "bg-amber-500" : "bg-slate-400";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

export function SummaryRenderer({
  summary,
  recordingUrl,
}: {
  summary: AnySummary;
  recordingUrl?: string | null;
}) {
  if (summary.mode === "simple") return <SimpleRenderer s={summary} recordingUrl={recordingUrl ?? null} />;
  return <DetailedRenderer s={summary} recordingUrl={recordingUrl ?? null} />;
}

function SimpleRenderer({ s, recordingUrl }: { s: SimpleSummary; recordingUrl: string | null }) {
  return (
    <div>
      {/* TL;DR */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-5 mb-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-2">
          <Sparkles className="w-3.5 h-3.5" /> TL;DR
        </div>
        <p className="text-base leading-relaxed">{s.executive_summary}</p>
      </div>

      {recordingUrl && (
        <a
          href={recordingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline mb-6"
        >
          <Film className="w-4 h-4" /> Watch recording
        </a>
      )}

      <Section icon={Target} title="Key points" accent="blue">
        <ul className="space-y-2">
          {s.key_points.map((k, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="text-blue-400 mt-1.5">•</span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      </Section>

      {s.action_items.length > 0 && (
        <Section icon={CheckSquare} title="Action items" accent="emerald">
          <div className="space-y-2">
            {s.action_items.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl"
              >
                <CheckSquare className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <div>{a.task}</div>
                  {(a.owner || a.due_date) && (
                    <div className="mt-1 flex gap-3 text-xs text-slate-500">
                      {a.owner && <span>👤 {a.owner}</span>}
                      {a.due_date && <span>📅 {a.due_date}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.topics.length > 0 && (
        <Section icon={Users} title="Topics covered" accent="slate">
          <div className="flex flex-wrap gap-2">
            {s.topics.map((t, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      {s.next_steps.length > 0 && (
        <Section icon={TrendingUp} title="Next steps" accent="violet">
          <ul className="space-y-2">
            {s.next_steps.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="text-violet-400 mt-1.5">→</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function DetailedRenderer({
  s,
  recordingUrl,
}: {
  s: DetailedSummary;
  recordingUrl: string | null;
}) {
  return (
    <div>
      <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border border-violet-100 dark:border-violet-900/40 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-2">
          <Sparkles className="w-3.5 h-3.5" /> Executive Summary
        </div>
        <p className="text-base leading-relaxed font-medium">{s.executive_summary}</p>
      </div>

      {recordingUrl && (
        <a
          href={recordingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline mb-6"
        >
          <Film className="w-4 h-4" /> Watch recording
        </a>
      )}

      {s.narrative && (
        <Section icon={Quote} title="Recap" accent="slate">
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {s.narrative}
          </p>
        </Section>
      )}

      {s.since_last_meeting && (
        <Section icon={TrendingUp} title="Since last meeting" accent="blue">
          <div className="text-sm bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-400 px-4 py-3 rounded-r-lg">
            {s.since_last_meeting}
          </div>
        </Section>
      )}

      {s.decisions_made?.length > 0 && (
        <Section icon={Target} title="Decisions made" accent="emerald">
          <div className="space-y-2">
            {s.decisions_made.map((d, i) => (
              <div
                key={i}
                className="p-3 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200/50 dark:border-emerald-900/30 rounded-xl text-sm"
              >
                <div className="font-medium">{d.what}</div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                  {d.who_decided && <span>Decided by {d.who_decided}</span>}
                  <span>Confidence: {d.confidence}</span>
                </div>
                {d.conflicts_with_prior && (
                  <div className="mt-2 text-xs bg-amber-100 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 px-2.5 py-1.5 rounded-lg flex gap-1.5 items-start">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Conflicts with prior: {d.conflicts_with_prior}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.action_items?.length > 0 && (
        <Section icon={CheckSquare} title="Action items" accent="emerald">
          <div className="space-y-2">
            {s.action_items.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl"
              >
                <div className="pt-1">
                  <PriorityDot p={a.priority} />
                </div>
                <div className="flex-1 text-sm">
                  <div>{a.task}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    {a.owner_name && <span>👤 {a.owner_name}</span>}
                    {a.due_date && <span>📅 {a.due_date}</span>}
                    {a.project_link && <span className="font-mono">🔗 {a.project_link}</span>}
                    {a.blocks && <span>⛔ blocks: {a.blocks}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.risks_flagged?.length > 0 && (
        <Section icon={AlertTriangle} title="Risks flagged" accent="rose">
          <div className="space-y-2">
            {s.risks_flagged.map((r, i) => (
              <div
                key={i}
                className="p-3 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200/50 dark:border-rose-900/30 rounded-xl text-sm"
              >
                <div className="font-medium flex items-center gap-2">
                  <PriorityDot p={r.severity} /> {r.risk}
                </div>
                {r.mitigation && (
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Mitigation: {r.mitigation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.open_questions?.length > 0 && (
        <Section icon={HelpCircle} title="Open questions" accent="amber">
          <ul className="space-y-2">
            {s.open_questions.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <HelpCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div>{q.question}</div>
                  {(q.asked_by || q.directed_to) && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {q.asked_by && <>asked by {q.asked_by}</>}
                      {q.directed_to && <> → {q.directed_to}</>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.blockers?.length > 0 && (
        <Section icon={AlertTriangle} title="Blockers" accent="rose">
          <ul className="space-y-1.5">
            {s.blockers.map((b, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{b.item}</span>
                {b.waiting_on && (
                  <span className="text-slate-500"> — waiting on {b.waiting_on}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(s.budget_impact || s.deadline_impact) && (
        <div className="grid md:grid-cols-2 gap-4 mb-7">
          {s.budget_impact && (
            <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Budget impact
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {s.budget_impact.mentioned_figures.map((f, i) => (
                  <span key={i} className="text-xs font-mono px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                    {f}
                  </span>
                ))}
              </div>
              {s.budget_impact.variance_from_plan && (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠ {s.budget_impact.variance_from_plan}
                </div>
              )}
            </div>
          )}
          {s.deadline_impact && (
            <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Deadline impact
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {s.deadline_impact.dates_mentioned.map((d, i) => (
                  <span key={i} className="text-xs font-mono px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                    {d}
                  </span>
                ))}
              </div>
              {s.deadline_impact.slippage_detected && (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠ {s.deadline_impact.slippage_detected}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {s.key_quotes?.length > 0 && (
        <Section icon={Quote} title="Key quotes" accent="violet">
          <div className="space-y-3">
            {s.key_quotes.map((q, i) => (
              <blockquote
                key={i}
                className="pl-4 border-l-2 border-violet-300 dark:border-violet-700"
              >
                <p className="text-sm italic text-slate-700 dark:text-slate-300">“{q.quote}”</p>
                <footer className="text-xs text-slate-500 mt-1">— {q.speaker}</footer>
              </blockquote>
            ))}
          </div>
        </Section>
      )}

      {s.topics_covered?.length > 0 && (
        <Section icon={Users} title="Topics covered" accent="slate">
          <div className="space-y-1.5">
            {s.topics_covered.map((t, i) => (
              <div key={i} className="text-sm flex justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span>{t.topic}</span>
                <span className="text-xs text-slate-500 shrink-0">
                  {t.participants.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.attendance && (
        <Section icon={Users} title="Attendance" accent="slate">
          <div className="text-sm space-y-1">
            <div>
              <span className="text-slate-500">Present:</span> {s.attendance.present.join(", ") || "—"}
            </div>
            {s.attendance.absent?.length > 0 && (
              <div className="text-slate-500">
                Absent from project team: {s.attendance.absent.join(", ")}
              </div>
            )}
            {s.attendance.left_early?.length > 0 && (
              <div className="text-slate-500">
                Left early: {s.attendance.left_early.join(", ")}
              </div>
            )}
          </div>
        </Section>
      )}

      {s.sentiment_signals?.length > 0 && (
        <Section icon={TrendingUp} title="Sentiment" accent="violet">
          <ul className="flex flex-wrap gap-2">
            {s.sentiment_signals.map((sig, i) => (
              <li
                key={i}
                className="text-xs px-3 py-1.5 bg-violet-100 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200 rounded-full"
              >
                {sig}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.follow_ups_suggested?.length > 0 && (
        <Section icon={Calendar} title="Suggested follow-ups" accent="blue">
          <div className="space-y-2">
            {s.follow_ups_suggested.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-sm p-2.5 bg-blue-50/50 dark:bg-blue-950/10 rounded-lg"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded shrink-0">
                  {f.type.replace("_", " ")}
                </span>
                <span>{f.payload}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
