// PolyTree nesting when a ring touches its owner, where the vertex test in
// path2ContainsPath1 cannot decide and the edge midpoints are used.
import { describe, test, expect } from 'vitest';
import {
  Clipper, Clipper64, ClipType, FillRule, InternalClipper, Path64, Paths64,
  PointInPolygonResult, PolyPath64, PolyTree64,
} from '../src';

type Node = { poly: Path64; depth: number; parent: Node | null; area: number };

function scaled(paths: number[][][], s: number): Paths64 {
  return paths.map(p => p.map(([x, y]) => ({ x: x * s, y: y * s })));
}

function runTree(ct: ClipType, fr: FillRule, subject: Paths64, clip: Paths64 = []): PolyTree64 {
  const c = new Clipper64();
  c.addSubject(subject);
  if (clip.length > 0) c.addClip(clip);
  const tree = new PolyTree64();
  expect(c.execute(ct, fr, tree)).toBe(true);
  return tree;
}

function flatten(node: PolyTree64 | PolyPath64, depth: number, parent: Node | null, out: Node[]): Node[] {
  for (let i = 0; i < node.count; i++) {
    const k = node.child(i);
    const rec: Node = { poly: k.polygon!, depth, parent, area: Clipper.area(k.polygon!) };
    out.push(rec);
    flatten(k, depth + 1, rec, out);
  }
  return out;
}

// outers have positive area and sit at even depth, holes the reverse
function expectOrientationMatchesDepth(tree: PolyTree64): void {
  for (const n of flatten(tree, 0, null, [])) {
    expect(n.area !== 0 && (n.area > 0) === (n.depth % 2 === 0)).toBe(true);
  }
}

// A point strictly inside 'p': the middle of the first two crossings of a
// horizontal line that passes through no vertex of any ring.
function interiorPoint(p: Path64, allYs: Set<number>): { x: number; y: number } | null {
  let ymin = Infinity, ymax = -Infinity;
  for (const q of p) { if (q.y < ymin) ymin = q.y; if (q.y > ymax) ymax = q.y; }
  for (const f of [0.38196601, 0.61803399, 0.2360679, 0.7639321, 0.1458981, 0.8541019]) {
    const y = ymin + (ymax - ymin) * f;
    if (allYs.has(y)) continue;
    const xs: number[] = [];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[j], b = p[i];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    if (xs.length >= 2 && xs[1] - xs[0] > 1e-6) return { x: (xs[0] + xs[1]) / 2, y };
  }
  return null;
}

function containsPoint(p: Path64, pt: { x: number; y: number }): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j], b = p[i];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < a.x + (b.x - a.x) * (pt.y - a.y) / (b.y - a.y)) c = !c;
  }
  return c;
}

// Number of rings whose parent is not the smallest ring that contains them.
// Slivers are skipped: with next to no area, 'inside' has no meaning.
function wronglyParented(tree: PolyTree64): number {
  const nodes = flatten(tree, 0, null, []);
  const ys = new Set<number>();
  for (const n of nodes) for (const q of n.poly) ys.add(q.y);
  let wrong = 0;
  for (const n of nodes) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of n.poly) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    const size = Math.abs(n.area);
    if (size < 0.02 * ((x1 - x0) ** 2 + (y1 - y0) ** 2)) continue;
    const ip = interiorPoint(n.poly, ys);
    if (ip === null) continue;
    let best: Node | null = null;
    for (const m of nodes) {
      if (m === n || Math.abs(m.area) <= size || !containsPoint(m.poly, ip)) continue;
      if (best === null || Math.abs(m.area) < Math.abs(best.area)) best = m;
    }
    if (best !== n.parent) wrong++;
  }
  return wrong;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

