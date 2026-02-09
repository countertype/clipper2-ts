import { describe, test, expect } from 'vitest';
import { Clipper, Clipper64, ClipperBase, ClipperD, EndType, InternalClipper, JoinType, OutPt, OutRec, PointInPolygonResult, Rect64Utils, type Point64, type Rect64 } from '../src';

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

function signFromBigInt(value: bigint): number {
  return value > 0n ? 1 : value < 0n ? -1 : 0;
}

function areaTriangleBigInt(pt1: Point64, pt2: Point64, pt3: Point64): bigint {
  const term1 = (BigInt(pt3.y) + BigInt(pt1.y)) * (BigInt(pt3.x) - BigInt(pt1.x));
  const term2 = (BigInt(pt1.y) + BigInt(pt2.y)) * (BigInt(pt1.x) - BigInt(pt2.x));
  const term3 = (BigInt(pt2.y) + BigInt(pt3.y)) * (BigInt(pt2.x) - BigInt(pt3.x));
  return term1 + term2 + term3;
}

function areaOutPtBigInt(points: Point64[]): bigint {
  let total = 0n;
  let prev = points[points.length - 1];
  for (const pt of points) {
    const sum = BigInt(prev.y) + BigInt(pt.y);
    const diff = BigInt(prev.x) - BigInt(pt.x);
    total += sum * diff;
    prev = pt;
  }
  return total;
}

