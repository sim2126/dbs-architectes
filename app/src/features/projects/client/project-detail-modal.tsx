"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/components/dialog";
import { Avatar, AvatarFallback } from "@/ui/components/avatar";
import { getPhaseColor, getPhaseOnColor, getStatusColor, getStatusOnColor } from "@/ui/tokens";
import { ProjectCellEditor } from "./project-cell-editor";
import { PROJECT_COLUMNS } from "../domain/editable-columns";

/**
 * Project detail, centre-stage.
 *
 * Replaces the 400px right-hand drawer. A drawer competes with the list for
 * horizontal space — it left roughly 780px on a 1440px screen for a table
 * that wanted 1,700px, which is what forced the column-overflow decision.
 * Centre-stage means the list keeps its full width and the detail gets room
 * to be read rather than squinted at.
 *
 * There is deliberately no thread here. Discussion lives in the project's
 * channel, where people already are. A second comment stream on the detail
 * panel splits the conversation in two and leaves neither half complete.
 */

export type DetailProject = {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  category?: string | null;
  client?: string | null;
  commune?: string | null;
  year?: number | null;
  billing?: string | null;
  notes?: string | null;
  country?: string | null;
  image?: string | null;
  assignments: Array<{
    userId: string;
    role?: string | null;
    user: { id: string; name?: string | null; initials?: string | null };
  }>;
};

/** Body fields in reading order. Phase and status live in the header, so
 *  they are excluded here rather than shown twice. */
const DETAIL_FIELDS = ["client", "commune", "year", "category", "billing"] as const;

export function ProjectDetailModal({
  project,
  open,
  onClose,
  canEdit,
  onOptimistic,
  currentUserId,
}: {
  project: DetailProject | null;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onOptimistic: (patch: Record<string, unknown>) => void;
  currentUserId: string;
}) {
  if (!project) return null;

  // "View messages" is offered only to assigned members. The channels API
  // enforces this independently — this just avoids offering a link that
  // would land on a channel the caller cannot read.
  const isAssigned = project.assignments.some((a) => a.userId === currentUserId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <header className="relative">
          {project.image ? (
            <div className="h-32 w-full overflow-hidden bg-friday-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={project.image} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div
              className="h-3 w-full"
              style={{ background: getPhaseColor(project.phase) }}
            />
          )}

          <div className="px-6 pt-5 pb-4 border-b border-friday-border-soft">
            <p className="font-mono text-xs text-muted-foreground">{project.code}</p>
            <DialogTitle className="font-display italic text-foreground text-3xl leading-[1.1] tracking-normal mt-1.5 pr-8">
              {project.title.replace(project.code + " ", "")}
            </DialogTitle>

            <div className="flex items-center gap-2 mt-3.5">
              <span
                className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: getPhaseColor(project.phase), color: getPhaseOnColor(project.phase) }}
              >
                {project.phase}
              </span>
              <span
                className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: getStatusColor(project.workStatus), color: getStatusOnColor(project.workStatus) }}
              >
                {project.workStatus}
              </span>
              {project.country && (
                <span className="text-xs text-muted-foreground">{project.country}</span>
              )}
            </div>
          </div>
        </header>

        <div className="px-6 py-5 max-h-[55vh] overflow-y-auto">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            {DETAIL_FIELDS.map((field) => {
              const column = PROJECT_COLUMNS.find((c) => c.field === field);
              if (!column) return null;
              const value = project[field as keyof DetailProject];
              return (
                <div key={field} className="min-w-0">
                  <dt className="text-xs text-muted-foreground mb-0.5">{column.label}</dt>
                  <dd className="-ml-2">
                    <ProjectCellEditor
                      projectId={project.id}
                      field={field}
                      value={value as string | number | null | undefined}
                      editable={canEdit}
                      onOptimistic={onOptimistic}
                    />
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-6">
            <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
            <div className="-ml-2">
              <ProjectCellEditor
                projectId={project.id}
                field="notes"
                value={project.notes}
                editable={canEdit}
                onOptimistic={onOptimistic}
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs text-muted-foreground mb-2">
              Team · {project.assignments.length}
            </p>
            {project.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {project.assignments.map((a) => (
                  <li key={a.userId} className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[9px]">
                        {a.user.initials ??
                          a.user.name?.slice(0, 2).toUpperCase() ??
                          "??"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground truncate">
                      {a.user.name ?? "Unknown"}
                    </span>
                    {a.role && (
                      <span className="text-xs text-friday-fg-subtle shrink-0">
                        {a.role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="px-6 py-3.5 border-t border-friday-border-soft flex items-center justify-between gap-3">
          {isAssigned ? (
            <Link
              href={`/dashboard/chat?project=${project.id}`}
              className="inline-flex items-center gap-2 text-sm text-friday-accent hover:underline"
            >
              <MessageSquare className="h-4 w-4" />
              View messages and updates
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              Discussion is open to assigned members.
            </span>
          )}
          <Link
            href={`/dashboard/projects/${project.id}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Open full project
          </Link>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
