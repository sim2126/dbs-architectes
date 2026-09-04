/**
 * Board — a grouped, typed, editable table in the Monday idiom.
 *
 * Pure presentation: hand it columns, rows and callbacks. Bindings live in
 * the feature that owns the data (see features/projects/client/projects-board).
 */
export { Board, type BoardProps, type BulkAction } from "./board";
export { BoardControls } from "./controls";
export {
  activeFilterCount,
  applyView,
  clearFilters,
  cycleSort,
  EMPTY_VIEW,
  isFiltered,
  isHidden,
  selectedValues,
  toggleFilterValue,
  toggleHidden,
  togglePerson,
  type BoardSort,
  type BoardView,
} from "./view-state";
export {
  displayValue,
  isEditable,
  personInitials,
  type BoardCellValue,
  type BoardColumn,
  type BoardColumnKind,
  type BoardPerson,
  type BoardRow,
} from "./columns";
export { columnSummary, groupRows, statusDistribution, type BoardGroup, type SummarySegment } from "./grouping";
export {
  groupCheckState,
  pruneSelection,
  selectRange,
  selectionLabel,
  toggle,
  toggleGroup,
  type GroupCheckState,
  type Selection,
} from "./selection";
