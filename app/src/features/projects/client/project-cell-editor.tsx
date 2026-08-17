"use client";

import { useCallback } from "react";
import { InlineCell } from "@/ui/components/inline-cell";
import { showToast } from "@/ui/components/toast";
import { buildCellPayload, columnFor } from "../domain/editable-columns";

/**
 * One editable project cell, wired to the column contract.
 *
 * Owns its own save so the table row does not accumulate nine handlers.
 * Validation, payload construction and persistence all flow through
 * buildCellPayload — a field this component cannot name is a field it
 * cannot write, which is the property Sheets lacked.
 */
export function ProjectCellEditor({
  projectId,
  field,
  value,
  editable,
  onOptimistic,
}: {
  projectId: string;
  field: string;
  value: string | number | null | undefined;
  editable: boolean;
  /** Applies the change to local state before the server confirms. */
  onOptimistic: (patch: Record<string, unknown>) => void;
}) {
  const column = columnFor(field);

  const commit = useCallback(
    async (raw: string): Promise<boolean> => {
      const built = buildCellPayload(field, raw);
      if (!built.ok) {
        showToast(built.reason, "danger");
        return false;
      }

      onOptimistic({ id: projectId, ...built.payload });

      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(built.payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          showToast(body?.error ?? "Could not save that change.", "danger");
          // Reverting local state is the caller's concern — it holds the
          // previous value. Returning false reverts the cell itself.
          return false;
        }
        return true;
      } catch {
        showToast("Could not save that change.", "danger");
        return false;
      }
    },
    [field, projectId, onOptimistic],
  );

  // A field with no column definition is a programming error, not a user
  // one — render it read-only rather than offering an edit that cannot save.
  if (!column) {
    return <InlineCell value={value} onCommit={() => false} editable={false} />;
  }

  return (
    <InlineCell
      value={value}
      onCommit={commit}
      editable={editable}
      kind={column.kind}
      options={column.options}
      align={column.kind === "number" ? "right" : "left"}
      placeholder="—"
    />
  );
}
