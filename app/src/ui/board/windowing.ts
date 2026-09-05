/**
 * Which rows are actually worth putting in the DOM.
 *
 * At 24 projects a board can render every row and nobody notices. At the 800
 * DBS will reach it cannot: measured on staging, 500 rows produced 30,632
 * DOM nodes, took 1.9 seconds to become usable, and made sorting take 664 ms
 * against a 200 ms budget. So only the rows near the viewport are rendered,
 * and the rest are represented by two spacer rows per group that hold the
 * scrollbar honest.
 *
 * The arithmetic is exact rather than measured: every row, group header and
 * group footer is given its height explicitly by the board, so the position
 * of any row can be computed without touching the DOM. That means no flash
 * of everything on first paint, and no drift as CSS changes.
 */

export type WindowMetrics = {
  rowHeight: number;
  /** The group's title bar. */
  headerHeight: number;
  /** Add-row plus summary plus the gap under a group. */
  footerHeight: number;
  /**
   * The "nothing here" line an empty group shows instead of rows. It counts
   * towards the height of everything below it, so leaving it out would make
   * every later group drift by one row.
   */
  emptyHeight: number;
};

export type WindowedGroup = {
  /** First row of this group to render, inclusive. */
  firstIndex: number;
  /** Last row to render, inclusive. -1 with firstIndex 0 means none. */
  lastIndex: number;
  /** Pixels of skipped rows above and below, for the spacer rows. */
  topSpacer: number;
  bottomSpacer: number;
};

/**
 * Below this many rows a board renders whole. Windowing costs a little
 * complexity on every scroll, and for a board that fits in a few screens it
 * buys nothing — most boards in this product are that size.
 */
export const WINDOW_THRESHOLD = 150;

/** How much to render beyond the viewport, so scrolling does not show gaps. */
const OVERSCAN_ROWS = 12;

export function shouldWindow(totalRows: number): boolean {
  return totalRows > WINDOW_THRESHOLD;
}

/**
 * Work out, for each group in order, which of its rows fall near the
 * viewport. Collapsed groups contribute their header only and are skipped.
 */
export function windowGroups(
  groups: readonly { rowCount: number; collapsed: boolean }[],
  scrollTop: number,
  viewportHeight: number,
  metrics: WindowMetrics,
): WindowedGroup[] {
  const overscan = OVERSCAN_ROWS * metrics.rowHeight;
  const top = scrollTop - overscan;
  const bottom = scrollTop + viewportHeight + overscan;

  let offset = 0;
  return groups.map((group) => {
    const rowsTop = offset + metrics.headerHeight;
    const rowsHeight = group.collapsed
      ? 0
      : group.rowCount === 0
        ? metrics.emptyHeight
        : group.rowCount * metrics.rowHeight;
    offset = rowsTop + rowsHeight + (group.collapsed ? 0 : metrics.footerHeight);

    if (group.collapsed || group.rowCount === 0) {
      return { firstIndex: 0, lastIndex: -1, topSpacer: 0, bottomSpacer: 0 };
    }

    const rowsBottom = rowsTop + rowsHeight;
    // Entirely above or below what anyone can see: render none, and let one
    // spacer stand in for the whole group.
    if (rowsBottom < top || rowsTop > bottom) {
      return { firstIndex: 0, lastIndex: -1, topSpacer: rowsHeight, bottomSpacer: 0 };
    }

    const firstIndex = Math.max(0, Math.floor((top - rowsTop) / metrics.rowHeight));
    const lastIndex = Math.min(
      group.rowCount - 1,
      Math.ceil((bottom - rowsTop) / metrics.rowHeight),
    );

    return {
      firstIndex,
      lastIndex,
      topSpacer: firstIndex * metrics.rowHeight,
      bottomSpacer: (group.rowCount - 1 - lastIndex) * metrics.rowHeight,
    };
  });
}

/** Every row, for boards small enough not to need any of this. */
export function fullWindow(
  groups: readonly { rowCount: number; collapsed: boolean }[],
): WindowedGroup[] {
  return groups.map((group) => ({
    firstIndex: 0,
    lastIndex: group.collapsed ? -1 : group.rowCount - 1,
    topSpacer: 0,
    bottomSpacer: 0,
  }));
}
