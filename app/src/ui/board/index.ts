/**
 * Board — a grouped, typed, editable table in the Monday idiom.
 *
 * Pure presentation: hand it columns, rows and callbacks. Bindings live in
 * the feature that owns the data (see features/projects/client/projects-board).
 */
export { Board, type BoardProps, type BulkAction } from "./board";
export { BoardControls } from "./controls";
export { useDismiss } from "./use-dismiss";
export { Kanban, type KanbanProps } from "./kanban";
export { Calendar, type CalendarProps } from "./calendar";
export {
  formatDay,
  itemSpan,
  parseDayValue,
  toDayValue,
} from "./calendar-layout";
export { ViewsMenu } from "./views-menu";
export {
  describeView,
  MAX_VIEW_NAME,
  normaliseViewName,
  parseSavedViewState,
  type BoardLayout,
  type SavedView,
  type SavedViewState,
} from "./saved-views";
export {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  moveColumn,
  orderedKeys,
  reorderColumn,
  resetColumnWidth,
  setColumnWidth,
} from "./view-state";
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
