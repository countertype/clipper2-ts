// Preserve coverage across contour windings and minima, including aligned-hole boundary conformity.
import { describe, expect, it } from 'vitest';
import { areaPaths, triangulate, triangulateD, TriangulateResult } from '../src/index';
import type { Path64, Paths64, Point64 } from '../src/index';

const ring = (coords: number[][]): Path64 => coords.map(([x, y]) => ({ x, y }));
const outer = ring([[0, 0], [80, 0], [80, 80], [0, 80]]);
const hole = ring([[20, 20], [20, 60], [60, 60], [60, 20]]);
const edgeKey = (a: Point64, b: Point64): string =>
  [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join(':');

function expectCoverage(input: Paths64, solution: Paths64, holeCenter: Point64 = { x: 40, y: 40 }): void {
  expect(solution.reduce((sum, t) => sum + Math.abs(areaPaths([t])), 0))
    .toBe(Math.abs(areaPaths(input)));
  const expected = new Set(input.flatMap(p => p.map((a, i) => edgeKey(a, p[(i + 1) % p.length]))));
  const edges = new Map<string, number>();
  for (const triangle of solution) {
    expect(triangle).toHaveLength(3);
    expect(areaPaths([triangle])).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const key = edgeKey(triangle[i], triangle[(i + 1) % 3]);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    // The square-hole center must remain outside every triangle.
    const signs = triangle.map((a, i) => {
      const b = triangle[(i + 1) % 3];
      return (b.x - a.x) * (holeCenter.y - a.y) - (b.y - a.y) * (holeCenter.x - a.x);
    });
    expect(signs.every(s => s >= 0) || signs.every(s => s <= 0)).toBe(false);
  }
  expect(new Set([...edges].filter(([, count]) => count === 1).map(([key]) => key))).toEqual(expected);
  for (const [key, count] of edges) expect(count).toBe(expected.has(key) ? 1 : 2);
}

describe.each([false, true])('triangulation winding (Delaunay=%s)', delaunay => {
  it('keeps all eight triangles of a reversed square with a hole', () => {
    const input = [[...outer].reverse(), [...hole].reverse()];
    const before = JSON.stringify(input);
    const { result, solution } = triangulate(input, delaunay);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(8);
    expectCoverage(input, solution);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('handles both windings, every start vertex, path order and horizontal/oblique minima', () => {
    for (const reverse of [false, true]) for (const rotate of [false, true]) {
      for (let offset = 0; offset < 4; offset++) {
        let input = [outer, hole].map(p => [...p.slice(offset), ...p.slice(0, offset)]);
        if (reverse) input = input.map(p => [...p].reverse());
        if (rotate) input = input.map(p => p.map(({ x, y }) => ({ x: x - y, y: x + y })));
        for (const paths of [input, [...input].reverse()]) {
          const { result, solution } = triangulate(paths, delaunay);
          expect(result).toBe(TriangulateResult.success);
          expectCoverage(paths, solution, rotate ? { x: 0, y: 80 } : { x: 40, y: 40 });
          expect(solution).toHaveLength(8);
          expect(areaPaths(solution)).toBe(rotate ? 9600 : 4800);
        }
      }
    }
  });

  it('supports more than one hole after reversal', () => {
    const input = [ring([[0, 0], [200, 0], [200, 80], [0, 80]]), hole,
      hole.map(p => ({ x: p.x + 100, y: p.y }))].map(p => [...p].reverse());
    const { result, solution } = triangulate(input, delaunay);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(14);
    expectCoverage(input, solution);
  });

  it('retains every boundary segment across aligned holes in both windings', () => {
    for (let count = 2; count <= 5; count++) for (const reverse of [false, true]) {
      const paths = [ring([[0, 0], [100 * count, 0], [100 * count, 80], [0, 80]]),
        ...Array.from({ length: count }, (_, i) => hole.map(p => ({ x: p.x + 100 * i, y: p.y })))];
      const input = reverse ? paths.map(p => [...p].reverse()) : paths;
      for (const ordered of [input, [...input].reverse()]) {
        const { result, solution } = triangulate(ordered, delaunay);
        expect(result).toBe(TriangulateResult.success);
        expectCoverage(ordered, solution);
      }
    }
  });

  it('fixes the floating-point entry point too', () => {
    const input = [outer, hole].map(p => [...p].reverse().map(({ x, y }) => ({ x: x / 10, y: y / 10 })));
    const { result, solution } = triangulateD(input, 1, delaunay);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(8);
    expect(areaPaths(solution)).toBe(48);
  });
});
