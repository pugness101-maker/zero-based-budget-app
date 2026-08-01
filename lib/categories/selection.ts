export type GroupCheckState = boolean | "indeterminate";

/** Checkbox state for a group given its category ids and current selection. */
export function groupCheckboxState(
  groupCategoryIds: string[],
  selected: Set<string>,
): GroupCheckState {
  if (groupCategoryIds.length === 0) return false;
  let count = 0;
  for (const id of groupCategoryIds) {
    if (selected.has(id)) count += 1;
  }
  if (count === 0) return false;
  if (count === groupCategoryIds.length) return true;
  return "indeterminate";
}

export function toggleIdInSet(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function setManyInSet(
  selected: Set<string>,
  ids: string[],
  on: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * Shift-click range select over an ordered list of visible ids.
 * Selects (or deselects to match anchor) from lastAnchor through target.
 */
export function applyRangeSelection(
  orderedIds: string[],
  selected: Set<string>,
  targetId: string,
  lastAnchorId: string | null,
  turnOn: boolean,
): { selected: Set<string>; anchorId: string } {
  if (!lastAnchorId || lastAnchorId === targetId) {
    return {
      selected: setManyInSet(selected, [targetId], turnOn),
      anchorId: targetId,
    };
  }
  const a = orderedIds.indexOf(lastAnchorId);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) {
    return {
      selected: setManyInSet(selected, [targetId], turnOn),
      anchorId: targetId,
    };
  }
  const [start, end] = a < b ? [a, b] : [b, a];
  const range = orderedIds.slice(start, end + 1);
  return {
    selected: setManyInSet(selected, range, turnOn),
    anchorId: targetId,
  };
}

export function countSelectedOutsideVisible(
  selected: Set<string>,
  visibleIds: Set<string>,
): number {
  let n = 0;
  for (const id of selected) {
    if (!visibleIds.has(id)) n += 1;
  }
  return n;
}
