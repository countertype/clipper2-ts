// StripeIndex speeds up the point-in-polygon tests that decide nesting in a
// PolyTree. It must give the same answers as the plain test.
//
// Ported from PolyClipping/Clipper2 884ba82 (CPP/Tests/TestStripeIndex.cpp).
// The real-world data files that commit added are not included here.
import { describe, test, expect } from 'vitest';
import {
  Clipper, Clipper64, ClipType, FillRule, InternalClipper, OutPt, OutRec,
  PointInPolygonResult, PolyTree64, type Path64, type Paths64, type Point64,
} from '../src';
import { StripeIndex } from '../src/Engine';

const makeSquare = (size: number): Path64 => Clipper.makePath([0,0, size,0, size,size, 0,size]);

// Many-edged ring so the index spans several stripes.
function makeCircle(r: number, n: number): Path64 {
  const p: Path64 = [];
  for (let i = 0; i < n; i++) {
    const a = 2.0 * Math.PI * i / n;
    p.push({ x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) });
  }
  return p;
}

// Independent ground truth for "pt on boundary" so the fuzz can assert exact equality
// off-boundary rather than skipping every IsOn (which would mask a spurious IsOn).
function isOnAnySegment(poly: Path64, pt: Point64): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if (InternalClipper.crossProductSign(a, b, pt) !== 0) continue;
    if (pt.x >= Math.min(a.x, b.x) && pt.x <= Math.max(a.x, b.x) &&
      pt.y >= Math.min(a.y, b.y) && pt.y <= Math.max(a.y, b.y)) return true;
  }
  return false;
}

// Deterministic generator so the fuzz is reproducible.
function lcg(seed: number): (lo: number, hi: number) => number {
  let state = seed >>> 0;
  return (lo, hi) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return lo + Math.floor(state / 4294967296 * (hi - lo + 1));
  };
}

function indexOf(path: Path64): StripeIndex {
  const index = new StripeIndex();
  index.buildFromPath(path);
  return index;
}

function expectMatchesPlainTest(index: StripeIndex, poly: Path64, pt: Point64): void {
  const actual = index.pointInPolygon(pt);
  if (isOnAnySegment(poly, pt)) expect(actual).toBe(PointInPolygonResult.IsOn);
  else expect(actual).toBe(Clipper.pointInPolygon(pt, poly));
}

// Depth-first PolyTree signature: level, hole flag and coordinates of every node.
function treeSignature(subject: Paths64, clip: Paths64, ct: ClipType, fr: FillRule, threshold: number): string {
  const clipper = new Clipper64();
  clipper.pipIndexThreshold = threshold;
  clipper.addSubject(subject);
  clipper.addClip(clip);
  const tree = new PolyTree64();
  const open: Paths64 = [];
  clipper.execute(ct, fr, tree, open);

  let sig = '';
  const walk = (node: { count: number; child(i: number): any }, level: number): void => {
    for (let i = 0; i < node.count; i++) {
      const c = node.child(i);
      sig += `${level}${c.isHole ? 'H' : 'S'}${c.polygon.map((pt: Point64) => `${pt.x},${pt.y}`).join(' ')};`;
      walk(c, level + 1);
    }
  };
  walk(tree, 0);
  return sig;
}

