// Exact boundary and local Delaunay checks for cap meshes with subdivided side walls.
import { describe, expect, it } from 'vitest';
import { triangulate, triangulateD, TriangulateResult, Delaunay, intersect, difference, inflatePaths, FillRule, JoinType, EndType, areaPaths } from '../src/index';
import type { Path64, Paths64, Point64 } from '../src/index';

const path = (coords: number[][]): Path64 => coords.map(([x, y]) => ({ x, y }));
const pointKey = (p: Point64): string => `${p.x},${p.y}`;
const edgeKey = (a: Point64, b: Point64): string =>
  [pointKey(a), pointKey(b)].sort().join(':');
const cross = (a: Point64, b: Point64, c: Point64): bigint =>
  (BigInt(b.x) - BigInt(a.x)) * (BigInt(c.y) - BigInt(a.y)) -
  (BigInt(b.y) - BigInt(a.y)) * (BigInt(c.x) - BigInt(a.x));
const twiceArea = (p: Path64): bigint => p.reduce((sum, a, i) => {
  const b = p[(i + 1) % p.length];
  return sum + BigInt(a.x) * BigInt(b.y) - BigInt(a.y) * BigInt(b.x);
}, 0n);
const abs = (n: bigint): bigint => n < 0n ? -n : n;

function inCircle(a: Point64, b: Point64, c: Point64, d: Point64): bigint {
  const ax = BigInt(a.x) - BigInt(d.x), ay = BigInt(a.y) - BigInt(d.y);
  const bx = BigInt(b.x) - BigInt(d.x), by = BigInt(b.y) - BigInt(d.y);
  const cx = BigInt(c.x) - BigInt(d.x), cy = BigInt(c.y) - BigInt(d.y);
  return (ax * ax + ay * ay) * (bx * cy - by * cx) -
    (bx * bx + by * by) * (ax * cy - ay * cx) +
    (cx * cx + cy * cy) * (ax * by - ay * bx);
}

function checkMesh(input: Paths64, triangles: Paths64, delaunay: boolean): void {
  const expected = new Set<string>();
  const points = new Map<string, Point64>();
  for (const ring of input) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      points.set(pointKey(a), a);
      if (pointKey(a) !== pointKey(b)) expected.add(edgeKey(a, b));
    }
  }
  const edges = new Map<string, { a: Point64; b: Point64; opposites: Point64[] }>();
  let area = 0n;
  for (const triangle of triangles) {
    expect(triangle).toHaveLength(3);
    expect(twiceArea(triangle)).toBeGreaterThan(0n);
    area += twiceArea(triangle);
    for (let i = 0; i < 3; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3];
      expect(points.has(pointKey(a))).toBe(true);
      const key = edgeKey(a, b);
      const entry = edges.get(key) ?? { a, b, opposites: [] };
      entry.opposites.push(triangle[(i + 2) % 3]);
      edges.set(key, entry);
    }
  }
  expect(area).toBe(abs(input.reduce((sum, ring) => sum + twiceArea(ring), 0n)));
  expect(new Set([...edges].filter(([, e]) => e.opposites.length === 1).map(([key]) => key)))
    .toEqual(expected);
  for (const [key, { a, b, opposites }] of edges) {
    expect(opposites).toHaveLength(expected.has(key) ? 1 : 2);
    // No input vertex may lie strictly inside any triangle edge (a T-junction).
    for (const p of points.values()) {
      if (pointKey(p) === pointKey(a) || pointKey(p) === pointKey(b)) continue;
      const insideBounds = p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
        p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
      expect(insideBounds && cross(a, b, p) === 0n).toBe(false);
    }
    if (opposites.length !== 2) continue;
    const [c, d] = opposites;
    expect(cross(a, b, c) * cross(a, b, d)).toBeLessThan(0n);
    // Only a convex quadrilateral admits an alternative diagonal.
    if (delaunay && cross(c, d, a) * cross(c, d, b) < 0n) {
      expect(inCircle(a, b, c, d) * cross(a, b, c)).toBeLessThanOrEqual(0n);
    }
  }
  // Interior edges must not cross; area and boundary equality alone do not prove coverage.
  const segments = [...edges.values()];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const { a, b } = segments[i], { a: c, b: d } = segments[j];
      expect(cross(a, b, c) * cross(a, b, d) < 0n &&
        cross(c, d, a) * cross(c, d, b) < 0n).toBe(false);
    }
  }
}

