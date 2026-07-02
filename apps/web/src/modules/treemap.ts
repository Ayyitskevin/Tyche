/**
 * Squarified treemap layout (Bruls et al.) + the diverging fill for the HEAT
 * market map. Pure and unit-tested; the module only measures a container and
 * renders the rectangles this returns.
 */

export interface TreemapItem {
  key: string;
  /** Non-negative weight; zero/negative items are dropped by layout(). */
  value: number;
}

export interface TreemapRect<T extends TreemapItem = TreemapItem> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

function worstAspect(row: number[], side: number, scale: number): number {
  const sum = row.reduce((a, b) => a + b, 0) * scale;
  const rowThickness = sum / side;
  let worst = 0;
  for (const value of row) {
    const length = (value * scale) / rowThickness;
    worst = Math.max(worst, rowThickness / length, length / rowThickness);
  }
  return worst;
}

/**
 * Lay `items` (any order) into `[x, y, w, h]`, area-proportional to value.
 * Items are placed largest-first in rows/columns along the shorter side,
 * finalizing each row when adding the next item would worsen its aspect ratio.
 */
export function squarify<T extends TreemapItem>(items: T[], x: number, y: number, w: number, h: number): Array<TreemapRect<T>> {
  const usable = items.filter((i) => i.value > 0 && Number.isFinite(i.value));
  if (usable.length === 0 || w <= 0 || h <= 0) return [];
  const sorted = [...usable].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, i) => sum + i.value, 0);
  const scale = (w * h) / total;

  const rects: Array<TreemapRect<T>> = [];
  let row: T[] = [];
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;

  const layoutRow = (finalRow: T[]) => {
    const rowArea = finalRow.reduce((sum, i) => sum + i.value, 0) * scale;
    const horizontal = cw >= ch; // lay the row along the shorter side
    const thickness = horizontal ? rowArea / ch : rowArea / cw;
    let offset = 0;
    for (const item of finalRow) {
      const length = (item.value * scale) / thickness;
      rects.push(
        horizontal
          ? { item, x: cx, y: cy + offset, w: thickness, h: length }
          : { item, x: cx + offset, y: cy, w: length, h: thickness },
      );
      offset += length;
    }
    if (horizontal) {
      cx += thickness;
      cw -= thickness;
    } else {
      cy += thickness;
      ch -= thickness;
    }
  };

  for (const item of sorted) {
    const side = Math.min(cw, ch);
    if (row.length === 0) {
      row.push(item);
      continue;
    }
    const current = worstAspect(row.map((i) => i.value), side, scale);
    const withItem = worstAspect([...row, item].map((i) => i.value), side, scale);
    if (withItem <= current) {
      row.push(item);
    } else {
      layoutRow(row);
      row = [item];
    }
  }
  if (row.length > 0) layoutRow(row);
  return rects;
}

// --- Diverging fill (validated: poles #dc2626/#059669 pass lightness, chroma,
// CVD ΔE 23+, and 3:1 contrast on the zinc-950 surface; the neutral midpoint is
// intentionally low-chroma — near-zero tiles carry their signed % as text).

const DOWN_POLE: [number, number, number] = [0xdc, 0x26, 0x26];
const UP_POLE: [number, number, number] = [0x05, 0x96, 0x69];
const NEUTRAL: [number, number, number] = [0x3f, 0x3f, 0x46];

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const channel = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * t);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

/** Fill for a % change: neutral gray at 0, saturating to a pole at ±`maxAbsPct`. */
export function divergingFill(changePercent: number | null, maxAbsPct = 3): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return mix(NEUTRAL, NEUTRAL, 0);
  const t = Math.min(1, Math.abs(changePercent) / maxAbsPct);
  return mix(NEUTRAL, changePercent >= 0 ? UP_POLE : DOWN_POLE, t);
}

export interface GroupLayout<T extends TreemapItem = TreemapItem> {
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tiles laid inside the group, below its header strip. */
  tiles: Array<TreemapRect<T>>;
}

/**
 * Two-level treemap: groups are squarified over the full area (sized by their
 * summed weight), then each group's members are squarified inside it beneath a
 * `headerH`-tall label strip. Groups too short for a header drop the strip.
 */
export function squarifyGrouped<T extends TreemapItem & { group: string }>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number,
  headerH = 14,
): Array<GroupLayout<T>> {
  const byGroup = new Map<string, T[]>();
  for (const item of items) {
    if (!(item.value > 0)) continue;
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }
  const groups = [...byGroup.entries()].map(([group, members]) => ({
    key: group,
    value: members.reduce((sum, m) => sum + m.value, 0),
    members,
  }));
  return squarify(groups, x, y, w, h).map((rect) => {
    const strip = rect.h > headerH * 2.5 ? headerH : 0;
    return {
      group: rect.item.key,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      tiles: squarify(rect.item.members, rect.x, rect.y + strip, rect.w, Math.max(0, rect.h - strip)),
    };
  });
}
