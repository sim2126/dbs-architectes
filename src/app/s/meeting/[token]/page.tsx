import { prisma } from "@/platform/db";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { SummaryRenderer } from "@/features/calls/client/summary-renderer";

export const dynamic = "force-dynamic";

export default async function PublicMeetingSummaryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const call = await prisma.call.findUnique({
    where: { shareToken: token },
    include: {
      starter: { select: { name: true, email: true } },
      project: { select: { code: true, title: true } },
      participants: {
        include: { user: { select: { name: true, initials: true, image: true } } },
      },
    },
  });

  if (!call || !call.summary) notFound();

  const duration = call.endedAt
    ? Math.round((+new Date(call.endedAt) - +new Date(call.createdAt)) / 60000)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            DBS Meeting Summary · {call.summaryMode === "detailed" ? "Detailed" : "Simple"}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {call.title ?? "Team Meeting"}
          </h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            <span>{format(new Date(call.createdAt), "PPP 'at' p")}</span>
            {duration !== null && <span>· {duration} min</span>}
            <span>· Hosted by {call.starter.name ?? call.starter.email}</span>
            {call.project && (
              <span>
                · <span className="font-mono font-medium">{call.project.code}</span> {call.project.title}
              </span>
            )}
          </div>

          {/* Attendees */}
          <div className="flex items-center gap-2 mt-4">
            {call.participants.slice(0, 8).map((p, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold ring-2 ring-white dark:ring-slate-900"
                title={p.user.name ?? ""}
              >
                {p.user.initials ?? p.user.name?.slice(0, 2).toUpperCase() ?? "?"}
              </div>
            ))}
            {call.participants.length > 8 && (
              <span className="text-xs text-slate-500 ml-1">+{call.participants.length - 8}</span>
            )}
          </div>
        </div>

        <SummaryRenderer summary={call.summary as never} recordingUrl={call.recordingUrl} />

        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
          Generated {call.summarizedAt ? format(new Date(call.summarizedAt), "PPP") : ""} by DBS
          Architectes · Meeting Intelligence
        </div>
      </div>
    </div>
  );
}