const square = path([[0, 0], [20, 0], [40, 0], [40, 20], [40, 40], [20, 40], [0, 40], [0, 20]]);
const chair = path([[0, 0], [20, 0], [40, 0], [40, 10], [40, 20], [20, 20], [20, 40], [0, 40]]);
const outer = path([[0, 0], [40, 0], [80, 0], [80, 40], [80, 80], [40, 80], [0, 80], [0, 40]]);
const hole = path([[20, 20], [20, 40], [20, 60], [40, 60], [60, 60], [60, 40], [60, 20], [40, 20]]);
const fixtures: [string, Paths64][] = [
  ['original reproducer', [path([[0, 0], [20, 0], [40, 0], [40, 40], [0, 40]])]],
  ['all four sides', [square]],
  ['concave Chair', [chair]],
  ['hole', [outer, hole]],
  ['aligned holes', [path([[0, 0], [100, 0], [200, 0], [200, 80], [0, 80]]), hole,
    hole.map(p => ({ x: p.x + 100, y: p.y }))]],
  ['near-collinear boundary', [path([[0, 0], [500000, 1], [1000000, 0], [1000000, 1000000], [0, 1000000]])]],
  ['disconnected components', [square, chair.map(p => ({ x: p.x + 100, y: p.y }))]],
  ['nested island', [outer, hole, path([[30, 30], [40, 30], [50, 30], [50, 50], [30, 50]])]],
  ['oblique edges', [path([[0, 0], [20, 10], [40, 20], [30, 40], [20, 60], [10, 30]])]],
  ['narrow neck', [path([[0, 0], [40, 0], [40, 18], [60, 18], [60, 0], [100, 0], [100, 40], [60, 40], [60, 22], [40, 22], [40, 40], [0, 40]])]],
];

describe.each([false, true])('preserveCollinear (Delaunay=%s)', delaunay => {
  for (const [name, paths] of fixtures) {
    for (const reversed of [false, true]) {
      it(`${name}, reversed=${reversed}`, () => {
        const input = paths.map(p => reversed ? [...p].reverse() : [...p]);
        const before = JSON.stringify(input);
        const { result, solution } = triangulate(input, delaunay, true);
        expect(result).toBe(TriangulateResult.success);
        checkMesh(input, solution, delaunay);
        expect(JSON.stringify(input)).toBe(before);
      });
    }
  }

  it('handles every cyclic starting vertex, duplicates and explicit closure', () => {
    for (let i = 0; i < square.length; i++) {
      const ring = [...square.slice(i), ...square.slice(0, i)];
      const input = [[ring[0], ...ring, ring[ring.length - 1], ring[0]]];
      const { result, solution } = triangulate(input, delaunay, true);
      expect(result).toBe(TriangulateResult.success);
      checkMesh(input, solution, delaunay);
    }
  });

  it('restores Z values on omitted vertices', () => {
    const input = [square.map((p, z) => ({ ...p, z }))];
    const { result, solution } = triangulate(input, delaunay, true);
    expect(result).toBe(TriangulateResult.success);
    const values = new Map(input[0].map(p => [pointKey(p), p.z]));
    for (const p of solution.flat()) expect(p.z).toBe(values.get(pointKey(p)));
  });

  it('preserves scaled floating-point boundaries', () => {
    const input = [square.map(p => ({ x: p.x / 100, y: p.y / 100 }))];
    const { result, solution } = triangulateD(input, 2, delaunay, true);
    expect(result).toBe(TriangulateResult.success);
    checkMesh([square], solution.map(t => t.map(p => ({ x: Math.round(p.x * 100), y: Math.round(p.y * 100) }))), delaunay);
  });

  it('uses exact collinearity at large coordinates', () => {
    const input = [square.map(p => ({ x: p.x * 1_000_000 + 2 ** 50, y: p.y * 1_000_000 - 2 ** 50 }))];
    const { result, solution } = triangulate(input, delaunay, true);
    expect(result).toBe(TriangulateResult.success);
    checkMesh(input, solution, delaunay);
  });
});

it('keeps the default simplified triangulation unchanged', () => {
  const input = fixtures[0][1];
  expect(triangulate(input)).toEqual(triangulate(input, true, false));
  expect(triangulate(input).solution).toHaveLength(2);
  expect(triangulate(input, true, true).solution).toHaveLength(3);
});

