/**
 * Triangulation coverage checks: every successful triangulation must have
 * three-point triangles whose areas sum exactly to the input area, with no
 * part of the input left uncovered and no triangle area outside the input.
 *
 * The baseline cases follow upstream PR 1120 (AngusJohnson/Clipper2). The
 * remaining cases are shapes and fuzzed polygons on which the port once
 * returned success with missing or overlapping triangles.
 */
import { describe, test, expect } from 'vitest';
import {
  Clipper, FillRule, TriangulateResult, triangulate, difference, union, area, areaPaths,
  type Path64, type Paths64, type Point64,
} from '../src';

const mk = (coords: number[]): Path64 => Clipper.makePath(coords);

/** Asserts a valid triangulation of `subject` with the given triangle count (or any count when null). */
function expectValidTriangulation(subject: Paths64, solution: Paths64, triangleCount: number | null, expectedArea: number): void {
  if (triangleCount !== null) expect(solution).toHaveLength(triangleCount);
  let sum = 0;
  for (const tri of solution) {
    expect(tri).toHaveLength(3);
    sum += Math.abs(area(tri));
  }
  expect(sum).toBe(expectedArea);
  // nothing uncovered, nothing outside (XOR is avoided: it leaves slivers on
  // subjects with many touching rings even when coverage is exact)
  expect(difference(subject, solution, FillRule.NonZero)).toEqual([]);
  expect(difference(solution, subject, FillRule.NonZero)).toEqual([]);
}

function triangulateBoth(subject: Paths64, check: (solution: Paths64, delaunay: boolean) => void): void {
  for (const delaunay of [false, true]) {
    const { result, solution } = triangulate(subject, delaunay);
    expect(result, `delaunay=${delaunay}`).toBe(TriangulateResult.success);
    check(solution, delaunay);
  }
}

describe('Triangulation baseline (upstream PR 1120)', () => {
  test('empty input gives noPolygons', () => {
    for (const delaunay of [false, true]) {
      const { result, solution } = triangulate([], delaunay);
      expect(result).toBe(TriangulateResult.noPolygons);
      expect(solution).toEqual([]);
    }
  });

  test('a triangle is returned unchanged', () => {
    const subject = [mk([0,0, 0,100, 100,0])];
    triangulateBoth(subject, solution => {
      expectValidTriangulation(subject, solution, 1, 5000);
      const pts = solution[0].map(p => `${p.x},${p.y}`).sort();
      expect(pts).toEqual(['0,0', '0,100', '100,0']);
    });
  });

  test('a square splits along a diagonal', () => {
    const subject = [mk([0,0, 100,0, 100,100, 0,100])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, 2, 10000));
  });

  test('an L shape', () => {
    const subject = [mk([0,0, 200,0, 200,100, 100,100, 100,400, 0,400])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, 4, 50000));
  });

  test('a square with a square hole', () => {
    const subject = difference([mk([0,0, 300,0, 300,300, 0,300])], [mk([100,100, 200,100, 200,200, 100,200])], FillRule.NonZero);
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, 8, 80000));
  });

  test('a square with a hole, with extra collinear points', () => {
    const subject = [mk([0,0, 150,0, 300,0, 300,150, 300,300, 0,300]), mk([100,100, 100,200, 150,200, 200,200, 200,100])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, 8, 80000));
  });

  test('a square with a hole, with duplicate points', () => {
    const subject = [mk([0,0, 0,0, 300,0, 300,300, 300,300, 0,300]), mk([100,100, 100,200, 100,200, 200,200, 200,100, 200,100])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, 8, 80000));
  });

  test('a bow-tie is rejected as pathsIntersect', () => {
    for (const delaunay of [false, true]) {
      const { result, solution } = triangulate([mk([0,0, 100,100, 100,0, 0,100])], delaunay);
      expect(result).toBe(TriangulateResult.pathsIntersect);
      expect(solution).toEqual([]);
    }
  });

  test('a collinear path gives noPolygons', () => {
    for (const delaunay of [false, true]) {
      const { result, solution } = triangulate([mk([0,0, 100,0, 200,0, 300,0])], delaunay);
      expect(result).toBe(TriangulateResult.noPolygons);
      expect(solution).toEqual([]);
    }
  });

  test('Delaunay splits a rhombus on its short diagonal', () => {
    const subject = [mk([100,0, 50,200, 100,400, 150,200])];
    const { result, solution } = triangulate(subject, true);
    expect(result).toBe(TriangulateResult.success);
    expectValidTriangulation(subject, solution, 2, 20000);
    for (const tri of solution) {
      expect(tri.filter(p => p.x === 50 && p.y === 200)).toHaveLength(1);
      expect(tri.filter(p => p.x === 150 && p.y === 200)).toHaveLength(1);
    }
  });

  test('Delaunay result matches one computed independently (Ipe)', () => {
    const subject = [mk([64,64, 112,160, 192,160, 256,208, 368,128, 288,48, 208,80, 176,48])];
    const expected = [
      mk([64,64, 112,160, 176,48]), mk([112,160, 176,48, 208,80]), mk([112,160, 192,160, 208,80]),
      mk([192,160, 208,80, 256,208]), mk([368,128, 288,48, 256,208]), mk([208,80, 288,48, 256,208]),
    ];
    const { result, solution } = triangulate(subject, true);
    expect(result).toBe(TriangulateResult.success);
    expectValidTriangulation(subject, solution, 6, 28288);
    const key = (t: Path64) => t.map(p => `${p.x},${p.y}`).sort().join(' ');
    const got = solution.map(key);
    for (const tri of expected) expect(got.filter(k => k === key(tri))).toHaveLength(1);
  });
});

