import { describe, it, expect } from 'vitest';
import { squarify, divergingFill } from './treemap';

describe('squarify', () => {
  const items = [
    { key: 'A', value: 6 },
    { key: 'B', value: 6 },
    { key: 'C', value: 4 },
    { key: 'D', value: 3 },
    { key: 'E', value: 2 },
    { key: 'F', value: 2 },
    { key: 'G', value: 1 },
  ];

  it('tiles the full area with value-proportional rectangles inside bounds', () => {
    const rects = squarify(items, 0, 0, 600, 400);
    expect(rects).toHaveLength(items.length);
    const totalArea = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(totalArea).toBeCloseTo(600 * 400, 3);
    const totalValue = items.reduce((sum, i) => sum + i.value, 0);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.x + rect.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(400 + 1e-6);
      const expected = (rect.item.value / totalValue) * 600 * 400;
      expect(rect.w * rect.h).toBeCloseTo(expected, 3);
    }
  });

  it('produces non-overlapping tiles', () => {
    const rects = squarify(items, 0, 0, 500, 500);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(Math.min(overlapW, overlapH)).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it('drops non-positive weights and survives empty input', () => {
    expect(squarify([], 0, 0, 100, 100)).toEqual([]);
    const rects = squarify(
      [
        { key: 'A', value: 5 },
        { key: 'Z', value: 0 },
        { key: 'N', value: -3 },
      ],
      0,
      0,
      100,
      100,
    );
    expect(rects.map((r) => r.item.key)).toEqual(['A']);
    expect(rects[0]!.w * rects[0]!.h).toBeCloseTo(10000, 3);
  });
});

describe('divergingFill', () => {
  it('is neutral at zero/null and saturates to the validated poles', () => {
    expect(divergingFill(0)).toBe('#3f3f46');
    expect(divergingFill(null)).toBe('#3f3f46');
    expect(divergingFill(3)).toBe('#059669');
    expect(divergingFill(-3)).toBe('#dc2626');
    expect(divergingFill(30)).toBe('#059669'); // clamped
  });

  it('interpolates monotonically within an arm', () => {
    const mild = divergingFill(1.5);
    expect(mild).not.toBe('#3f3f46');
    expect(mild).not.toBe('#059669');
  });
});
