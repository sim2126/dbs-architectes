/**
 * Row selection.
 *
 * Monday's board selects with a checkbox per row, a checkbox per group, and
 * shift-click for a range; the selection then drives one bulk action bar.
 * The maths is small but easy to get subtly wrong, so it lives here with
 * tests rather than inside a click handler.
 */

export type Selection = ReadonlySet<string>;

export function toggle(selection: Selection, id: string): Set<string> {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Select every row between the anchor and the target inclusive, in the
 * board's visual order. Rows outside the range keep whatever state they had,
 * which is what shift-click does everywhere else.
 */
export function selectRange(
  selection: Selection,
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): Set<string> {
  const from = orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(targetId);
  if (from === -1 || to === -1) return toggle(selection, targetId);
  const [start, end] = from <= to ? [from, to] : [to, from];
  const next = new Set(selection);
  for (let i = start; i <= end; i++) next.add(orderedIds[i]);
  return next;
}

/** A group's checkbox: all on, or all off if the group is already whole. */
export function toggleGroup(selection: Selection, groupIds: readonly string[]): Set<string> {
  const next = new Set(selection);
  const whole = groupIds.length > 0 && groupIds.every((id) => next.has(id));
  for (const id of groupIds) {
    if (whole) next.delete(id);
    else next.add(id);
  }
  return next;
}

export type GroupCheckState = "none" | "some" | "all";

export function groupCheckState(selection: Selection, groupIds: readonly string[]): GroupCheckState {
  if (groupIds.length === 0) return "none";
  let selected = 0;
  for (const id of groupIds) if (selection.has(id)) selected++;
  if (selected === 0) return "none";
  return selected === groupIds.length ? "all" : "some";
}

/**
 * Drop ids that are no longer on the board. Without this a filter change
 * leaves the bulk bar claiming a count the user cannot see.
 */
export function pruneSelection(selection: Selection, visibleIds: readonly string[]): Set<string> {
  const visible = new Set(visibleIds);
  const next = new Set<string>();
  for (const id of selection) if (visible.has(id)) next.add(id);
  return next;
}

/** The bulk bar's own label. Singular matters: "1 items selected" is sloppy. */
export function selectionLabel(count: number, noun = "project"): string {
  if (count === 0) return "";
  return count === 1 ? `1 ${noun} selected` : `${count} ${noun}s selected`;
}