it('preserves boundaries on deterministic generated concave rings', () => {
  let seed = 0x5eed;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let sample = 0; sample < 60; sample++) {
    const count = 5 + Math.floor(random() * 7);
    const corners = Array.from({ length: count }, (_, i) => {
      const angle = 2 * Math.PI * i / count;
      const radius = 100 + Math.floor(random() * 300);
      return { x: 6 * Math.round(radius * Math.cos(angle)), y: 6 * Math.round(radius * Math.sin(angle)) };
    });
    const ring = corners.flatMap((a, i) => {
      const b = corners[(i + 1) % corners.length];
      return [a, { x: (2 * a.x + b.x) / 3, y: (2 * a.y + b.y) / 3 },
        { x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3 }];
    });
    if (sample % 2 === 0) ring.reverse();
    const input = [ring];
    const { result, solution } = triangulate(input, true, true);
    expect(result, `sample ${sample}`).toBe(TriangulateResult.success);
    checkMesh(input, solution, true);
  }
});

it('does not claim conformity for discarded or overlapping constraints', () => {
  const inputs = [
    [path([[0, 0], [1, 0], [0, 1]]), square.map(p => ({ x: p.x + 100, y: p.y }))],
    [square, square],
  ];
  for (const input of inputs) {
    const { result, solution } = triangulate(input, true, true);
    expect(result).not.toBe(TriangulateResult.success);
    expect(solution).toEqual([]);
  }
});


it('conforms to disconnected crops, split erosions and holed Boolean output', () => {
  const u = path([[0, 0], [60, 0], [60, 60], [40, 60], [40, 20], [20, 20], [20, 60], [0, 60]]);
  const crop = [path([[-10, 30], [70, 30], [70, 60], [-10, 60]])];
  const dumbbell = path([[0, 0], [40, 0], [40, 15], [80, 15], [80, 0], [120, 0],
    [120, 40], [80, 40], [80, 25], [40, 25], [40, 40], [0, 40]]);
  const cases: [Paths64, number, number][] = [
    [intersect([u], crop, FillRule.NonZero), 2, 1200],
    [inflatePaths([dumbbell], -6, JoinType.Miter, EndType.Polygon), 2, 1568],
    [difference([outer], [hole], FillRule.NonZero), 2, 4800],
  ];
  for (const [regions, components, area] of cases) {
    expect(regions).toHaveLength(components);
    expect(Math.abs(areaPaths(regions))).toBe(area);
    for (const reverse of [false, true]) for (const delaunay of [false, true]) {
      const input = reverse ? regions.map(p => [...p].reverse()) : regions;
      const { result, solution } = triangulate(input, delaunay, true);
      expect(result).toBe(TriangulateResult.success);
      checkMesh(input, solution, delaunay);
    }
  }
  expect(inflatePaths([path([[0, 0], [10, 0], [10, 10], [0, 10]])], -6,
    JoinType.Miter, EndType.Polygon)).toEqual([]);
});

it('retains every segment on a boundary with 1,000 vertices', () => {
  const steps = 250;
  const corners = path([[0, 0], [10000, 0], [10000, 10000], [0, 10000]]);
  const ring = corners.flatMap((a, i) => {
    const b = corners[(i + 1) % corners.length];
    return Array.from({ length: steps }, (_, j) => ({
      x: a.x + (b.x - a.x) * j / steps, y: a.y + (b.y - a.y) * j / steps,
    }));
  });
  const expected = new Set(ring.map((p, i) => edgeKey(p, ring[(i + 1) % ring.length])));
  for (const delaunay of [false, true]) {
    const { result, solution } = triangulate([ring], delaunay, true);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(ring.length - 2);
    expect(solution.reduce((sum, triangle) => sum + twiceArea(triangle), 0n)).toBe(200000000n);
    const edges = new Map<string, number>();
    for (const triangle of solution) {
      expect(twiceArea(triangle)).toBeGreaterThan(0n);
      for (let i = 0; i < 3; i++) {
        const key = edgeKey(triangle[i], triangle[(i + 1) % 3]);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect(new Set([...edges].filter(([, count]) => count === 1).map(([key]) => key))).toEqual(expected);
    for (const [key, count] of edges) expect(count).toBe(expected.has(key) ? 1 : 2);
  }
});


it('cleans up after strict-preservation failure when reusing Delaunay', () => {
  const triangulator = new Delaunay(true, true);
  expect(triangulator.execute([square, square]).result).not.toBe(TriangulateResult.success);
  for (const input of [[square], [outer, hole]]) {
    const { result, solution } = triangulator.execute(input);
    expect(result).toBe(TriangulateResult.success);
    checkMesh(input, solution, true);
  }
});
