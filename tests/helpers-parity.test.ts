// Helper functions that differed from the C++ they were ported from
// (PolyClipping/Clipper2 clipper.h, clipper.core.h, clipper.rectclip.cpp, clipper.minkowski.h).
import { describe, test, expect } from 'vitest';
import { Clipper, FillRule, InternalClipper, Minkowski, type Path64, type PathD, type PathsD } from '../src';

const xy = (paths: { x: number, y: number }[][]): number[][][] => paths.map(p => p.map(q => [q.x, q.y]));

describe('rectClip', () => {
  test('a rect of whole numbers still clips decimal paths at their precision', () => {
    // the rect was taken for a Rect64 when its left was whole, and the paths were left unscaled
    const paths: PathsD = [[{ x: -5.123, y: 2.345 }, { x: 5.678, y: 2.345 }, { x: 5.678, y: 7.891 }, { x: -5.123, y: 7.891 }]];
    const expected = [[0, 7.89], [0, 2.35], [5.68, 2.35], [5.68, 7.89]];
    for (const rect of [{ left: 0, top: 0, right: 10, bottom: 10 }, { left: 0, top: 0, right: 10.5, bottom: 10.5 }]) {
      const solution = Clipper.rectClip(rect, paths);
      expect(solution).toHaveLength(1);
      expect(solution[0]).toHaveLength(4);
      solution[0].forEach((pt, i) => {
        expect(pt.x).toBeCloseTo(expected[i][0], 9);
        expect(pt.y).toBeCloseTo(expected[i][1], 9);
      });
    }
    const lines = Clipper.rectClipLines({ left: 0, top: 0, right: 10, bottom: 10 }, [[{ x: -5.5, y: 5.25 }, { x: 5.678, y: 7.891 }]]);
    expect(lines).toHaveLength(1);
    expect(lines[0][1].x).toBeCloseTo(5.68, 9);
  });

  test('whole paths in a whole rect are clipped as integers', () => {
    expect(xy(Clipper.rectClip({ left: 0, top: 0, right: 10, bottom: 10 }, [Clipper.makePath([-5,2, 5,2, 5,7, -5,8])])))
      .toEqual([[[0,8], [0,2], [5,2], [5,7]]]);
  });

  test('a precision of 0 is used, not replaced by the default', () => {
    const paths: PathsD = [[{ x: -5.4, y: 2.4 }, { x: 5.4, y: 2.4 }, { x: 5.4, y: 7.6 }, { x: -5.4, y: 7.6 }]];
    expect(xy(Clipper.rectClip({ left: 0.4, top: 0.4, right: 10.4, bottom: 10.4 }, paths, 0)))
      .toEqual([[[0,8], [0,2], [5,2], [5,8]]]);
  });

  test('an edge along the top of the rect and through its corner is crossed at the right side, as in C++', () => {
    const rect = { left: 0, top: 0, right: 6, bottom: 4 };
    expect(xy(Clipper.rectClip(rect, [Clipper.makePath([2,0, 8,3, 4,1, 7,0])]))).toEqual([[[6,2], [4,1], [6,0], [2,0]]]);
    expect(xy(Clipper.rectClip(rect, [Clipper.makePath([4,0, 8,0, 3,2, 8,0])]))).toEqual([[[6,1]]]);
  });
});

describe('precision in the D functions', () => {
  const square = (o: number, size: number): PathD =>
    [{ x: o, y: o }, { x: o + size, y: o }, { x: o + size, y: o + size }, { x: o, y: o + size }];

  test('unionD takes a precision of 0, with and without a clip', () => {
    const expected = [[[10,5], [15,5], [15,15], [5,15], [5,10], [0,10], [0,0], [10,0]]];
    expect(xy(Clipper.unionD([square(0.4, 10)], [square(5.3, 10)], FillRule.NonZero, 0))).toEqual(expected);
    expect(xy(Clipper.unionD([square(0.4, 10), square(5.3, 10)], FillRule.NonZero, 0))).toEqual(expected);
  });
});

describe('Minkowski', () => {
  test('the D forms round half away from zero when scaling, as in C++', () => {
    const pattern: PathD = [{ x: 0, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 2.5 }, { x: 0, y: 2.5 }];
    const path: PathD = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    // 2.5 becomes 3 at no decimal places, so the sum reaches 13 and not 12
    const sum = Minkowski.sumD(pattern, path, true, 0);
    expect(Math.max(...sum.flat().map(pt => pt.x))).toBe(13);
    expect(xy(Clipper.minkowskiSumD(pattern, path, true, 0))).toEqual(xy(sum));
  });
});

describe('path simplifying helpers', () => {
  test('stripNearDuplicates drops every closing point near the first and keeps a lone point, as in C++', () => {
    expect(Clipper.stripNearDuplicates([{ x: 3, y: 3 }], 1, true)).toEqual([{ x: 3, y: 3 }]);
    expect(xy([Clipper.stripNearDuplicates([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 0.9 }], 1, true)]))
      .toEqual([[[0,0], [10,0]]]);
  });

  test('ramerDouglasPeuckerD compares the end points exactly, as in C++', () => {
    const path: PathD = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 1e-13, y: 0 }];
    expect(Clipper.ramerDouglasPeuckerD(path, 1)).toHaveLength(5);
  });
});

describe('path2ContainsPath1 on large paths', () => {
  test('edge midpoints still settle paths spanning up to 2^51', () => {
    // a hole touching its U-shaped owner at every vertex, 30 * 2^46 across
    const scaled = (pts: number[][]): Path64 => pts.map(([x, y]) => ({ x: x * 2 ** 46, y: y * 2 ** 46 }));
    const hole = scaled([[0,30], [0,0], [30,0], [30,30], [20,10], [10,10]]);
    const owner = scaled([[0,0], [30,0], [30,30], [20,30], [20,10], [10,10], [10,30], [0,30]]);
    expect(InternalClipper.path2ContainsPath1(hole, owner)).toBe(true);
  });
});
