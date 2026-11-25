/**
 * Union must not fill a hole that fixSelfIntersects splits off as a reversed loop.
 * Upstream: https://github.com/AngusJohnson/Clipper2/pull/1109
 *
 * Three thin triangles enclose a small gap. One edge is brought across another
 * while the intersections are rounded, and fixSelfIntersects splits the gap
 * off as a loop of opposite orientation. That loop lies inside the remainder,
 * so dropping it (as spurious twists are dropped) filled the hole.
 *
 * The first inputs for this (`minimal` and the 15 vertex pocket) only closed
 * their crack into a hole because intersection points were truncated. Since
 * intersections are rounded (PolyClipping/Clipper2 f774daf) the crack stays
 * open, as it does in C++, and they are kept here to check that.
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import {
  union, difference, booleanOpWithPolyTree, areaPaths, area,
  PolyTree64, PolyPath64, ClipType, FillRule, type Paths64,
} from '../src';

const pocket: Paths64 = JSON.parse(
  readFileSync(new URL('./test-data/union-pocket.json', import.meta.url), 'utf8'));

// the gap between these three triangles is closed off as a hole
const triangles: Paths64 = [
  [{ x: 26, y: -47 }, { x: -55, y: -60 }, { x: -91, y: -55 }],
  [{ x: -48, y: -40 }, { x: -69, y: -10 }, { x: 99, y: -55 }],
  [{ x: -12, y: 23 }, { x: -48, y: -52 }, { x: -42, y: 41 }],
];

const minimal: Paths64 = [
  [{ x: 91, y: 7 }, { x: -145, y: -11 }, { x: -141, y: -15 }],
  [{ x: -28, y: 75 }, { x: -33, y: 76 }, { x: 1, y: 0 }],
  [{ x: -22, y: 51 }, { x: -39, y: 76 }, { x: -25, y: -2 }],
];

/** Winding number of point (x, y) with respect to a set of closed rings. */
function winding(rings: Paths64, x: number, y: number): number {
  let w = 0;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const c = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
      if (a.y <= y) {
        if (b.y > y && c > 0) w++;
      } else if (b.y <= y && c < 0) {
        w--;
      }
    }
  }
  return w;
}

function unionTree(paths: Paths64): PolyTree64 {
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, paths, null, tree, FillRule.NonZero);
  return tree;
}

describe('union keeps a hole split off as a reversed loop (#1109)', () => {
  test('three triangles: hole is kept as its own path', () => {
    // (-23, -47) is in the gap between the triangles
    expect(winding(triangles, -23, -47)).toBe(0);

    const out = union(triangles, FillRule.NonZero);
    expect(winding(out, -23, -47)).toBe(0);
    expect(out).toHaveLength(2);
    expect(areaPaths(out)).toBe(3691.5); // 4069.5 outer, -378 hole

    const hole = out.find(p => area(p) < 0)!;
    expect(hole.map(p => [p.x, p.y])).toEqual([[-43, -41], [23, -47], [-48, -52]]);
  });

  test('three triangles: PolyTree nests the hole under the outer', () => {
    const tree = unionTree(triangles);
    expect(tree.count).toBe(1);
    const outer = tree.child(0) as PolyPath64;
    expect(outer.isHole).toBe(false);
    expect(outer.count).toBe(1);
    const hole = outer.child(0) as PolyPath64;
    expect(hole.isHole).toBe(true);
    expect(area(hole.polygon!)).toBe(-378);
  });

  test('a crack that rounding leaves open is not closed into a hole', () => {
    // (-7, 7) is in the crack between the triangles
    expect(winding(minimal, -7, 7)).toBe(0);

    const out = union(minimal, FillRule.NonZero);
    expect(winding(out, -7, 7)).toBe(0);
    expect(out).toHaveLength(1);
    expect(areaPaths(out)).toBe(1150);
    expect(areaPaths(difference(out, minimal, FillRule.NonZero))).toBe(0);
  });

  test('15 vertex pocket: no area added outside the input', () => {
    const x = 3274.55 * 1024, y = 2269.71 * 1024;
    expect(winding(pocket, x, y)).toBe(0);

    const out = union(pocket, FillRule.NonZero);
    expect(winding(out, x, y)).toBe(0);
    expect(out).toHaveLength(1);
    // was 522 841 250.5 before #1109, and truncation slivers after it
    expect(areaPaths(difference(out, pocket, FillRule.NonZero))).toBe(0);
  });

  test('a reversed loop outside the remainder is still dropped', () => {
    // A bow-tie: the lower lobe is a twist of opposite orientation that lies
    // outside the upper lobe, so it must be discarded, not kept as a hole.
    const bowtie: Paths64 = [[
      { x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 },
    ]];
    const out = union(bowtie, FillRule.NonZero);
    expect(out.every(p => area(p) > 0)).toBe(true);
    expect(areaPaths(out)).toBe(5000);
  });
});