describe('Triangulation covers the input exactly', () => {
  function ring(n: number, r: number, wobble: number, reverse = false): Path64 {
    const p: Path64 = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * 2 * Math.PI;
      const rr = r * (1 + wobble * Math.sin(7 * a));
      p.push({ x: Math.round(rr * Math.cos(a)), y: Math.round(rr * Math.sin(a)) });
    }
    return reverse ? p.reverse() : p;
  }

  // 2.0.1-14 to 2.0.1-19 returned success with most of these triangles missing
  test('a 500 vertex circle', () => {
    const subject = [ring(500, 100000, 0)];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, null, Math.abs(areaPaths(subject))));
  });

  test('a glyph-like outline with a hole', () => {
    const subject = [ring(220, 100000, 0.25), ring(60, 40000, 0.1, true)];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, null, Math.abs(areaPaths(subject))));
  });

  test('a cleaned 500 vertex self-intersecting polygon', () => {
    // deterministic pseudo-random polygon, cleaned with union first
    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const raw: Path64 = [];
    for (let i = 0; i < 500; i++) raw.push({ x: Math.round(rnd() * 100000), y: Math.round(rnd() * 100000) });
    const subject = union([raw], FillRule.NonZero);
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, null, Math.abs(areaPaths(subject))));
  });

  // PolyClipping/Clipper2 issue 12, second case: an edge would run through two hole vertices
  test('outer with a hole whose vertices are collinear with an outer vertex', () => {
    const subject = [
      mk([320313,10000, 310000,160313, 99688,150000, -313,90000, 10000,59688]),
      mk([210000,150000, 220000,130000, 220000,150000, 310000,150000, 10000,70000]),
    ];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, null, 30025200468.5));
  });

  // vertices on a shared horizontal; the parametric intersection test left overlapping triangles
  test('rectilinear polygon with collinear vertices on one horizontal', () => {
    const subject = [mk([721,583, 958,583, 958,924, 436,924, 436,583, 163,583, 163,21, 449,21, 449,583, 451,583, 451,474, 721,474])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, null, 368164));
  });

  test('spiky star polygons, both windings', () => {
    // narrow angles and near-collinear vertices; this set once produced wrong
    // areas or failures on about 7% of inputs
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const orient = (a: Point64, b: Point64, c: Point64) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const isSimple = (p: Path64) => {
      const n = p.length;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
        if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return false;
      }
      return true;
    };
    let tested = 0;
    for (let k = 0; k < 600; k++) {
      const n = 5 + Math.floor(rnd() * 12);
      const angles = Array.from({ length: n }, () => rnd() * 2 * Math.PI).sort((a, b) => a - b);
      const rot = rnd() * Math.PI;
      let p: Path64 = angles.map(a => ({ x: Math.round(5000 + Math.cos(a + rot) * (1000 + rnd() * 4000)), y: Math.round(5000 + Math.sin(a + rot) * (1000 + rnd() * 4000)) }));
      if (!isSimple(p)) continue;
      if (area(p) < 0) p = p.reverse();
      for (const reversed of [false, true]) {
        const subject = [reversed ? [...p].reverse() : p];
        const expected = Math.abs(area(p));
        for (const delaunay of [false, true]) {
          const { result, solution } = triangulate(subject, delaunay);
          expect(result, `polygon ${k} reversed=${reversed} delaunay=${delaunay}`).toBe(TriangulateResult.success);
          let sum = 0;
          for (const tri of solution) sum += Math.abs(area(tri));
          expect(sum, `polygon ${k} reversed=${reversed} delaunay=${delaunay}`).toBe(expected);
        }
      }
      tested++;
    }
    expect(tested).toBeGreaterThan(300);
  });
});

describe('Edges through collinear vertices (PolyClipping/Clipper2 issue 12)', () => {
  // The bridge from an inner local minimum would run exactly through another
  // vertex; it now ends at that vertex. The C++ reference gets this wrong.
  test('simple polygon with an edge through a collinear vertex', () => {
    const subject = [mk([-209,3155, 716,3534, 3324,2439, 298,9844, 507,6689])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, 3, 9498178));
  });

  // Reversed input is re-added reversed rather than fixed up by flipping flags
  // and edge kinds in place; the in-place fix-up left loose horizontals running
  // through collinear vertices. The C++ reference gets this wrong.
  test('reversed rectilinear polygon with collinear vertices on one horizontal', () => {
    const subject = [mk([721,474, 451,474, 451,583, 449,583, 449,21, 163,21, 163,583, 436,583, 436,924, 958,924, 958,583, 721,583])];
    triangulateBoth(subject, solution => expectValidTriangulation(subject, solution, null, 368164));
  });
});