function perpendicDistGreaterThanQuarterBigInt(
  pt: Point64, line1: Point64, line2: Point64
): boolean {
  const a = BigInt(pt.x - line1.x);
  const b = BigInt(pt.y - line1.y);
  const c = BigInt(line2.x - line1.x);
  const d = BigInt(line2.y - line1.y);
  if (c === 0n && d === 0n) return false;
  const cross = a * d - c * b;
  const crossSq = cross * cross;
  const denom = (c * c) + (d * d);
  return 4n * crossSq > denom;
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

  test('dotProductSign matches BigInt sign for large deltas', () => {
    const x = 1_000_000_000_000;
    const pt1: Point64 = { x: 0, y: 0 };
    const pt2: Point64 = { x, y: x + 1 };
    const pt3: Point64 = { x: 2 * x + 2, y: 0 };

    const expected = dotProductBigInt(pt1, pt2, pt3);
    const sign = signFromBigInt(expected);
    expect(InternalClipper.dotProductSign(pt1, pt2, pt3)).toBe(sign);
  });

  test('crossProductSign matches BigInt for large deltas', () => {
    const lon = 360_000_000;
    const lat = 180_000_000;
    const pt1: Point64 = { x: 0, y: 0 };
    const pt2: Point64 = { x: lon, y: 0 };
    const pt3: Point64 = { x: 0, y: lat };

    const expected = crossProductBigInt(pt1, pt2, pt3);
    const sign = signFromBigInt(expected);
    expect(InternalClipper.crossProductSign(pt1, pt2, pt3)).toBe(sign);
  });

  test('dotProductSign matches BigInt for large deltas', () => {
    const lon = 360_000_000;
    const lat = 180_000_000;
    const pt1: Point64 = { x: 0, y: 0 };
    const pt2: Point64 = { x: lon, y: 0 };
    const pt3: Point64 = { x: 0, y: lat };

    const expected = dotProductBigInt(pt1, pt2, pt3);
    const sign = signFromBigInt(expected);
    expect(InternalClipper.dotProductSign(pt1, pt2, pt3)).toBe(sign);
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

  test('areaTriangle matches BigInt for large coordinates', () => {
    const x = 1_000_000_000_000;
    const pt1: Point64 = { x: 0, y: 0 };
    const pt2: Point64 = { x, y: x + 1 };
    const pt3: Point64 = { x: 2 * x + 1, y: 2 * x + 3 };
    const expected = areaTriangleBigInt(pt1, pt2, pt3);
    const clipper = new Clipper64() as unknown as {
      areaTriangle: (a: Point64, b: Point64, c: Point64) => bigint;
    };
    expect(clipper.areaTriangle(pt1, pt2, pt3)).toBe(expected);
  });

  test('areaOutPt matches BigInt for large coordinates', () => {
    const x = 1_000_000_000_000;
    const points: Point64[] = [
      { x: 0, y: 0 },
      { x, y: x + 1 },
      { x: 2 * x + 1, y: 2 * x + 3 }
    ];
    const outrec = new OutRec();
    const ops = points.map((pt) => new OutPt(pt, outrec));
    for (let i = 0; i < ops.length; i++) {
      ops[i].next = ops[(i + 1) % ops.length];
      ops[i].prev = ops[(i - 1 + ops.length) % ops.length];
    }
    outrec.pts = ops[0];
    const expected = areaOutPtBigInt(points);
    const areaOutPt = (ClipperBase as unknown as { areaOutPt: (op: OutPt) => bigint }).areaOutPt;
    expect(areaOutPt(outrec.pts)).toBe(expected);
  });

  test('perpendicDistFromLineSqrdGreaterThanQuarter matches BigInt for large coordinates', () => {
    const line1: Point64 = { x: 0, y: 0 };
    const line2: Point64 = { x: 360_000_000, y: 0 };
    const ptNear: Point64 = { x: 180_000_000, y: 0 };
    const ptFar: Point64 = { x: 180_000_000, y: 1 };
    const clipper = new Clipper64() as unknown as {
      perpendicDistFromLineSqrdGreaterThanQuarter: (p: Point64, a: Point64, b: Point64) => boolean;
    };
    expect(clipper.perpendicDistFromLineSqrdGreaterThanQuarter(ptNear, line1, line2))
      .toBe(perpendicDistGreaterThanQuarterBigInt(ptNear, line1, line2));
    expect(clipper.perpendicDistFromLineSqrdGreaterThanQuarter(ptFar, line1, line2))
      .toBe(perpendicDistGreaterThanQuarterBigInt(ptFar, line1, line2));
  });

  test('pointInPolygon handles large safe coordinates', () => {
    const lon = 360_000_000;
    const lat = 180_000_000;
    const rect: Point64[] = [
      { x: 0, y: 0 },
      { x: lon, y: 0 },
      { x: lon, y: lat },
      { x: 0, y: lat }
    ];

    expect(Clipper.pointInPolygon({ x: lon / 2, y: lat / 2 }, rect))
      .toBe(PointInPolygonResult.IsInside);
    expect(Clipper.pointInPolygon({ x: 0, y: lat / 2 }, rect))
      .toBe(PointInPolygonResult.IsOn);
    expect(Clipper.pointInPolygon({ x: lon + 1, y: lat / 2 }, rect))
      .toBe(PointInPolygonResult.IsOutside);
  });

  test('rectClip handles large safe coordinates', () => {
    const rect: Rect64 = { left: 50_000_000, top: 50_000_000, right: 300_000_000, bottom: 150_000_000 };
    const subject: Point64[] = [
      { x: 0, y: 0 },
      { x: 360_000_000, y: 0 },
      { x: 360_000_000, y: 180_000_000 },
      { x: 0, y: 180_000_000 }
    ];

    const result = Clipper.rectClip(rect, subject);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(4);
    expect(InternalClipper.getBounds(result[0])).toEqual(rect);
  });

  test('getLineIntersectPt detects non-parallel lines', () => {
    const x = 1_000_000_000_000;
    const ln1a: Point64 = { x: 0, y: 0 };
    const ln1b: Point64 = { x, y: x + 1 };
    const ln2a: Point64 = { x: 0, y: 0 };
    const ln2b: Point64 = { x: 2 * x + 1, y: 2 * x + 3 };

    const point = InternalClipper.getLineIntersectPt(ln1a, ln1b, ln2a, ln2b);
    expect(point).not.toBeNull();
    expect(point).toEqual({ x: 0, y: 0, z: 0 });
  });

  test('segsIntersect handles large coordinates', () => {
    const x = 1_000_000_000_000;
    const seg1a: Point64 = { x: 0, y: 0 };
    const seg1b: Point64 = { x, y: x };
    const seg2a: Point64 = { x: 0, y: x };
    const seg2b: Point64 = { x, y: 0 };

    expect(InternalClipper.segsIntersect(seg1a, seg1b, seg2a, seg2b)).toBe(true);
  });

  test('segsIntersect handles edge cases at large coordinates', () => {
    const huge = 1_000_000_000_000_000;
    
    // Cross in the middle
    expect(InternalClipper.segsIntersect(
      { x: 0, y: 0 }, { x: huge, y: huge },
      { x: 0, y: huge }, { x: huge, y: 0 }
    )).toBe(true);
    
    // Only touch at a shared endpoint (exclusive)
    expect(InternalClipper.segsIntersect(
      { x: 0, y: 0 }, { x: huge, y: huge },
      { x: huge, y: huge }, { x: huge * 2, y: huge * 2 }
    )).toBe(false);
    
    // Touch at endpoint but don't overlap - still no intersection
    expect(InternalClipper.segsIntersect(
      { x: 0, y: 0 }, { x: huge, y: huge },
      { x: huge, y: huge }, { x: huge * 2, y: huge * 2 },
      true
    )).toBe(false);
    
    // Clearly cross each other
    expect(InternalClipper.segsIntersect(
      { x: 0, y: 0 }, { x: huge, y: 0 },
      { x: huge / 2, y: -huge }, { x: huge / 2, y: huge },
      true
    )).toBe(true);
  });

  test('getLineIntersectPt precision with large deltas', () => {
    const huge = 1_000_000_000_000_000;
    const res = InternalClipper.getLineIntersectPt(
      { x: 0, y: 0 }, { x: huge * 2, y: huge * 2 },
      { x: 0, y: huge * 2 }, { x: huge * 2, y: 0 }
    );
    
    expect(res).not.toBeNull();
    expect(res!.x).toBeCloseTo(huge, -1);
    expect(res!.y).toBeCloseTo(huge, -1);
  });

  test('multiplyUInt64 returns correct hi/lo for safe inputs', () => {
    const a = 0x1_0000_0000;
    const b = 0x1_0000_0000;
    const result = InternalClipper.multiplyUInt64(a, b);
    expect(result.hi64).toBe(1n);
    expect(result.lo64).toBe(0n);
  });

  test('midPoint near MAX_SAFE_INTEGER', () => {
    const left = Number.MAX_SAFE_INTEGER - 10;
    const right = Number.MAX_SAFE_INTEGER;
    const rect: Rect64 = { left, top: 0, right, bottom: 10 };
    
    const mp = Rect64Utils.midPoint(rect);
    expect(mp.x).toBe(Number.MAX_SAFE_INTEGER - 5);
    expect(mp.y).toBe(5);
  });

  test('crossProduct with large intermediate values', () => {
    const base = 2 ** 30;
    const P1: Point64 = { x: 0, y: 0 };
    const P2: Point64 = { x: base + 1, y: base };
    const P3: Point64 = { x: (base + 1) + (base + 2), y: base + (base + 1) };
    
    const result = InternalClipper.crossProduct(P1, P2, P3);
    expect(result).toBe(1);
  });

  test('multiplyUInt64 returns 128-bit result for max safe inputs', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const res = InternalClipper.multiplyUInt64(max, max);
    
    const bigMax = BigInt(max);
    const expected = bigMax * bigMax;
    const expectedHi = expected >> 64n;
    const expectedLo = expected & 0xFFFFFFFFFFFFFFFFn;
    
    expect(res.hi64).toBe(expectedHi);
    expect(res.lo64).toBe(expectedLo);
  });
  test('pointInPolygon handles huge coordinates', () => {
    const huge = Number.MAX_SAFE_INTEGER / 2;
    const poly: Point64[] = [
      { x: -huge, y: -huge },
      { x: huge, y: -huge },
      { x: huge, y: huge },
      { x: -huge, y: huge }
    ];
    
    expect(InternalClipper.pointInPolygon({ x: 0, y: 0 }, poly))
      .toBe(PointInPolygonResult.IsInside);
    expect(InternalClipper.pointInPolygon({ x: huge, y: 0 }, poly))
      .toBe(PointInPolygonResult.IsOn);
    expect(InternalClipper.pointInPolygon({ x: huge + 1, y: 0 }, poly))
      .toBe(PointInPolygonResult.IsOutside);
  });

  test('path2ContainsPath1 handles huge coordinates', () => {
    const huge = Number.MAX_SAFE_INTEGER / 4;
    const outer: Point64[] = [
      { x: -huge, y: -huge },
      { x: huge, y: -huge },
      { x: huge, y: huge },
      { x: -huge, y: huge }
    ];
    
    const inner: Point64[] = [
      { x: -100, y: -100 },
      { x: 100, y: -100 },
      { x: 100, y: 100 },
      { x: -100, y: 100 }
    ];
    
    expect(InternalClipper.path2ContainsPath1(inner, outer)).toBe(true);
    
    const outside = inner.map(pt => ({ x: pt.x + huge * 2, y: pt.y }));
    expect(InternalClipper.path2ContainsPath1(outside, outer)).toBe(false);
  });

  test('distanceSqr handles large deltas without overflow', () => {
    const huge = 100_000_000; 
    const distSq = Clipper.distanceSqr({ x: 0, y: 0 }, { x: huge, y: huge });
    const expected = Number(BigInt(huge) * BigInt(huge) + BigInt(huge) * BigInt(huge));
    expect(distSq).toBe(expected);
  });

  test('distanceSqr uses BigInt when sum exceeds safe range', () => {
    const delta = 80_000_000;
    const distSq = Clipper.distanceSqr({ x: 0, y: 0 }, { x: delta, y: delta });
    const expected = Number(2n * BigInt(delta) * BigInt(delta));
    expect(distSq).toBe(expected);
  });

  test('perpendicDistFromLineSqrd64 handles large deltas', () => {
    const huge = 100_000_000;
    const distSq = Clipper.perpendicDistFromLineSqrd64(
      { x: 0, y: huge },
      { x: 0, y: 0 },
      { x: huge, y: 0 }
    );
    
    const expected = Number(BigInt(huge) * BigInt(huge));
    expect(distSq).toBeCloseTo(expected, -5);
  });

  test('scalePath64 handles large scale factors', () => {
    const path: Point64[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const scaled = Clipper.scalePath64(path.map(p => ({ x: p.x, y: p.y })), 100);
    expect(scaled[1].x).toBe(1000);
  });

  test('scalePath64 throws when scaled coordinates exceed safe range', () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const path = [{ x: huge, y: 0 }];
    expect(() => Clipper.scalePath64(path, 2)).toThrow(RangeError);
  });

  test('ClipperD throws when scaling exceeds safe range', () => {
    const precision = 2;
    const scale = Math.pow(10, precision);
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    const tooLarge = maxAbs + 1;
    const c = new ClipperD(precision);
    const path = [{ x: tooLarge, y: 0 }, { x: tooLarge + 1, y: 0 }, { x: tooLarge + 1, y: 1 }];
    expect(() => c.addSubject(path)).toThrow(RangeError);
  });

  test('ClipperD allows coordinates at safe limit', () => {
    const precision = 0;
    const scale = Math.pow(10, precision);
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    const c = new ClipperD(precision);
    const path = [
      { x: maxAbs, y: 0 },
      { x: maxAbs - 1, y: 1 },
      { x: maxAbs - 1, y: 0 }
    ];
    expect(() => c.addSubject(path)).not.toThrow();
  });

  test('inflatePathsD throws when scaling exceeds safe range', () => {
    const precision = 2;
    const scale = Math.pow(10, precision);
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    const tooLarge = maxAbs + 1;
    const paths = [[
      { x: tooLarge, y: 0 },
      { x: tooLarge + 1, y: 0 },
      { x: tooLarge + 1, y: 1 }
    ]];
    expect(() => Clipper.inflatePathsD(paths, 1, JoinType.Miter, EndType.Polygon, 2, precision))
      .toThrow(RangeError);
  });
});
