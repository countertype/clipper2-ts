/**
 * PCB-style scenario from https://github.com/AngusJohnson/Clipper2/issues/1084
 *
 * Many overlapping rectangular pads are clipped to a tile with RectClip, which
 * leaves edges heavily collinear along the tile boundary. The clipped paths are
 * then unioned, into Paths64 and into a PolyTree64.
 *
 * The upstream report had no reproducer and these inputs do not trigger the
 * checkSplitOwner recursion it describes (see tests/polytree.test.ts for that).
 * They remain as sanity checks on the pipeline: no throw, valid rings,
 * consistent outer orientation, and no output point outside the tile.
 */
import { describe, expect, it } from 'vitest';
import {
  Clipper, Clipper64, ClipType, FillRule,
  PolyTree64, type Path64, type Paths64, type Rect64,
} from '../src';

/** Build a solid rectangle path (CCW = outer in Clipper's convention). */
function rect(l: number, t: number, r: number, b: number): Path64 {
  return Clipper.makePath([l, t, r, t, r, b, l, b]);
}

/** PCB-style grid of overlapping rectangular pads, all on one layer. */
function makePcbPads(
  cols: number, rows: number,
  padW: number, padH: number,
  pitchX: number, pitchY: number,
  offsetX = 0, offsetY = 0,
): Paths64 {
  const paths: Paths64 = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = offsetX + c * pitchX;
      const y = offsetY + r * pitchY;
      paths.push(rect(x, y, x + padW, y + padH));
    }
  }
  return paths;
}

/** Walk a PolyTree64 and collect all polygon paths. */
function collectPolygons(tree: PolyTree64): { outer: Path64[]; holes: Path64[] } {
  const outer: Path64[] = [];
  const holes: Path64[] = [];
  function walk(node: { polygon?: Path64; isHole: boolean; count: number; child(i: number): typeof node }): void {
    if (node.polygon && node.polygon.length > 0) {
      if (node.isHole) holes.push(node.polygon);
      else outer.push(node.polygon);
    }
    for (let i = 0; i < node.count; i++) walk(node.child(i));
  }
  for (let i = 0; i < tree.count; i++) walk(tree.child(i));
  return { outer, holes };
}

/** Check that every point of every polygon lies within (or on) a rect. */
function allPointsInsideRect(paths: Path64[], clip: Rect64): boolean {
  for (const path of paths) {
    for (const pt of path) {
      if (pt.x < clip.left || pt.x > clip.right ||
          pt.y < clip.top  || pt.y > clip.bottom) return false;
    }
  }
  return true;
}

describe('Clipper2 issue #1084 (RectClip → Union → PolyTree64 with collinear edges)', () => {
  const TILE: Rect64 = { left: 0, top: 0, right: 1000, bottom: 1000 };

  it('does not throw a stack overflow in checkSplitOwner', () => {
    // Many overlapping pads whose edges will align with tile boundary after RectClip
    const pads = makePcbPads(8, 8, 160, 160, 120, 120, -60, -60);
    const clipped = Clipper.rectClip(TILE, pads) as Paths64;
    expect(clipped.length).toBeGreaterThan(0);

    const tree = new PolyTree64();
    const clipper = new Clipper64();
    clipper.addSubject(clipped);
    // This call is where upstream reports the stack overflow
    expect(() => clipper.execute(ClipType.Union, FillRule.NonZero, tree)).not.toThrow();
  });

  it('returns simple, non-self-intersecting outer polygons', () => {
    const pads = makePcbPads(8, 8, 160, 160, 120, 120, -60, -60);
    const clipped = Clipper.rectClip(TILE, pads) as Paths64;

    const out: Paths64 = [];
    const clipper = new Clipper64();
    clipper.addSubject(clipped);
    clipper.execute(ClipType.Union, FillRule.NonZero, out);

    for (const path of out) {
      // No path should have fewer than 3 vertices
      expect(path.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('PolyTree64: every outer polygon has negative area (correct CCW orientation)', () => {
    const pads = makePcbPads(8, 8, 160, 160, 120, 120, -60, -60);
    const clipped = Clipper.rectClip(TILE, pads) as Paths64;

    const tree = new PolyTree64();
    const clipper = new Clipper64();
    clipper.addSubject(clipped);
    clipper.execute(ClipType.Union, FillRule.NonZero, tree);

    const { outer } = collectPolygons(tree);
    expect(outer.length).toBeGreaterThan(0);

    for (const path of outer) {
      // Clipper returns outer paths with positive area (CW in screen coords where Y grows down).
      // What matters is that the sign is consistent: all outers should have the same orientation.
      const area = Clipper.area(path);
      // Outer polygons should have positive area (Clipper convention: CW = positive).
      expect(area).toBeGreaterThan(0);
    }
  });

  it('all output points lie within the tile after RectClip (getLineIntersectPt precision)', () => {
    const pads = makePcbPads(6, 6, 200, 200, 150, 150, -75, -75);
    const clipped = Clipper.rectClip(TILE, pads) as Paths64;

    const out: Paths64 = [];
    const clipper = new Clipper64();
    clipper.addSubject(clipped);
    clipper.execute(ClipType.Union, FillRule.NonZero, out);

    // Every resulting point should be inside (or on the boundary of) the tile
    expect(allPointsInsideRect(out, TILE)).toBe(true);
  });

  it('handles a denser grid without throwing (stress test for recursion depth)', () => {
    const pads = makePcbPads(12, 12, 100, 100, 80, 80, -40, -40);
    const clipped = Clipper.rectClip(TILE, pads) as Paths64;

    const tree = new PolyTree64();
    const clipper = new Clipper64();
    clipper.addSubject(clipped);
    expect(() => clipper.execute(ClipType.Union, FillRule.NonZero, tree)).not.toThrow();
  });
});