describe('PolyTree nesting of rings that touch their owner', () => {
  test('hole touching its owner at every vertex is nested under it', () => {
    const subject = scaled([[[0, 2], [2, 3], [1, 1], [4, 0], [5, 2], [2, 2]]], 1e6);
    const clip = scaled([[[3, 2], [0, 5], [0, 0], [5, 2]]], 1e6);
    const tree = runTree(ClipType.Xor, FillRule.NonZero, subject, clip);
    expectOrientationMatchesDepth(tree);
    expect(wronglyParented(tree)).toBe(0);
    const nodes = flatten(tree, 0, null, []);
    const hole = nodes.find(n => n.poly.length === 3 && n.poly.some(p => p.x === 1.5e6 && p.y === 2e6));
    expect(hole).toBeDefined();
    expect(hole!.depth).toBe(1);
  });

  test('ring that only shares an edge with another is not nested under it', () => {
    const subject = scaled([
      [[5, 6], [1, 2], [2, 0], [3, 4]],
      [[5, 1], [1, 1], [5, 6], [1, 0], [0, 5], [6, 5], [4, 4]],
      [[4, 2], [5, 6], [1, 5], [3, 4]],
    ], 1e6);
    const tree = runTree(ClipType.Difference, FillRule.NonZero, subject);
    expectOrientationMatchesDepth(tree);
    expect(wronglyParented(tree)).toBe(0);
  });

  test('island inside a hole, touching it, is nested under the hole', () => {
    const subject = scaled([
      [[1, 5], [5, 0], [2, 2], [5, 6], [4, 5], [6, 1], [2, 2]],
      [[3, 3], [6, 5], [6, 6], [1, 0]],
      [[5, 2], [5, 4], [5, 0], [6, 4], [3, 0], [3, 3], [1, 2]],
    ], 1e6);
    const clip = scaled([
      [[3, 1], [1, 0], [2, 5]],
      [[2, 0], [3, 2], [3, 0], [2, 1], [1, 3], [3, 4]],
    ], 1e6);
    const tree = runTree(ClipType.Union, FillRule.EvenOdd, subject, clip);
    expectOrientationMatchesDepth(tree);
    expect(wronglyParented(tree)).toBe(0);
  });

  // A disc with thin inward notches; each hole is a triangle on three
  // neighbouring notch tips, so all of its vertices are on the owner.
  function notchedDisc(n: number): { outer: Paths64; holes: Paths64 } {
    const R = 1e9, r = 0.8e9;
    const outer: Path64 = [], tips: Path64 = [];
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, d = 2 * Math.PI / n * 0.2;
      outer.push({ x: Math.round(R * Math.cos(a - d)), y: Math.round(R * Math.sin(a - d)) });
      const tip = { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
      outer.push(tip);
      tips.push(tip);
      outer.push({ x: Math.round(R * Math.cos(a + d)), y: Math.round(R * Math.sin(a + d)) });
    }
    const holes: Paths64 = [];
    for (let i = 0; i + 2 < n; i += 2) {
      holes.push([tips[i], tips[i + 1], tips[i + 2]].map(p => ({ x: p.x, y: p.y })));
    }
    return { outer: [outer], holes };
  }

  // 20 notches keeps the owner, at 60 vertices, on the brute-force test; 40 and
  // 200 put it on the stripe index. The cleaned owner path is cached on both routes
  test.each([20, 40, 200])('many holes touching one owner, %i notches', (n) => {
    const { outer, holes } = notchedDisc(n);
    const tree = runTree(ClipType.Difference, FillRule.NonZero, outer, holes);
    expect(tree.count).toBe(1);
    expect(tree.child(0).count).toBe(holes.length);
    for (let i = 0; i < tree.child(0).count; i++) {
      expect(tree.child(0).child(i).isHole).toBe(true);
      expect(tree.child(0).child(i).count).toBe(0);
    }
  });

  test('upstream TestPolytreeHoles9 (#957)', () => {
    const subject: Paths64 = [
      [77910,46865, 78720,46865, 78720,48000, 77910,48000, 77910,46865],
      [82780,53015, 93600,53015, 93600,54335, 82780,54335, 82780,53015],
      [82780,48975, 84080,48975, 84080,53015, 82780,53015, 82780,48975],
      [77910,48000, 84080,48000, 84080,48975, 77910,48975, 77910,48000],
      [89880,40615, 90700,40615, 90700,46865, 89880,46865, 89880,40615],
      [92700,54335, 93600,54335, 93600,61420, 92700,61420, 92700,54335],
      [78950,47425, 84080,47425, 84080,47770, 78950,47770, 78950,47425],
      [82780,61420, 93600,61420, 93600,62435, 82780,62435, 82780,61420],
      [101680,63085, 100675,63085, 100675,47770, 100680,47770, 100680,40615, 101680,40615, 101680,63085],
      [76195,39880, 89880,39880, 89880,41045, 76195,41045, 76195,39880],
      [85490,56145, 90520,56145, 90520,59235, 85490,59235, 85490,56145],
      [89880,39880, 101680,39880, 101680,40615, 89880,40615, 89880,39880],
      [89880,46865, 100680,46865, 100680,47770, 89880,47770, 89880,46865],
      [82780,54335, 83280,54335, 83280,61420, 82780,61420, 82780,54335],
      [76195,41045, 76855,41045, 76855,62665, 76195,62665, 76195,41045],
      [76195,62665, 100675,62665, 100675,63085, 76195,63085, 76195,62665],
      [82780,41045, 84080,41045, 84080,47425, 82780,47425, 82780,41045],
    ].map(a => Clipper.makePath(a));
    const tree = runTree(ClipType.Union, FillRule.NonZero, subject);
    expect(tree.count).toBe(1);
    expect(tree.child(0).count).toBe(2);
    expect(tree.child(0).child(0).count).toBe(1);
  });

  test('upstream TestPolytreeHoles10 (#973)', () => {
    const subject: Paths64 = [
      [0,0, 79530,0, 79530,940, 0,940, 0,0],
      [0,33360, 79530,33360, 79530,34300, 0,34300, 0,33360],
      [78470,940, 79530,940, 79530,33360, 78470,33360, 78470,940],
      [0,940, 940,940, 940,33360, 0,33360, 0,940],
      [29290,940, 30350,940, 30350,33360, 29290,33360, 29290,940],
    ].map(a => Clipper.makePath(a));
    const tree = runTree(ClipType.Union, FillRule.NonZero, subject);
    expect(tree.count).toBe(1);
    expect(tree.child(0).count).toBe(2);
  });

  // far from zero, the touching rings are told apart relative to their own corner
  test.each([0, 4e15])('random touching polygons at offset %d: every ring sits under the smallest ring containing it', (O) => {
    const rnd = mulberry32(1);
    const ri = (n: number) => Math.floor(rnd() * n);
    const S = 1e6, G = 6;
    const randPoly = (): Path64 => {
      const n = 3 + ri(5);
      const p: Path64 = [];
      for (let i = 0; i < n; i++) p.push({ x: O + ri(G + 1) * S, y: O + ri(G + 1) * S });
      return p;
    };
    const cts = [ClipType.Union, ClipType.Intersection, ClipType.Difference, ClipType.Xor];
    let wrong = 0;
    for (let it = 0; it < 3000; it++) {
      const subject: Paths64 = [], clip: Paths64 = [];
      const ns = 1 + ri(3), nc = ri(3);
      for (let i = 0; i < ns; i++) subject.push(randPoly());
      for (let i = 0; i < nc; i++) clip.push(randPoly());
      const ct = cts[ri(4)];
      const fr = rnd() < 0.5 ? FillRule.EvenOdd : FillRule.NonZero;
      if (wronglyParented(runTree(ct, fr, subject, clip)) > 0) wrong++;
    }
    expect(wrong).toBe(0);
  });
});

