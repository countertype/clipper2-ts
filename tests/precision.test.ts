import { describe, test, expect } from 'vitest';
import { Clipper, InternalClipper, type Point64 } from '../src';

function crossProductBigInt(pt1: Point64, pt2: Point64, pt3: Point64): bigint {
  const a = BigInt(pt2.x - pt1.x);
  const b = BigInt(pt3.y - pt2.y);
  const c = BigInt(pt2.y - pt1.y);
  const d = BigInt(pt3.x - pt2.x);
  return (a * b) - (c * d);
}

function dotProductBigInt(pt1: Point64, pt2: Point64, pt3: Point64): bigint {
  const a = BigInt(pt2.x - pt1.x);
  const b = BigInt(pt3.x - pt2.x);
  const c = BigInt(pt2.y - pt1.y);
  const d = BigInt(pt3.y - pt2.y);
  return (a * b) + (c * d);
}

describe('InternalClipper precision with large safe integers', () => {
  test('crossProduct matches BigInt for large deltas', () => {
    const x = 1_000_000_000_000;
    const pt1: Point64 = { x: 0, y: 0 };
    const pt2: Point64 = { x, y: x + 1 };
    const pt3: Point64 = { x: 2 * x + 1, y: 2 * x + 3 };

    const expected = crossProductBigInt(pt1, pt2, pt3);
    expect(expected).toBe(-1n);

    const actual = InternalClipper.crossProduct(pt1, pt2, pt3);
    expect(actual).toBe(Number(expected));
  });

  test('dotProduct matches BigInt for large deltas', () => {
    const x = 1_000_000_000_000;
    const pt1: Point64 = { x: 0, y: 0 };
    const pt2: Point64 = { x, y: x + 1 };
    const pt3: Point64 = { x: 2 * x + 2, y: 0 };

    const expected = dotProductBigInt(pt1, pt2, pt3);
    expect(expected).toBe(-1n);

    const actual = InternalClipper.dotProduct(pt1, pt2, pt3);
    expect(actual).toBe(Number(expected));
  });

  test('area preserves small results for large coordinates', () => {
    const x = 1_000_000_000_000;
    const triangle: Point64[] = [
      { x: 0, y: 0 },
      { x, y: x + 1 },
      { x: 2 * x + 1, y: 2 * x + 3 }
    ];

    expect(Clipper.area(triangle)).toBe(-0.5);
  });

  test('getLineIntersectPt detects non-parallel lines', () => {
    const x = 1_000_000_000_000;
    const ln1a: Point64 = { x: 0, y: 0 };
    const ln1b: Point64 = { x, y: x + 1 };
    const ln2a: Point64 = { x: 0, y: 0 };
    const ln2b: Point64 = { x: 2 * x + 1, y: 2 * x + 3 };

    const { intersects, point } = InternalClipper.getLineIntersectPt(ln1a, ln1b, ln2a, ln2b);
    expect(intersects).toBe(true);
    expect(point).toEqual({ x: 0, y: 0 });
  });
});