describe('StripeIndex (PolyClipping/Clipper2 884ba82)', () => {
  test('points inside, outside, on an edge and on a vertex of a square', () => {
    const index = indexOf(makeSquare(100));
    expect(index.pointInPolygon({ x: 50, y: 50 })).toBe(PointInPolygonResult.IsInside);

    expect(index.pointInPolygon({ x: 150, y: 50 })).toBe(PointInPolygonResult.IsOutside);
    expect(index.pointInPolygon({ x: -10, y: 50 })).toBe(PointInPolygonResult.IsOutside);
    expect(index.pointInPolygon({ x: 50, y: 200 })).toBe(PointInPolygonResult.IsOutside);
    expect(index.pointInPolygon({ x: 50, y: -5 })).toBe(PointInPolygonResult.IsOutside);

    expect(index.pointInPolygon({ x: 50, y: 0 })).toBe(PointInPolygonResult.IsOn);   // horizontal edge
    expect(index.pointInPolygon({ x: 100, y: 50 })).toBe(PointInPolygonResult.IsOn); // vertical edge
    expect(index.pointInPolygon({ x: 0, y: 0 })).toBe(PointInPolygonResult.IsOn);
    expect(index.pointInPolygon({ x: 100, y: 100 })).toBe(PointInPolygonResult.IsOn);
  });

  test('a point on an edge\'s line but off the segment is not on the ring', () => {
    const index = indexOf(makeSquare(100));
    expect(index.pointInPolygon({ x: 200, y: 0 })).toBe(PointInPolygonResult.IsOutside);
    expect(index.pointInPolygon({ x: -50, y: 0 })).toBe(PointInPolygonResult.IsOutside);
    expect(index.pointInPolygon({ x: 100, y: 200 })).toBe(PointInPolygonResult.IsOutside);
  });

  test('matches the plain test on a concave polygon', () => {
    // A concave "C" shape exercises the parity logic on a non-convex ring.
    const poly = Clipper.makePath([0,0, 100,0, 100,30, 30,30, 30,70, 100,70, 100,100, 0,100]);
    const index = indexOf(poly);
    for (let y = -5; y <= 105; y += 3) {
      for (let x = -5; x <= 105; x += 3) expectMatchesPlainTest(index, poly, { x, y });
    }
  });

  test('degenerate paths have no interior', () => {
    const empty = indexOf([]);
    expect(empty.empty).toBe(true);
    expect(empty.pointInPolygon({ x: 0, y: 0 })).toBe(PointInPolygonResult.IsOutside);

    const segment = indexOf(Clipper.makePath([0,0, 10,0]));
    expect(segment.pointInPolygon({ x: 5, y: 0 })).toBe(PointInPolygonResult.IsOutside);

    // A zero-height ring is declined, so points on it are outside as the plain test says.
    const flat = indexOf(Clipper.makePath([0,10, 50,10, 100,10]));
    expect(flat.empty).toBe(true);
    for (const pt of [{ x: 50, y: 10 }, { x: 0, y: 10 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 200, y: 10 }]) {
      expect(flat.pointInPolygon(pt)).toBe(PointInPolygonResult.IsOutside);
    }
  });

  test('matches the plain test across several stripes', () => {
    const poly = makeCircle(10000, 256);
    const index = indexOf(poly);
    const next = lcg(0x9E3779B9);
    let checked = 0;

    for (let i = 0; i < 20000; i++) {
      const pt = { x: next(-10200, 10200), y: next(-10200, 10200) };
      const actual = index.pointInPolygon(pt);
      if (isOnAnySegment(poly, pt)) {
        if (actual !== PointInPolygonResult.IsOn) expect(actual).toBe(PointInPolygonResult.IsOn);
      } else {
        const expected = Clipper.pointInPolygon(pt, poly);
        if (actual !== expected) expect(actual).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000); // the loop really exercised non-boundary points
  });

  test('points on the top, bottom and vertex rows match the plain test', () => {
    // These rows stress half-open parity and clamping.
    const poly = Clipper.makePath([0,0, 100,0, 60,50, 100,100, 0,100, 40,50]);
    const index = indexOf(poly);
    for (const y of [0, 50, 100]) {
      for (let x = -10; x <= 110; x++) expectMatchesPlainTest(index, poly, { x, y });
    }
  });

  test('an index built from a ring of output points matches one built from a path', () => {
    const poly = makeCircle(5000, 97); // odd count, ensures distinct edges
    const outrec = new OutRec();
    const nodes = poly.map(pt => new OutPt(pt, outrec));
    nodes.forEach((op, i) => {
      op.next = nodes[(i + 1) % nodes.length];
      op.prev = nodes[(i + nodes.length - 1) % nodes.length];
    });

    const fromPath = indexOf(poly);
    const fromRing = new StripeIndex();
    fromRing.buildFromRing(nodes[0]);
    expect(fromRing.edgeCount).toBe(fromPath.edgeCount);

    const next = lcg(0xD1B54A32);
    for (let i = 0; i < 5000; i++) {
      const pt = { x: next(-5200, 5200), y: next(-5200, 5200) };
      const a = fromRing.pointInPolygon(pt), b = fromPath.pointInPolygon(pt);
      if (a !== b) expect(a).toBe(b);
    }
  });

  test('a comb whose edges all span the full height is declined', () => {
    // Every edge would land in every stripe, so the index leaves itself empty
    // rather than lose to the plain test.
    const comb: Path64 = [];
    for (let i = 0; i < 200; i++) comb.push({ x: i, y: (i & 1) ? 100000 : 0 });
    expect(indexOf(comb).empty).toBe(true);
  });

  test('nested rings give the same PolyTree with and without the index', () => {
    // Concentric circles nest as alternating solids and holes, exercising the
    // owner determination the index accelerates.
    const subject: Paths64 = [makeCircle(10000, 220), makeCircle(7500, 200), makeCircle(5000, 180), makeCircle(2500, 160)];
    const plain = treeSignature(subject, [], ClipType.Union, FillRule.EvenOdd, Infinity);
    const indexed = treeSignature(subject, [], ClipType.Union, FillRule.EvenOdd, 1);
    expect(plain).not.toBe('');
    expect(plain).toContain('H'); // the tree really nests
    expect(indexed).toBe(plain);
  });

  test('random clips give the same PolyTree with and without the index', () => {
    const next = lcg(808);
    const blob = (cx: number, cy: number, r: number, n: number, cw: boolean): Path64 => {
      const p: Path64 = [];
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n, rr = r * (0.7 + 0.3 * next(0, 1000) / 1000);
        p.push({ x: Math.round(cx + rr * Math.cos(a)), y: Math.round(cy + rr * Math.sin(a)) });
      }
      return cw ? p.reverse() : p;
    };

    for (let i = 0; i < 150; i++) {
      const range = [300, 20000, 5000000][i % 3];
      const subject: Paths64 = [blob(0, 0, range, next(70, 300), next(0, 1) === 1)];
      const inner = next(3, 25);
      for (let d = 0; d < inner; d++) {
        const r = Math.round(range * (0.02 + next(0, 250) / 1000));
        const cx = next(-range, range), cy = next(-range, range);
        subject.push(blob(cx, cy, r, next(0, 9) < 3 ? next(70, 150) : next(3, 12), next(0, 1) === 1));
        if (next(0, 9) < 4) subject.push(blob(cx, cy, Math.round(r * 0.4), next(3, 90), next(0, 1) === 1));
      }
      // a small triangle touching a vertex of the big ring
      const v = subject[0][next(0, subject[0].length - 1)];
      subject.push([{ x: v.x, y: v.y }, { x: Math.round(v.x * 0.9), y: Math.round(v.y * 0.9) + 3 },
        { x: Math.round(v.x * 0.9) + 3, y: Math.round(v.y * 0.9) }]);

      const ct = [ClipType.Intersection, ClipType.Union, ClipType.Difference, ClipType.Xor][next(0, 3)];
      const fr = [FillRule.EvenOdd, FillRule.NonZero, FillRule.Positive, FillRule.Negative][next(0, 3)];
      const clip: Paths64 = next(0, 9) < 3 ? [blob(next(-range, range), next(-range, range), Math.round(range * 0.6), next(3, 150), false)] : [];
      const plain = treeSignature(subject, clip, ct, fr, Infinity);
      const indexed = treeSignature(subject, clip, ct, fr, 0);
      if (indexed !== plain) expect(indexed).toBe(plain);
    }
  });

  test('a large ring with many holes nests every hole under it', () => {
    const subject: Paths64 = [makeCircle(1000000, 5000)];
    for (let i = 0; i < 400; i++) {
      const hole = makeCircle(8000, 8).map(pt => ({ x: pt.x - 500000 + (i % 20) * 50000, y: pt.y - 500000 + Math.floor(i / 20) * 50000 }));
      subject.push(hole.reverse());
    }
    const tree = new PolyTree64();
    Clipper.booleanOpWithPolyTree(ClipType.Union, subject, null, tree, FillRule.NonZero);
    expect(tree.count).toBe(1);
    expect(tree.child(0).count).toBe(400);
    for (let i = 0; i < 400; i++) expect(tree.child(0).child(i).isHole).toBe(true);
  });
});