describe('path2ContainsPath1 with every vertex of path1 on path2', () => {
  const square = (o: number): Path64 => [
    { x: o, y: o }, { x: o + 8, y: o }, { x: o + 8, y: o + 8 }, { x: o, y: o + 8 },
  ];
  // vertices at the middle of each side of the square
  const diamond = (o: number): Path64 => [
    { x: o + 4, y: o }, { x: o + 8, y: o + 4 }, { x: o + 4, y: o + 8 }, { x: o, y: o + 4 },
  ];
  // sits in the notch of an L shape, touching it at all three vertices
  const lShape: Path64 = [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 8 },
  ];
  const inNotch: Path64 = [{ x: 8, y: 4 }, { x: 4, y: 8 }, { x: 4, y: 4 }];

  test('inside', () => {
    expect(InternalClipper.path2ContainsPath1(diamond(0), square(0))).toBe(true);
  });

  test('outside', () => {
    expect(InternalClipper.path2ContainsPath1(inNotch, lShape)).toBe(false);
  });

  test('far from zero, the midpoints are taken relative to path1', () => {
    const o = 4e15; // two of these can't be summed exactly
    expect(InternalClipper.path2ContainsPath1(diamond(o), square(o))).toBe(true);
    // triangles that only share their long edge
    const tri = (pts: number[][]): Path64 => pts.map(([x, y]) => ({ x: o + x, y: o + y }));
    expect(InternalClipper.path2ContainsPath1(
      tri([[16, 0], [16, 16], [0, 16]]), tri([[0, 0], [16, 0], [0, 16]]))).toBe(false);
  });

  test('paths too large for the midpoints fall back to the bounds midpoint', () => {
    const big = (pts: number[][]): Path64 => pts.map(([x, y]) => ({ x: x * 2e15, y: y * 2e15 }));
    expect(InternalClipper.path2ContainsPath1(
      big([[0, -1], [1, 0], [0, 1], [-1, 0]]), big([[-1, -1], [1, -1], [1, 1], [-1, 1]]))).toBe(true);
  });
});

describe('pointInPolygon2x', () => {
  // the doubled-point test must agree with pointInPolygon run on a doubled polygon
  test('agrees with pointInPolygon on a doubled polygon', () => {
    const rnd = mulberry32(7);
    const ri = (n: number) => Math.floor(rnd() * n);
    const seen = new Set<PointInPolygonResult>();
    for (const S of [1, 1e6, 1e14]) {
      for (let it = 0; it < 2000; it++) {
        const n = 3 + ri(7);
        const poly: Path64 = [];
        for (let i = 0; i < n; i++) poly.push({ x: (ri(9) - 4) * S, y: (ri(9) - 4) * S });
        const doubled = poly.map(p => ({ x: p.x * 2, y: p.y * 2 }));
        for (let k = 0; k < 20; k++) {
          // half-grid points, so many land on vertices, on edges and at edge midpoints
          const px = (ri(19) - 9) * S, py = (ri(19) - 9) * S;
          const expected = InternalClipper.pointInPolygon({ x: px, y: py }, doubled);
          seen.add(expected);
          expect(InternalClipper.pointInPolygon2x(px, py, poly)).toBe(expected);
        }
      }
    }
    expect(seen.size).toBe(3);
  });
});
