import { describe, it, expect } from 'vitest';
import { Clipper } from '../src/Clipper';
import { TriangulateResult, Paths64, PathsD, FillRule, Point64, Path64 } from '../src/index';

function areSafePoints(...pts: Point64[]): boolean {
  for (const pt of pts) {
    if (!Number.isSafeInteger(pt.x) || !Number.isSafeInteger(pt.y)) return false;
  }
  return true;
}

function orient(a: Point64, b: Point64, c: Point64): number {
  if (areSafePoints(a, b, c)) {
    const ax = BigInt(b.x) - BigInt(a.x);
    const ay = BigInt(b.y) - BigInt(a.y);
    const bx = BigInt(c.x) - BigInt(a.x);
    const by = BigInt(c.y) - BigInt(a.y);
    const cross = ax * by - ay * bx;
    if (cross > 0n) return 1;
    if (cross < 0n) return -1;
    return 0;
  }
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const bx = c.x - a.x;
  const by = c.y - a.y;
  const cross = ax * by - ay * bx;
  return cross > 0 ? 1 : cross < 0 ? -1 : 0;
}

function inCircleSign(a: Point64, b: Point64, c: Point64, d: Point64): number {
  if (areSafePoints(a, b, c, d)) {
    const ax = BigInt(a.x) - BigInt(d.x);
    const ay = BigInt(a.y) - BigInt(d.y);
    const bx = BigInt(b.x) - BigInt(d.x);
    const by = BigInt(b.y) - BigInt(d.y);
    const cx = BigInt(c.x) - BigInt(d.x);
    const cy = BigInt(c.y) - BigInt(d.y);
    const aLift = ax * ax + ay * ay;
    const bLift = bx * bx + by * by;
    const cLift = cx * cx + cy * cy;
    const det = ax * (by * cLift - cy * bLift) -
      bx * (ay * cLift - cy * aLift) +
      cx * (ay * bLift - by * aLift);
    if (det > 0n) return 1;
    if (det < 0n) return -1;
    return 0;
  }
  const ax = a.x - d.x;
  const ay = a.y - d.y;
  const bx = b.x - d.x;
  const by = b.y - d.y;
  const cx = c.x - d.x;
  const cy = c.y - d.y;
  const aLift = ax * ax + ay * ay;
  const bLift = bx * bx + by * by;
  const cLift = cx * cx + cy * cy;
  const det = ax * (by * cLift - cy * bLift) -
    bx * (ay * cLift - cy * aLift) +
    cx * (ay * bLift - by * aLift);
  return det > 0 ? 1 : det < 0 ? -1 : 0;
}

function edgeKey(p1: Point64, p2: Point64): string {
  const aFirst = p1.x < p2.x || (p1.x === p2.x && p1.y <= p2.y);
  const a = aFirst ? p1 : p2;
  const b = aFirst ? p2 : p1;
  return `${a.x},${a.y}-${b.x},${b.y}`;
}

function buildEdgeSet(paths: Paths64): Set<string> {
  const edges = new Set<string>();
  for (const path of paths) {
    if (path.length < 2) continue;
    for (let i = 0; i < path.length; i++) {
      const p1 = path[i];
      const p2 = path[(i + 1) % path.length];
      edges.add(edgeKey(p1, p2));
    }
  }
  return edges;
}

function checkDelaunayProperty(triangles: Path64[], boundary?: Paths64): { violations: number } {
  const boundaryEdges = boundary ? buildEdgeSet(boundary) : null;
  const edgeMap = new Map<string, { p1: Point64, p2: Point64, tris: { triIdx: number, opposite: Point64 }[] }>();

  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    if (tri.length !== 3) continue;
    for (let j = 0; j < 3; j++) {
      const p1 = tri[j];
      const p2 = tri[(j + 1) % 3];
      const opposite = tri[(j + 2) % 3];
      const key = edgeKey(p1, p2);
      let entry = edgeMap.get(key);
      if (!entry) {
        const aFirst = p1.x < p2.x || (p1.x === p2.x && p1.y <= p2.y);
        const a = aFirst ? p1 : p2;
        const b = aFirst ? p2 : p1;
        entry = { p1: a, p2: b, tris: [] };
        edgeMap.set(key, entry);
      }
      entry.tris.push({ triIdx: i, opposite });
    }
  }

  let violations = 0;
  for (const [key, entry] of edgeMap) {
    if (entry.tris.length !== 2) continue;
    if (boundaryEdges && boundaryEdges.has(key)) continue;
    const [t1, t2] = entry.tris;
    const tri1 = triangles[t1.triIdx];
    const tri2 = triangles[t2.triIdx];

    const side1 = orient(entry.p1, entry.p2, t1.opposite);
    const side2 = orient(entry.p1, entry.p2, t2.opposite);
    if (side1 === 0 || side2 === 0 || side1 === side2) continue;

    const o1 = orient(tri1[0], tri1[1], tri1[2]);
    const o2 = orient(tri2[0], tri2[1], tri2[2]);
    if (o1 !== 0) {
      const s1 = inCircleSign(tri1[0], tri1[1], tri1[2], t2.opposite);
      if ((o1 > 0 && s1 > 0) || (o1 < 0 && s1 < 0)) violations++;
    }
    if (o2 !== 0) {
      const s2 = inCircleSign(tri2[0], tri2[1], tri2[2], t1.opposite);
      if ((o2 > 0 && s2 > 0) || (o2 < 0 && s2 < 0)) violations++;
    }
  }

  return { violations };
}

describe('Triangulation Tests (Point64)', () => {
  it('should triangulate a simple square', () => {
    const square: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(square);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }

    let totalArea = 0;
    for (const triangle of solution) {
      totalArea += Math.abs(Clipper.area(triangle));
    }
    expect(Math.abs(totalArea - 10000)).toBeLessThan(1);
  });

  it('should triangulate a large-coordinate square', () => {
    const size = 360_000_000;
    const square: Paths64 = [
      Clipper.makePath([0, 0, size, 0, size, size, 0, size])
    ];

    const { result, solution } = Clipper.triangulate(square);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2);
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should triangulate a simple triangle (returns single triangle)', () => {
    const triangle: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 50, 100])
    ];

    const { result, solution } = Clipper.triangulate(triangle);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(3);
  });

  it('should triangulate a pentagon', () => {
    const pentagon: Paths64 = [
      Clipper.makePath([50, 0, 100, 38, 82, 100, 18, 100, 0, 38])
    ];

    const { result, solution } = Clipper.triangulate(pentagon);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(3);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should triangulate a hexagon', () => {
    const hexagon: Paths64 = [
      Clipper.makePath([50, 0, 93, 25, 93, 75, 50, 100, 7, 75, 7, 25])
    ];

    const { result, solution } = Clipper.triangulate(hexagon);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(4);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should handle a polygon with a hole', () => {
    const outer: Paths64 = [
      Clipper.makePath([0, 0, 200, 0, 200, 200, 0, 200]),
      Clipper.makePath([50, 50, 150, 50, 150, 150, 50, 150])
    ];

    const { result, solution } = Clipper.triangulate(outer);

    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should return noPolygons for empty input', () => {
    const empty: Paths64 = [];

    const { result, solution } = Clipper.triangulate(empty);

    expect(result).toBe(TriangulateResult.noPolygons);
    expect(solution).toHaveLength(0);
  });

  it('should return noPolygons for degenerate polygon (too few points)', () => {
    const degenerate: Paths64 = [
      Clipper.makePath([0, 0, 100, 0]) // Only 2 points
    ];

    const { result, solution } = Clipper.triangulate(degenerate);

    expect(result).toBe(TriangulateResult.noPolygons);
    expect(solution).toHaveLength(0);
  });

  it('should triangulate with Delaunay disabled', () => {
    const square: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(square, false);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should handle complex polygon with multiple paths', () => {
    const paths: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100]),
      Clipper.makePath([200, 0, 300, 0, 300, 100, 200, 100])
    ];

    const { result, solution } = Clipper.triangulate(paths);

    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });
});

describe('Triangulation Tests (PointD)', () => {
  it('should triangulate a simple square (PointD)', () => {
    const square: PathsD = [
      Clipper.makePathD([0, 0, 100, 0, 100, 100, 0, 100])
    ];

    const { result, solution } = Clipper.triangulateD(square, 2);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }

    let totalArea = 0;
    for (const triangle of solution) {
      totalArea += Math.abs(Clipper.areaD(triangle));
    }
    expect(Math.abs(totalArea - 10000)).toBeLessThan(1);
  });

  it('should triangulate a simple triangle (PointD)', () => {
    const triangle: PathsD = [
      Clipper.makePathD([0, 0, 100, 0, 50, 100])
    ];

    const { result, solution } = Clipper.triangulateD(triangle, 2);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(3);
  });

  it('should triangulate a pentagon (PointD)', () => {
    const pentagon: PathsD = [
      Clipper.makePathD([50, 0, 100, 38, 82, 100, 18, 100, 0, 38])
    ];

    const { result, solution } = Clipper.triangulateD(pentagon, 2);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(3);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should handle precision parameter correctly', () => {
    const square: PathsD = [
      Clipper.makePathD([0, 0, 10.123, 0, 10.123, 10.456, 0, 10.456])
    ];

    const { result: result0, solution: solution0 } = Clipper.triangulateD(square, 0);
    const { result: result2, solution: solution2 } = Clipper.triangulateD(square, 2);

    expect(result0).toBe(TriangulateResult.success);
    expect(result2).toBe(TriangulateResult.success);
    expect(solution0.length).toBeGreaterThan(0);
    expect(solution2.length).toBeGreaterThan(0);
  });

  it('should return noPolygons for empty input (PointD)', () => {
    const empty: PathsD = [];

    const { result, solution } = Clipper.triangulateD(empty, 2);

    expect(result).toBe(TriangulateResult.noPolygons);
    expect(solution).toHaveLength(0);
  });

  it('should triangulate with Delaunay disabled (PointD)', () => {
    const square: PathsD = [
      Clipper.makePathD([0, 0, 100, 0, 100, 100, 0, 100])
    ];

    const { result, solution } = Clipper.triangulateD(square, 2, false);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });
});

describe('Triangulation Regression Tests', () => {
  // https://github.com/AngusJohnson/Clipper2/issues/1055
  it('issue #1055 - narrow-necked geometry', () => {
    const narrowNeck: Paths64 = [[
      { x: 11633393715823668, y: 6366352983210480, z: 0 },
      { x: 14032328196566542, y: 6555359949515638, z: 0 },
      { x: 14003250230676264, y: 5028765304975276, z: 0 },
      { x: 15762468849501396, y: 5101460296319981, z: 0 },
      { x: 16314950751571738, y: 10044719195429914, z: 0 },
      { x: 14483037186691384, y: 10248265162321660, z: 0 },
      { x: 13814243350057526, y: 7863869702662485, z: 0 },
      { x: 11458925905425222, y: 8241883628441500, z: 0 },
      { x: 12205067114667274, y: 10651552712182230, z: 0 },
      { x: 12142356793566838, y: 9750353358707920, z: 0 },
      { x: 13180182022039582, y: 9234473037762504, z: 0 },
      { x: 13871076135814082, y: 9630059724866616, z: 0 },
      { x: 16662324413960174, y: 13234316080439676, z: 0 },
      { x: 16742777330712046, y: 14390491256863804, z: 0 },
      { x: 15704952102239302, y: 14906371577809220, z: 0 },
      { x: 15014057988464802, y: 14510784890705108, z: 0 },
      { x: 12324797185103114, y: 11038221945230514, z: 0 },
      { x: 12345804735781466, y: 11106066000441144, z: 0 },
      { x: 9888713892791512, y: 11091526796554952, z: 0 },
      { x: 10324883930311650, y: 7907486596870628, z: 0 },
      { x: 9409339746297270, y: 4854375710136508, z: 0 },
      { x: 11473464729830542, y: 4229120452027344, z: 0 },
    ]];

    const { result, solution } = Clipper.triangulate(narrowNeck);
    expect([TriangulateResult.success, TriangulateResult.fail, TriangulateResult.noPolygons])
      .toContain(result);
  });

  // https://github.com/AngusJohnson/Clipper2/issues/1056
  it('issue #1056 - near-collinear geometry', () => {
    const nearCollinear: Paths64 = [[
      { x: 4956510274156402, y: 1949095339415813, z: 0 },
      { x: 4770558614626881, y: 1728685063645521, z: 0 },
      { x: 4773228611416619, y: 1726446939526986, z: 0 },
      { x: 4775938071598222, y: 1724256755070940, z: 0 },
    ]];

    const { result, solution } = Clipper.triangulate(nearCollinear);
    expect([TriangulateResult.success, TriangulateResult.fail, TriangulateResult.noPolygons])
      .toContain(result);
  }, 5000);

  it('shared endpoint segments', () => {
    const sharedEndpoint: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 50, 50, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(sharedEndpoint);

    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);
  });
});

describe('Issue #1058 - Infinite loop in triangulation', () => {
  // https://github.com/AngusJohnson/Clipper2/issues/1058
  it('should not hang on complex self-intersecting polygon after union', () => {
    const poly1: Paths64 = [[
      { x: 6251161, y: 332856160, z: 0 }, { x: 840876097, y: 97496650, z: 0 },
      { x: 976400933, y: 140787098, z: 0 }, { x: 330832885, y: 702363622, z: 0 },
      { x: 524959570, y: 901562500, z: 0 }, { x: 283075095, y: 283198665, z: 0 },
      { x: 682169472, y: 407971968, z: 0 }, { x: 341184383, y: 906937707, z: 0 },
      { x: 885255988, y: 51653123, z: 0 }, { x: 679161444, y: 348752493, z: 0 },
      { x: 110729587, y: 243797389, z: 0 }, { x: 175478881, y: 936371388, z: 0 },
      { x: 884834543, y: 92623405, z: 0 }, { x: 830335767, y: 487305557, z: 0 },
      { x: 381715781, y: 603651314, z: 0 }, { x: 429388870, y: 750813644, z: 0 },
      { x: 183632134, y: 133019917, z: 0 }, { x: 748295100, y: 710325195, z: 0 },
      { x: 736200816, y: 526977435, z: 0 }, { x: 265700863, y: 815231128, z: 0 },
      { x: 267777137, y: 451565516, z: 0 }, { x: 932290823, y: 419938943, z: 0 },
      { x: 881163203, y: 459777725, z: 0 }, { x: 46306602, y: 10129599, z: 0 },
      { x: 52939203, y: 969104432, z: 0 }, { x: 15564105, y: 724992816, z: 0 },
      { x: 826186121, y: 204403883, z: 0 }, { x: 168323587, y: 84596478, z: 0 },
      { x: 330051681, y: 190436576, z: 0 }, { x: 910281595, y: 436345833, z: 0 },
      { x: 579089233, y: 926825204, z: 0 }, { x: 409518567, y: 421262563, z: 0 },
      { x: 907897616, y: 740612275, z: 0 }, { x: 943299290, y: 731351779, z: 0 },
      { x: 220519408, y: 944234682, z: 0 }, { x: 397472466, y: 978974872, z: 0 },
      { x: 478544665, y: 67011261, z: 0 }, { x: 492508035, y: 881036163, z: 0 },
      { x: 869736187, y: 774199458, z: 0 }, { x: 738244055, y: 744934646, z: 0 },
      { x: 744662274, y: 427823310, z: 0 }, { x: 841438346, y: 988766232, z: 0 },
      { x: 614037581, y: 326952247, z: 0 }, { x: 1868663, y: 40207860, z: 0 },
      { x: 308127932, y: 719137146, z: 0 }, { x: 258010101, y: 520371199, z: 0 },
      { x: 418166295, y: 915065961, z: 0 }, { x: 49983486, y: 843699463, z: 0 },
      { x: 526874162, y: 817456881, z: 0 }, { x: 41058475, y: 738741192, z: 0 },
      { x: 727641385, y: 611946004, z: 0 }, { x: 338496075, y: 630157593, z: 0 },
      { x: 691414735, y: 818968108, z: 0 }, { x: 49426629, y: 734590805, z: 0 },
      { x: 149386829, y: 315107107, z: 0 }, { x: 537222333, y: 388854339, z: 0 },
      { x: 79101039, y: 347162131, z: 0 }, { x: 576707064, y: 71330961, z: 0 },
      { x: 712674406, y: 422581668, z: 0 }, { x: 929289005, y: 867002665, z: 0 },
      { x: 913051643, y: 149224610, z: 0 }, { x: 65254363, y: 479593145, z: 0 },
      { x: 694329570, y: 11130378, z: 0 }, { x: 913734201, y: 50414969, z: 0 },
      { x: 654447184, y: 797671163, z: 0 }, { x: 130981529, y: 731710403, z: 0 },
      { x: 331099632, y: 659944678, z: 0 }, { x: 619403370, y: 520436929, z: 0 },
      { x: 19628661, y: 496649629, z: 0 }, { x: 61993195, y: 185722653, z: 0 },
      { x: 714388595, y: 163372694, z: 0 }, { x: 615296901, y: 93286726, z: 0 },
      { x: 830312146, y: 332917500, z: 0 }, { x: 994042869, y: 607637909, z: 0 },
      { x: 784366896, y: 187042198, z: 0 }, { x: 200105950, y: 610383617, z: 0 },
      { x: 826144101, y: 905199409, z: 0 }, { x: 24835788, y: 324705858, z: 0 },
      { x: 277723420, y: 728522750, z: 0 }, { x: 630447729, y: 937469734, z: 0 },
      { x: 221564719, y: 91059621, z: 0 }, { x: 548009742, y: 327404397, z: 0 },
      { x: 227909712, y: 840292896, z: 0 }, { x: 542525953, y: 664345792, z: 0 },
      { x: 875391387, y: 975232306, z: 0 }, { x: 829573197, y: 125234027, z: 0 },
      { x: 332393412, y: 80824462, z: 0 }, { x: 137298543, y: 537715464, z: 0 },
      { x: 439096431, y: 641313184, z: 0 }, { x: 203515829, y: 441692082, z: 0 },
      { x: 205715688, y: 667575336, z: 0 }, { x: 416227233, y: 414575851, z: 0 },
      { x: 838344120, y: 95970179, z: 0 }, { x: 976010983, y: 268810085, z: 0 },
      { x: 183789536, y: 362685970, z: 0 }, { x: 490023328, y: 406886322, z: 0 },
      { x: 357540544, y: 401985157, z: 0 }, { x: 70912036, y: 799416867, z: 0 },
      { x: 587931344, y: 340081589, z: 0 }, { x: 500905973, y: 96873619, z: 0 },
    ]];

    const poly2 = Clipper.union(poly1, FillRule.NonZero);
    expect(poly2.length).toBeGreaterThan(0);

    const { result, solution } = Clipper.triangulate(poly2);
    expect([TriangulateResult.success, TriangulateResult.fail, TriangulateResult.noPolygons, TriangulateResult.pathsIntersect])
      .toContain(result);
    if (result === TriangulateResult.success) {
      expect(solution.length).toBeGreaterThan(0);
      for (const triangle of solution) {
        expect(triangle).toHaveLength(3);
      }
    }
  }, 10000);

  it('should also work with Delaunay disabled', () => {
    const poly1: Paths64 = [[
      { x: 6251161, y: 332856160, z: 0 }, { x: 840876097, y: 97496650, z: 0 },
      { x: 976400933, y: 140787098, z: 0 }, { x: 330832885, y: 702363622, z: 0 },
      { x: 524959570, y: 901562500, z: 0 }, { x: 283075095, y: 283198665, z: 0 },
      { x: 682169472, y: 407971968, z: 0 }, { x: 341184383, y: 906937707, z: 0 },
      { x: 885255988, y: 51653123, z: 0 }, { x: 679161444, y: 348752493, z: 0 },
      { x: 110729587, y: 243797389, z: 0 }, { x: 175478881, y: 936371388, z: 0 },
      { x: 884834543, y: 92623405, z: 0 }, { x: 830335767, y: 487305557, z: 0 },
      { x: 381715781, y: 603651314, z: 0 }, { x: 429388870, y: 750813644, z: 0 },
      { x: 183632134, y: 133019917, z: 0 }, { x: 748295100, y: 710325195, z: 0 },
      { x: 736200816, y: 526977435, z: 0 }, { x: 265700863, y: 815231128, z: 0 },
      { x: 267777137, y: 451565516, z: 0 }, { x: 932290823, y: 419938943, z: 0 },
      { x: 881163203, y: 459777725, z: 0 }, { x: 46306602, y: 10129599, z: 0 },
      { x: 52939203, y: 969104432, z: 0 }, { x: 15564105, y: 724992816, z: 0 },
      { x: 826186121, y: 204403883, z: 0 }, { x: 168323587, y: 84596478, z: 0 },
      { x: 330051681, y: 190436576, z: 0 }, { x: 910281595, y: 436345833, z: 0 },
      { x: 579089233, y: 926825204, z: 0 }, { x: 409518567, y: 421262563, z: 0 },
      { x: 907897616, y: 740612275, z: 0 }, { x: 943299290, y: 731351779, z: 0 },
      { x: 220519408, y: 944234682, z: 0 }, { x: 397472466, y: 978974872, z: 0 },
      { x: 478544665, y: 67011261, z: 0 }, { x: 492508035, y: 881036163, z: 0 },
      { x: 869736187, y: 774199458, z: 0 }, { x: 738244055, y: 744934646, z: 0 },
      { x: 744662274, y: 427823310, z: 0 }, { x: 841438346, y: 988766232, z: 0 },
      { x: 614037581, y: 326952247, z: 0 }, { x: 1868663, y: 40207860, z: 0 },
      { x: 308127932, y: 719137146, z: 0 }, { x: 258010101, y: 520371199, z: 0 },
      { x: 418166295, y: 915065961, z: 0 }, { x: 49983486, y: 843699463, z: 0 },
      { x: 526874162, y: 817456881, z: 0 }, { x: 41058475, y: 738741192, z: 0 },
      { x: 727641385, y: 611946004, z: 0 }, { x: 338496075, y: 630157593, z: 0 },
      { x: 691414735, y: 818968108, z: 0 }, { x: 49426629, y: 734590805, z: 0 },
      { x: 149386829, y: 315107107, z: 0 }, { x: 537222333, y: 388854339, z: 0 },
      { x: 79101039, y: 347162131, z: 0 }, { x: 576707064, y: 71330961, z: 0 },
      { x: 712674406, y: 422581668, z: 0 }, { x: 929289005, y: 867002665, z: 0 },
      { x: 913051643, y: 149224610, z: 0 }, { x: 65254363, y: 479593145, z: 0 },
      { x: 694329570, y: 11130378, z: 0 }, { x: 913734201, y: 50414969, z: 0 },
      { x: 654447184, y: 797671163, z: 0 }, { x: 130981529, y: 731710403, z: 0 },
      { x: 331099632, y: 659944678, z: 0 }, { x: 619403370, y: 520436929, z: 0 },
      { x: 19628661, y: 496649629, z: 0 }, { x: 61993195, y: 185722653, z: 0 },
      { x: 714388595, y: 163372694, z: 0 }, { x: 615296901, y: 93286726, z: 0 },
      { x: 830312146, y: 332917500, z: 0 }, { x: 994042869, y: 607637909, z: 0 },
      { x: 784366896, y: 187042198, z: 0 }, { x: 200105950, y: 610383617, z: 0 },
      { x: 826144101, y: 905199409, z: 0 }, { x: 24835788, y: 324705858, z: 0 },
      { x: 277723420, y: 728522750, z: 0 }, { x: 630447729, y: 937469734, z: 0 },
      { x: 221564719, y: 91059621, z: 0 }, { x: 548009742, y: 327404397, z: 0 },
      { x: 227909712, y: 840292896, z: 0 }, { x: 542525953, y: 664345792, z: 0 },
      { x: 875391387, y: 975232306, z: 0 }, { x: 829573197, y: 125234027, z: 0 },
      { x: 332393412, y: 80824462, z: 0 }, { x: 137298543, y: 537715464, z: 0 },
      { x: 439096431, y: 641313184, z: 0 }, { x: 203515829, y: 441692082, z: 0 },
      { x: 205715688, y: 667575336, z: 0 }, { x: 416227233, y: 414575851, z: 0 },
      { x: 838344120, y: 95970179, z: 0 }, { x: 976010983, y: 268810085, z: 0 },
      { x: 183789536, y: 362685970, z: 0 }, { x: 490023328, y: 406886322, z: 0 },
      { x: 357540544, y: 401985157, z: 0 }, { x: 70912036, y: 799416867, z: 0 },
      { x: 587931344, y: 340081589, z: 0 }, { x: 500905973, y: 96873619, z: 0 },
    ]];

    const poly2 = Clipper.union(poly1, FillRule.NonZero);
    
    // Delaunay off to isolate ear clipping path
    const { result, solution } = Clipper.triangulate(poly2, false);
    
    expect([TriangulateResult.success, TriangulateResult.fail, TriangulateResult.noPolygons, TriangulateResult.pathsIntersect])
      .toContain(result);
  }, 10000);
});

describe('Triangulation Edge Cases', () => {
  it('should handle collinear points', () => {
    const collinear: Paths64 = [
      Clipper.makePath([0, 0, 50, 50, 100, 100, 50, 150, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(collinear);

    expect([TriangulateResult.success, TriangulateResult.noPolygons, TriangulateResult.fail])
      .toContain(result);
  });

  it('star shape', () => {
    const star: Paths64 = [
      Clipper.makePath([50, 0, 61, 35, 98, 35, 68, 57, 79, 91, 50, 70, 21, 91, 32, 57, 2, 35, 39, 35])
    ];

    const { result, solution } = Clipper.triangulate(star);

    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should validate triangle orientation', () => {
    const square: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(square);

    expect(result).toBe(TriangulateResult.success);
    for (const triangle of solution) {
      const area = Clipper.area(triangle);
      expect(area).toBeGreaterThan(0);
    }
  });
});

describe('Delaunay Correctness', () => {
  it('square should satisfy circumcircle property', () => {
    const square: Paths64 = [Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])];
    const { result, solution } = Clipper.triangulate(square);
    expect(result).toBe(TriangulateResult.success);
    const { violations } = checkDelaunayProperty(solution, square);
    expect(violations).toBe(0);
  });

  it('hexagon should satisfy circumcircle property', () => {
    const hexagon: Paths64 = [
      Clipper.makePath([50, 0, 93, 25, 93, 75, 50, 100, 7, 75, 7, 25])
    ];
    const { result, solution } = Clipper.triangulate(hexagon);
    expect(result).toBe(TriangulateResult.success);
    const { violations } = checkDelaunayProperty(solution, hexagon);
    expect(violations).toBe(0);
  });

  it('star shape should satisfy circumcircle property', () => {
    const star: Paths64 = [
      Clipper.makePath([50, 0, 61, 35, 98, 35, 68, 57, 79, 91, 50, 70, 21, 91, 32, 57, 2, 35, 39, 35])
    ];
    const { result, solution } = Clipper.triangulate(star);
    expect(result).toBe(TriangulateResult.success);
    const { violations } = checkDelaunayProperty(solution, star);
    expect(violations).toBe(0);
  });

  it('issue #1058 polygon should satisfy circumcircle property', () => {
    const poly1: Paths64 = [[
      { x: 6251161, y: 332856160, z: 0 }, { x: 840876097, y: 97496650, z: 0 },
      { x: 976400933, y: 140787098, z: 0 }, { x: 330832885, y: 702363622, z: 0 },
      { x: 524959570, y: 901562500, z: 0 }, { x: 283075095, y: 283198665, z: 0 },
      { x: 682169472, y: 407971968, z: 0 }, { x: 341184383, y: 906937707, z: 0 },
      { x: 885255988, y: 51653123, z: 0 }, { x: 679161444, y: 348752493, z: 0 },
      { x: 110729587, y: 243797389, z: 0 }, { x: 175478881, y: 936371388, z: 0 },
      { x: 884834543, y: 92623405, z: 0 }, { x: 830335767, y: 487305557, z: 0 },
      { x: 381715781, y: 603651314, z: 0 }, { x: 429388870, y: 750813644, z: 0 },
      { x: 183632134, y: 133019917, z: 0 }, { x: 748295100, y: 710325195, z: 0 },
      { x: 736200816, y: 526977435, z: 0 }, { x: 265700863, y: 815231128, z: 0 },
      { x: 267777137, y: 451565516, z: 0 }, { x: 932290823, y: 419938943, z: 0 },
      { x: 881163203, y: 459777725, z: 0 }, { x: 46306602, y: 10129599, z: 0 },
      { x: 52939203, y: 969104432, z: 0 }, { x: 15564105, y: 724992816, z: 0 },
      { x: 826186121, y: 204403883, z: 0 }, { x: 168323587, y: 84596478, z: 0 },
      { x: 330051681, y: 190436576, z: 0 }, { x: 910281595, y: 436345833, z: 0 },
      { x: 579089233, y: 926825204, z: 0 }, { x: 409518567, y: 421262563, z: 0 },
      { x: 907897616, y: 740612275, z: 0 }, { x: 943299290, y: 731351779, z: 0 },
      { x: 220519408, y: 944234682, z: 0 }, { x: 397472466, y: 978974872, z: 0 },
      { x: 478544665, y: 67011261, z: 0 }, { x: 492508035, y: 881036163, z: 0 },
      { x: 869736187, y: 774199458, z: 0 }, { x: 738244055, y: 744934646, z: 0 },
      { x: 744662274, y: 427823310, z: 0 }, { x: 841438346, y: 988766232, z: 0 },
      { x: 614037581, y: 326952247, z: 0 }, { x: 1868663, y: 40207860, z: 0 },
      { x: 308127932, y: 719137146, z: 0 }, { x: 258010101, y: 520371199, z: 0 },
      { x: 418166295, y: 915065961, z: 0 }, { x: 49983486, y: 843699463, z: 0 },
      { x: 526874162, y: 817456881, z: 0 }, { x: 41058475, y: 738741192, z: 0 },
      { x: 727641385, y: 611946004, z: 0 }, { x: 338496075, y: 630157593, z: 0 },
      { x: 691414735, y: 818968108, z: 0 }, { x: 49426629, y: 734590805, z: 0 },
      { x: 149386829, y: 315107107, z: 0 }, { x: 537222333, y: 388854339, z: 0 },
      { x: 79101039, y: 347162131, z: 0 }, { x: 576707064, y: 71330961, z: 0 },
      { x: 712674406, y: 422581668, z: 0 }, { x: 929289005, y: 867002665, z: 0 },
      { x: 913051643, y: 149224610, z: 0 }, { x: 65254363, y: 479593145, z: 0 },
      { x: 694329570, y: 11130378, z: 0 }, { x: 913734201, y: 50414969, z: 0 },
      { x: 654447184, y: 797671163, z: 0 }, { x: 130981529, y: 731710403, z: 0 },
      { x: 331099632, y: 659944678, z: 0 }, { x: 619403370, y: 520436929, z: 0 },
      { x: 19628661, y: 496649629, z: 0 }, { x: 61993195, y: 185722653, z: 0 },
      { x: 714388595, y: 163372694, z: 0 }, { x: 615296901, y: 93286726, z: 0 },
      { x: 830312146, y: 332917500, z: 0 }, { x: 994042869, y: 607637909, z: 0 },
      { x: 784366896, y: 187042198, z: 0 }, { x: 200105950, y: 610383617, z: 0 },
      { x: 826144101, y: 905199409, z: 0 }, { x: 24835788, y: 324705858, z: 0 },
      { x: 277723420, y: 728522750, z: 0 }, { x: 630447729, y: 937469734, z: 0 },
      { x: 221564719, y: 91059621, z: 0 }, { x: 548009742, y: 327404397, z: 0 },
      { x: 227909712, y: 840292896, z: 0 }, { x: 542525953, y: 664345792, z: 0 },
      { x: 875391387, y: 975232306, z: 0 }, { x: 829573197, y: 125234027, z: 0 },
      { x: 332393412, y: 80824462, z: 0 }, { x: 137298543, y: 537715464, z: 0 },
      { x: 439096431, y: 641313184, z: 0 }, { x: 203515829, y: 441692082, z: 0 },
      { x: 205715688, y: 667575336, z: 0 }, { x: 416227233, y: 414575851, z: 0 },
      { x: 838344120, y: 95970179, z: 0 }, { x: 976010983, y: 268810085, z: 0 },
      { x: 183789536, y: 362685970, z: 0 }, { x: 490023328, y: 406886322, z: 0 },
      { x: 357540544, y: 401985157, z: 0 }, { x: 70912036, y: 799416867, z: 0 },
      { x: 587931344, y: 340081589, z: 0 }, { x: 500905973, y: 96873619, z: 0 },
    ]];
    const poly2 = Clipper.union(poly1, FillRule.NonZero);
    const { result, solution } = Clipper.triangulate(poly2);
    expect(result).toBe(TriangulateResult.success);
    const { violations } = checkDelaunayProperty(solution, poly2);
    expect(violations).toBe(0);
  }, 10000);
});

describe('Triangulation Precision Edge Cases', () => {
  // Near-cocircular quad stresses inCircle error bound
  it('should handle near-cocircular points correctly', () => {
    const nearCocircular: Paths64 = [
      Clipper.makePath([
        0, 0,
        1000000, 1,  // Almost collinear with next
        1000000, 1000000,
        1, 1000000
      ])
    ];

    const { result, solution } = Clipper.triangulate(nearCocircular);
    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBe(2);

    for (const tri of solution) {
      const area = Math.abs(Clipper.area(tri));
      expect(area).toBeGreaterThan(0);
    }
  });

  // Large coordinates near areSafeDeltas threshold
  it('should handle large coordinates near safe integer boundary', () => {
    const scale = 1e12; // Large but still safe
    const largeCoords: Paths64 = [
      [
        { x: Math.floor(scale), y: Math.floor(scale), z: 0 },
        { x: Math.floor(scale + 1000), y: Math.floor(scale), z: 0 },
        { x: Math.floor(scale + 1000), y: Math.floor(scale + 1000), z: 0 },
        { x: Math.floor(scale), y: Math.floor(scale + 1000), z: 0 },
      ]
    ];

    const { result, solution } = Clipper.triangulate(largeCoords);
    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBe(2);

    const { violations } = checkDelaunayProperty(solution, largeCoords);
    expect(violations).toBe(0);
  });

  // Coordinates that require BigInt fallback
  it('should handle coordinates requiring BigInt arithmetic', () => {
    const veryLarge: Paths64 = [
      [
        { x: 50000000000, y: 50000000000, z: 0 },
        { x: 50000001000, y: 50000000000, z: 0 },
        { x: 50000001000, y: 50000001000, z: 0 },
        { x: 50000000000, y: 50000001000, z: 0 },
      ]
    ];

    const { result, solution } = Clipper.triangulate(veryLarge);
    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBe(2);

    // Area sum sanity check for precision
    let totalArea = 0;
    for (const tri of solution) {
      totalArea += Math.abs(Clipper.area(tri));
    }
    const expectedArea = 1000 * 1000; // 1000x1000 square
    expect(Math.abs(totalArea - expectedArea)).toBeLessThan(1);
  });

  // Nearly collinear points exercise sign stability
  it('should handle nearly collinear points without infinite loop', () => {
    const nearlyCollinear: Paths64 = [
      Clipper.makePath([
        0, 0,
        500000, 1,     // Almost on line from origin
        1000000, 2,    // Almost on line
        1000000, 500000,
        500000, 500000,
        0, 500000
      ])
    ];

    const { result, solution } = Clipper.triangulate(nearlyCollinear);
    expect([TriangulateResult.success, TriangulateResult.fail]).toContain(result);
  }, 5000);

  // Non-convex quad stresses forceLegal guard
  it('should handle non-convex quad configurations', () => {
    const concave: Paths64 = [
      Clipper.makePath([
        0, 0,
        100, 0,
        100, 50,
        50, 25,  // Creates concavity
        0, 50
      ])
    ];

    const { result, solution } = Clipper.triangulate(concave);
    expect(result).toBe(TriangulateResult.success);

    for (const tri of solution) {
      const area = Clipper.area(tri);
      expect(area).toBeGreaterThan(0);
    }
  }, 5000);
});

describe('Triangulation Degenerate Inputs', () => {
  it('should handle duplicate vertices', () => {
    const dupes: Paths64 = [
      Clipper.makePath([
        0, 0,
        100, 0,
        100, 0,   // duplicate
        100, 100,
        100, 100, // duplicate
        0, 100,
        0, 0,
        0, 0      // duplicate
      ])
    ];

    const { result, solution } = Clipper.triangulate(dupes);
    expect([TriangulateResult.success, TriangulateResult.fail, TriangulateResult.noPolygons])
      .toContain(result);

    if (result === TriangulateResult.success) {
      for (const tri of solution) {
        expect(Math.abs(Clipper.area(tri))).toBeGreaterThan(0);
      }
    }
  });

  it('should handle closed paths with repeated start/end', () => {
    const closed: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100, 0, 0])
    ];

    const { result, solution } = Clipper.triangulate(closed);
    expect([TriangulateResult.success, TriangulateResult.fail]).toContain(result);
    if (result === TriangulateResult.success) {
      expect(solution).toHaveLength(2);
    }
  });

  it('should handle sliver spikes without collapsing', () => {
    const sliver: Paths64 = [
      Clipper.makePath([
        0, 0,
        1000000, 0,
        1000000, 1000000,
        0, 1000000,
        0, 999999,
        1, 999999,
        0, 999998
      ])
    ];

    const { result, solution } = Clipper.triangulate(sliver);
    expect(result).toBe(TriangulateResult.success);

    for (const tri of solution) {
      expect(Math.abs(Clipper.area(tri))).toBeGreaterThan(0);
    }
  });

  it('should triangulate multiple disjoint polygons', () => {
    const polys: Paths64 = [
      Clipper.makePath([0, 0, 10, 0, 10, 10, 0, 10]),
      Clipper.makePath([20, 0, 30, 0, 30, 10, 20, 10])
    ];

    const { result, solution } = Clipper.triangulate(polys);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(4);
  });

  it('should handle self-touching polygons after union cleanup', () => {
    const bowtie: Paths64 = [
      Clipper.makePath([0, 0, 10, 10, 0, 10, 10, 0])
    ];

    const cleaned = Clipper.union(bowtie, FillRule.NonZero);
    const { result, solution } = Clipper.triangulate(cleaned);
    expect([TriangulateResult.success, TriangulateResult.fail, TriangulateResult.noPolygons])
      .toContain(result);
    if (result === TriangulateResult.success) {
      expect(solution.length).toBeGreaterThan(0);
    }
  });

  it('should handle polygons that touch at a single vertex', () => {
    const touching: Paths64 = [
      Clipper.makePath([0, 0, 10, 0, 10, 10, 0, 10]),
      Clipper.makePath([10, 10, 20, 10, 20, 20, 10, 20])
    ];

    const { result, solution } = Clipper.triangulate(touching);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(4);
  });
});

describe('Issue #1062 - Overlapping triangles', () => {
  // https://github.com/AngusJohnson/Clipper2/issues/1062
  // Bug: Two triangles share two vertices but are on the same side of the shared edge
  
  function checkForOverlappingTriangles(triangles: Path64[]): { hasOverlap: boolean, details: string[] } {
    const details: string[] = [];
    
    // Build a map of edges to the triangles that use them
    const edgeToTriangles = new Map<string, { triIdx: number, thirdVertex: Point64 }[]>();
    
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      if (tri.length !== 3) continue;
      
      // For each edge of the triangle, record which triangle uses it and what the opposite vertex is
      for (let j = 0; j < 3; j++) {
        const p1 = tri[j];
        const p2 = tri[(j + 1) % 3];
        const opposite = tri[(j + 2) % 3];
        
        // Create canonical edge key (smaller point first)
        const aFirst = p1.x < p2.x || (p1.x === p2.x && p1.y <= p2.y);
        const a = aFirst ? p1 : p2;
        const b = aFirst ? p2 : p1;
        const key = `${a.x},${a.y}-${b.x},${b.y}`;
        
        let entry = edgeToTriangles.get(key);
        if (!entry) {
          entry = [];
          edgeToTriangles.set(key, entry);
        }
        entry.push({ triIdx: i, thirdVertex: opposite });
      }
    }
    
    // Check for edges shared by two triangles where both third vertices are on the same side
    let hasOverlap = false;
    for (const [edgeKey, tris] of edgeToTriangles) {
      if (tris.length !== 2) continue;
      
      const [t1, t2] = tris;
      
      // Parse edge endpoints from key
      const parts = edgeKey.split('-');
      const [ax, ay] = parts[0].split(',').map(Number);
      const [bx, by] = parts[1].split(',').map(Number);
      
      // Compute cross product sign for both third vertices relative to the edge
      const cross1 = (bx - ax) * (t1.thirdVertex.y - ay) - (by - ay) * (t1.thirdVertex.x - ax);
      const cross2 = (bx - ax) * (t2.thirdVertex.y - ay) - (by - ay) * (t2.thirdVertex.x - ax);
      
      const sign1 = cross1 > 0 ? 1 : cross1 < 0 ? -1 : 0;
      const sign2 = cross2 > 0 ? 1 : cross2 < 0 ? -1 : 0;
      
      // If both triangles' opposite vertices are on the same side, that's an overlap
      if (sign1 !== 0 && sign2 !== 0 && sign1 === sign2) {
        hasOverlap = true;
        details.push(
          `Triangles ${t1.triIdx} and ${t2.triIdx} share edge (${ax},${ay})-(${bx},${by}) ` +
          `but both opposite vertices are on the same side: ` +
          `tri ${t1.triIdx} opposite=(${t1.thirdVertex.x},${t1.thirdVertex.y}), ` +
          `tri ${t2.triIdx} opposite=(${t2.thirdVertex.x},${t2.thirdVertex.y})`
        );
      }
    }
    
    return { hasOverlap, details };
  }

  it('should not produce overlapping triangles on polygon with two holes', () => {
    // Exact test case from issue #1062
    const polys: Paths64 = [
      // Outer polygon
      [
        { x: 37905940, y: 38275460, z: 0 }, { x: 37910048, y: 38329120, z: 0 },
        { x: 37932480, y: 38342692, z: 0 }, { x: 38024372, y: 38341952, z: 0 },
        { x: 38036352, y: 38318980, z: 0 }, { x: 38027692, y: 38302340, z: 0 },
        { x: 39274280, y: 38577580, z: 0 }, { x: 39272812, y: 38676148, z: 0 },
        { x: 39298968, y: 38692848, z: 0 }, { x: 39374360, y: 38680600, z: 0 },
        { x: 39400748, y: 38621300, z: 0 }, { x: 39390060, y: 38603140, z: 0 },
        { x: 40421468, y: 38830860, z: 0 }, { x: 40408560, y: 38843492, z: 0 },
        { x: 40389152, y: 38921168, z: 0 }, { x: 40405920, y: 38936288, z: 0 },
        { x: 40492040, y: 38916380, z: 0 }, { x: 40500000, y: 38892848, z: 0 },
        { x: 40478980, y: 38843560, z: 0 }, { x: 41353300, y: 39036600, z: 0 },
        { x: 41331900, y: 39106700, z: 0 }, { x: 41351136, y: 39125940, z: 0 },
        { x: 41456060, y: 39107320, z: 0 }, { x: 41467108, y: 39079500, z: 0 },
        { x: 41460008, y: 39060160, z: 0 }, { x: 42309388, y: 39247700, z: 0 },
        { x: 42351108, y: 39295980, z: 0 }, { x: 42377708, y: 39289920, z: 0 },
        { x: 42387832, y: 39265008, z: 0 }, { x: 42942760, y: 39387540, z: 0 },
        { x: 42882808, y: 40444728, z: 0 }, { x: 42351900, y: 40896588, z: 0 },
        { x: 42350732, y: 40895220, z: 0 }, { x: 42323052, y: 40901368, z: 0 },
        { x: 42310448, y: 40931860, z: 0 }, { x: 39440892, y: 43374200, z: 0 },
        { x: 38841212, y: 42663232, z: 0 }, { x: 38572392, y: 42459248, z: 0 },
        { x: 36975932, y: 42011768, z: 0 }, { x: 36734688, y: 42957568, z: 0 },
        { x: 36903560, y: 43524960, z: 0 }, { x: 37069180, y: 43546652, z: 0 },
        { x: 37069000, y: 43547432, z: 0 }, { x: 37072340, y: 43561908, z: 0 },
        { x: 37079388, y: 43576200, z: 0 }, { x: 37085420, y: 43580600, z: 0 },
        { x: 37096520, y: 43583836, z: 0 }, { x: 37104260, y: 43578180, z: 0 },
        { x: 37105140, y: 43564312, z: 0 }, { x: 37099908, y: 43550680, z: 0 },
        { x: 37360000, y: 43584760, z: 0 }, { x: 38167500, y: 44267260, z: 0 },
        { x: 38251332, y: 44386660, z: 0 }, { x: 37256900, y: 45233040, z: 0 },
        { x: 37169300, y: 45341412, z: 0 }, { x: 37157580, y: 45337432, z: 0 },
        { x: 36405892, y: 45302508, z: 0 }, { x: 35429860, y: 45162432, z: 0 },
        { x: 34447972, y: 45259352, z: 0 }, { x: 33569032, y: 45533188, z: 0 },
        { x: 32784500, y: 45548520, z: 0 }, { x: 32529690, y: 45484780, z: 0 },
        { x: 32153798, y: 45907540, z: 0 }, { x: 32010258, y: 46323340, z: 0 },
        { x: 32048420, y: 46560324, z: 0 }, { x: 32042600, y: 46581220, z: 0 },
        { x: 32045668, y: 46585732, z: 0 }, { x: 32052890, y: 46588128, z: 0 },
        { x: 32086960, y: 46799660, z: 0 }, { x: 32424418, y: 47162832, z: 0 },
        { x: 33209480, y: 47327720, z: 0 }, { x: 33904352, y: 47160380, z: 0 },
        { x: 34268920, y: 46851152, z: 0 }, { x: 35334160, y: 46557272, z: 0 },
        { x: 36423952, y: 46587508, z: 0 }, { x: 36428448, y: 46588532, z: 0 },
        { x: 36428128, y: 46592012, z: 0 }, { x: 36441588, y: 46614020, z: 0 },
        { x: 36465740, y: 46612832, z: 0 }, { x: 36472528, y: 46609468, z: 0 },
        { x: 36473712, y: 46598808, z: 0 }, { x: 37137640, y: 46749580, z: 0 },
        { x: 38453700, y: 49880780, z: 0 }, { x: 36598340, y: 51842072, z: 0 },
        { x: 36586760, y: 51838700, z: 0 }, { x: 36517928, y: 51898712, z: 0 },
        { x: 36517620, y: 51914704, z: 0 }, { x: 36523780, y: 51920888, z: 0 },
        { x: 33495080, y: 55122540, z: 0 }, { x: 31846060, y: 54686660, z: 0 },
        { x: 31463880, y: 53506380, z: 0 }, { x: 31060200, y: 51600360, z: 0 },
        { x: 31692980, y: 51360580, z: 0 }, { x: 32533320, y: 51275600, z: 0 },
        { x: 32957400, y: 51116860, z: 0 }, { x: 33193740, y: 50893216, z: 0 },
        { x: 33994752, y: 50526908, z: 0 }, { x: 34468532, y: 50122596, z: 0 },
        { x: 35522260, y: 49579932, z: 0 }, { x: 35836720, y: 49091180, z: 0 },
        { x: 35836720, y: 48583280, z: 0 }, { x: 35650060, y: 48259980, z: 0 },
        { x: 35211180, y: 48006592, z: 0 }, { x: 34469540, y: 48034520, z: 0 },
        { x: 33975820, y: 48305080, z: 0 }, { x: 33181398, y: 49059084, z: 0 },
        { x: 31843220, y: 49658540, z: 0 }, { x: 30691750, y: 49860620, z: 0 },
        { x: 30511680, y: 49010372, z: 0 }, { x: 30516690, y: 49005488, z: 0 },
        { x: 30522290, y: 48967640, z: 0 }, { x: 30498860, y: 48924448, z: 0 },
        { x: 30493492, y: 48924492, z: 0 }, { x: 29867610, y: 45969256, z: 0 },
        { x: 30690472, y: 44411840, z: 0 }, { x: 30797230, y: 44079008, z: 0 },
        { x: 30831700, y: 43824620, z: 0 }, { x: 30836170, y: 43841088, z: 0 },
        { x: 30901210, y: 43902192, z: 0 }, { x: 30925030, y: 43894092, z: 0 },
        { x: 30952460, y: 43799468, z: 0 }, { x: 30933898, y: 43778940, z: 0 },
        { x: 30866170, y: 43771720, z: 0 }, { x: 30833460, y: 43811668, z: 0 },
        { x: 31425860, y: 39441168, z: 0 }, { x: 31905600, y: 39235292, z: 0 },
        { x: 31906120, y: 39297228, z: 0 }, { x: 31929780, y: 39309560, z: 0 },
        { x: 32022430, y: 39261300, z: 0 }, { x: 32024580, y: 39232020, z: 0 },
        { x: 31996918, y: 39196100, z: 0 }, { x: 32144920, y: 39132592, z: 0 },
        { x: 32142610, y: 39148048, z: 0 }, { x: 32154060, y: 39187820, z: 0 },
        { x: 32163310, y: 39197920, z: 0 }, { x: 32174700, y: 39196300, z: 0 },
        { x: 32193310, y: 39187560, z: 0 }, { x: 32196150, y: 39178888, z: 0 },
        { x: 32192900, y: 39156112, z: 0 }, { x: 32183930, y: 39133112, z: 0 },
        { x: 32175200, y: 39125520, z: 0 }, { x: 32167950, y: 39122700, z: 0 },
        { x: 34185628, y: 38256840, z: 0 }, { x: 34129620, y: 38635528, z: 0 },
        { x: 34242420, y: 39592760, z: 0 }, { x: 34219120, y: 40424272, z: 0 },
        { x: 34095992, y: 41096400, z: 0 }, { x: 34236580, y: 41896268, z: 0 },
        { x: 34639840, y: 42289620, z: 0 }, { x: 34772740, y: 42483120, z: 0 },
        { x: 34765380, y: 42488320, z: 0 }, { x: 34748740, y: 42526548, z: 0 },
        { x: 34725920, y: 42531688, z: 0 }, { x: 34707548, y: 42554132, z: 0 },
        { x: 34696480, y: 42614188, z: 0 }, { x: 34743548, y: 42644500, z: 0 },
        { x: 34795108, y: 42638348, z: 0 }, { x: 34797540, y: 42633148, z: 0 },
        { x: 34816068, y: 42641040, z: 0 }, { x: 34864720, y: 42617040, z: 0 },
        { x: 35044540, y: 42878864, z: 0 }, { x: 35523268, y: 42511440, z: 0 },
        { x: 35400440, y: 41788820, z: 0 }, { x: 35472472, y: 40874728, z: 0 },
        { x: 35660868, y: 40422660, z: 0 }, { x: 35575100, y: 40339460, z: 0 },
        { x: 35728120, y: 39702328, z: 0 }, { x: 35734352, y: 39433480, z: 0 },
        { x: 35998920, y: 38157000, z: 0 }, { x: 35858880, y: 38061508, z: 0 },
        { x: 35864232, y: 37824680, z: 0 }
      ],
      // Hole 1
      [
        { x: 30154670, y: 47015412, z: 0 }, { x: 30155148, y: 47024808, z: 0 },
        { x: 30201650, y: 47060500, z: 0 }, { x: 30210820, y: 47058492, z: 0 },
        { x: 30230630, y: 47035180, z: 0 }, { x: 30233010, y: 46995952, z: 0 },
        { x: 30201508, y: 46976680, z: 0 }, { x: 30190080, y: 46974952, z: 0 }
      ],
      // Hole 2
      [
        { x: 30216202, y: 46463664, z: 0 }, { x: 30212320, y: 46468180, z: 0 },
        { x: 30215682, y: 46504800, z: 0 }, { x: 30220540, y: 46507912, z: 0 },
        { x: 30239450, y: 46507080, z: 0 }, { x: 30258540, y: 46491468, z: 0 },
        { x: 30254270, y: 46468760, z: 0 }, { x: 30250200, y: 46462760, z: 0 }
      ]
    ];

    // First union to clean up the polygon (as done in the original issue)
    const cleaned = Clipper.union(polys, FillRule.NonZero);
    expect(cleaned.length).toBeGreaterThan(0);

    // Triangulate
    const { result, solution } = Clipper.triangulate(cleaned);
    
    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);

    // Check for overlapping triangles
    const { hasOverlap, details } = checkForOverlappingTriangles(solution);
    
    if (hasOverlap) {
      console.log('Overlapping triangles detected:');
      for (const detail of details) {
        console.log('  ', detail);
      }
    }
    
    expect(hasOverlap).toBe(false);
  });

  it('should not produce overlapping triangles with Delaunay disabled', () => {
    // Same polygon, but with Delaunay optimization disabled
    const polys: Paths64 = [
      // Outer polygon (same as above)
      [
        { x: 37905940, y: 38275460, z: 0 }, { x: 37910048, y: 38329120, z: 0 },
        { x: 37932480, y: 38342692, z: 0 }, { x: 38024372, y: 38341952, z: 0 },
        { x: 38036352, y: 38318980, z: 0 }, { x: 38027692, y: 38302340, z: 0 },
        { x: 39274280, y: 38577580, z: 0 }, { x: 39272812, y: 38676148, z: 0 },
        { x: 39298968, y: 38692848, z: 0 }, { x: 39374360, y: 38680600, z: 0 },
        { x: 39400748, y: 38621300, z: 0 }, { x: 39390060, y: 38603140, z: 0 },
        { x: 40421468, y: 38830860, z: 0 }, { x: 40408560, y: 38843492, z: 0 },
        { x: 40389152, y: 38921168, z: 0 }, { x: 40405920, y: 38936288, z: 0 },
        { x: 40492040, y: 38916380, z: 0 }, { x: 40500000, y: 38892848, z: 0 },
        { x: 40478980, y: 38843560, z: 0 }, { x: 41353300, y: 39036600, z: 0 },
        { x: 41331900, y: 39106700, z: 0 }, { x: 41351136, y: 39125940, z: 0 },
        { x: 41456060, y: 39107320, z: 0 }, { x: 41467108, y: 39079500, z: 0 },
        { x: 41460008, y: 39060160, z: 0 }, { x: 42309388, y: 39247700, z: 0 },
        { x: 42351108, y: 39295980, z: 0 }, { x: 42377708, y: 39289920, z: 0 },
        { x: 42387832, y: 39265008, z: 0 }, { x: 42942760, y: 39387540, z: 0 },
        { x: 42882808, y: 40444728, z: 0 }, { x: 42351900, y: 40896588, z: 0 },
        { x: 42350732, y: 40895220, z: 0 }, { x: 42323052, y: 40901368, z: 0 },
        { x: 42310448, y: 40931860, z: 0 }, { x: 39440892, y: 43374200, z: 0 },
        { x: 38841212, y: 42663232, z: 0 }, { x: 38572392, y: 42459248, z: 0 },
        { x: 36975932, y: 42011768, z: 0 }, { x: 36734688, y: 42957568, z: 0 },
        { x: 36903560, y: 43524960, z: 0 }, { x: 37069180, y: 43546652, z: 0 },
        { x: 37069000, y: 43547432, z: 0 }, { x: 37072340, y: 43561908, z: 0 },
        { x: 37079388, y: 43576200, z: 0 }, { x: 37085420, y: 43580600, z: 0 },
        { x: 37096520, y: 43583836, z: 0 }, { x: 37104260, y: 43578180, z: 0 },
        { x: 37105140, y: 43564312, z: 0 }, { x: 37099908, y: 43550680, z: 0 },
        { x: 37360000, y: 43584760, z: 0 }, { x: 38167500, y: 44267260, z: 0 },
        { x: 38251332, y: 44386660, z: 0 }, { x: 37256900, y: 45233040, z: 0 },
        { x: 37169300, y: 45341412, z: 0 }, { x: 37157580, y: 45337432, z: 0 },
        { x: 36405892, y: 45302508, z: 0 }, { x: 35429860, y: 45162432, z: 0 },
        { x: 34447972, y: 45259352, z: 0 }, { x: 33569032, y: 45533188, z: 0 },
        { x: 32784500, y: 45548520, z: 0 }, { x: 32529690, y: 45484780, z: 0 },
        { x: 32153798, y: 45907540, z: 0 }, { x: 32010258, y: 46323340, z: 0 },
        { x: 32048420, y: 46560324, z: 0 }, { x: 32042600, y: 46581220, z: 0 },
        { x: 32045668, y: 46585732, z: 0 }, { x: 32052890, y: 46588128, z: 0 },
        { x: 32086960, y: 46799660, z: 0 }, { x: 32424418, y: 47162832, z: 0 },
        { x: 33209480, y: 47327720, z: 0 }, { x: 33904352, y: 47160380, z: 0 },
        { x: 34268920, y: 46851152, z: 0 }, { x: 35334160, y: 46557272, z: 0 },
        { x: 36423952, y: 46587508, z: 0 }, { x: 36428448, y: 46588532, z: 0 },
        { x: 36428128, y: 46592012, z: 0 }, { x: 36441588, y: 46614020, z: 0 },
        { x: 36465740, y: 46612832, z: 0 }, { x: 36472528, y: 46609468, z: 0 },
        { x: 36473712, y: 46598808, z: 0 }, { x: 37137640, y: 46749580, z: 0 },
        { x: 38453700, y: 49880780, z: 0 }, { x: 36598340, y: 51842072, z: 0 },
        { x: 36586760, y: 51838700, z: 0 }, { x: 36517928, y: 51898712, z: 0 },
        { x: 36517620, y: 51914704, z: 0 }, { x: 36523780, y: 51920888, z: 0 },
        { x: 33495080, y: 55122540, z: 0 }, { x: 31846060, y: 54686660, z: 0 },
        { x: 31463880, y: 53506380, z: 0 }, { x: 31060200, y: 51600360, z: 0 },
        { x: 31692980, y: 51360580, z: 0 }, { x: 32533320, y: 51275600, z: 0 },
        { x: 32957400, y: 51116860, z: 0 }, { x: 33193740, y: 50893216, z: 0 },
        { x: 33994752, y: 50526908, z: 0 }, { x: 34468532, y: 50122596, z: 0 },
        { x: 35522260, y: 49579932, z: 0 }, { x: 35836720, y: 49091180, z: 0 },
        { x: 35836720, y: 48583280, z: 0 }, { x: 35650060, y: 48259980, z: 0 },
        { x: 35211180, y: 48006592, z: 0 }, { x: 34469540, y: 48034520, z: 0 },
        { x: 33975820, y: 48305080, z: 0 }, { x: 33181398, y: 49059084, z: 0 },
        { x: 31843220, y: 49658540, z: 0 }, { x: 30691750, y: 49860620, z: 0 },
        { x: 30511680, y: 49010372, z: 0 }, { x: 30516690, y: 49005488, z: 0 },
        { x: 30522290, y: 48967640, z: 0 }, { x: 30498860, y: 48924448, z: 0 },
        { x: 30493492, y: 48924492, z: 0 }, { x: 29867610, y: 45969256, z: 0 },
        { x: 30690472, y: 44411840, z: 0 }, { x: 30797230, y: 44079008, z: 0 },
        { x: 30831700, y: 43824620, z: 0 }, { x: 30836170, y: 43841088, z: 0 },
        { x: 30901210, y: 43902192, z: 0 }, { x: 30925030, y: 43894092, z: 0 },
        { x: 30952460, y: 43799468, z: 0 }, { x: 30933898, y: 43778940, z: 0 },
        { x: 30866170, y: 43771720, z: 0 }, { x: 30833460, y: 43811668, z: 0 },
        { x: 31425860, y: 39441168, z: 0 }, { x: 31905600, y: 39235292, z: 0 },
        { x: 31906120, y: 39297228, z: 0 }, { x: 31929780, y: 39309560, z: 0 },
        { x: 32022430, y: 39261300, z: 0 }, { x: 32024580, y: 39232020, z: 0 },
        { x: 31996918, y: 39196100, z: 0 }, { x: 32144920, y: 39132592, z: 0 },
        { x: 32142610, y: 39148048, z: 0 }, { x: 32154060, y: 39187820, z: 0 },
        { x: 32163310, y: 39197920, z: 0 }, { x: 32174700, y: 39196300, z: 0 },
        { x: 32193310, y: 39187560, z: 0 }, { x: 32196150, y: 39178888, z: 0 },
        { x: 32192900, y: 39156112, z: 0 }, { x: 32183930, y: 39133112, z: 0 },
        { x: 32175200, y: 39125520, z: 0 }, { x: 32167950, y: 39122700, z: 0 },
        { x: 34185628, y: 38256840, z: 0 }, { x: 34129620, y: 38635528, z: 0 },
        { x: 34242420, y: 39592760, z: 0 }, { x: 34219120, y: 40424272, z: 0 },
        { x: 34095992, y: 41096400, z: 0 }, { x: 34236580, y: 41896268, z: 0 },
        { x: 34639840, y: 42289620, z: 0 }, { x: 34772740, y: 42483120, z: 0 },
        { x: 34765380, y: 42488320, z: 0 }, { x: 34748740, y: 42526548, z: 0 },
        { x: 34725920, y: 42531688, z: 0 }, { x: 34707548, y: 42554132, z: 0 },
        { x: 34696480, y: 42614188, z: 0 }, { x: 34743548, y: 42644500, z: 0 },
        { x: 34795108, y: 42638348, z: 0 }, { x: 34797540, y: 42633148, z: 0 },
        { x: 34816068, y: 42641040, z: 0 }, { x: 34864720, y: 42617040, z: 0 },
        { x: 35044540, y: 42878864, z: 0 }, { x: 35523268, y: 42511440, z: 0 },
        { x: 35400440, y: 41788820, z: 0 }, { x: 35472472, y: 40874728, z: 0 },
        { x: 35660868, y: 40422660, z: 0 }, { x: 35575100, y: 40339460, z: 0 },
        { x: 35728120, y: 39702328, z: 0 }, { x: 35734352, y: 39433480, z: 0 },
        { x: 35998920, y: 38157000, z: 0 }, { x: 35858880, y: 38061508, z: 0 },
        { x: 35864232, y: 37824680, z: 0 }
      ],
      // Hole 1
      [
        { x: 30154670, y: 47015412, z: 0 }, { x: 30155148, y: 47024808, z: 0 },
        { x: 30201650, y: 47060500, z: 0 }, { x: 30210820, y: 47058492, z: 0 },
        { x: 30230630, y: 47035180, z: 0 }, { x: 30233010, y: 46995952, z: 0 },
        { x: 30201508, y: 46976680, z: 0 }, { x: 30190080, y: 46974952, z: 0 }
      ],
      // Hole 2
      [
        { x: 30216202, y: 46463664, z: 0 }, { x: 30212320, y: 46468180, z: 0 },
        { x: 30215682, y: 46504800, z: 0 }, { x: 30220540, y: 46507912, z: 0 },
        { x: 30239450, y: 46507080, z: 0 }, { x: 30258540, y: 46491468, z: 0 },
        { x: 30254270, y: 46468760, z: 0 }, { x: 30250200, y: 46462760, z: 0 }
      ]
    ];

    const cleaned = Clipper.union(polys, FillRule.NonZero);
    
    // Triangulate with Delaunay disabled
    const { result, solution } = Clipper.triangulate(cleaned, false);
    
    expect(result).toBe(TriangulateResult.success);
    
    const { hasOverlap, details } = checkForOverlappingTriangles(solution);
    
    if (hasOverlap) {
      console.log('Overlapping triangles detected (Delaunay disabled):');
      for (const detail of details) {
        console.log('  ', detail);
      }
    }
    
    expect(hasOverlap).toBe(false);
  });
});

describe('Triangulation Robustness', () => {
  // Small deterministic fuzz set
  it('should handle various random polygon configurations', () => {
    const seed = 12345;
    let rng = seed;
    const nextRand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng;
    };

    for (let trial = 0; trial < 10; trial++) {
      const numPoints = 10 + (nextRand() % 20);
      const points: Point64[] = [];
      
      for (let i = 0; i < numPoints; i++) {
        points.push({
          x: nextRand() % 10000,
          y: nextRand() % 10000,
          z: 0
        });
      }

      const poly: Paths64 = [points];
      
      // Union to resolve crossings
      const cleaned = Clipper.union(poly, FillRule.NonZero);
      
      if (cleaned.length > 0) {
        const { result } = Clipper.triangulate(cleaned);
        // Guard against hangs and invalid status codes
        expect([
          TriangulateResult.success,
          TriangulateResult.fail,
          TriangulateResult.noPolygons,
          TriangulateResult.pathsIntersect
        ]).toContain(result);
      }
    }
  }, 30000);

  // Timeout guard
  it('should complete triangulation within timeout for complex polygons', () => {
    // Many vertices and alternating radius
    const numVertices = 100;
    const points: Point64[] = [];
    
    for (let i = 0; i < numVertices; i++) {
      const angle = (2 * Math.PI * i) / numVertices;
      const radius = 1000 + (i % 2) * 200; // Alternating radius for star-like shape
      points.push({
        x: Math.round(Math.cos(angle) * radius) + 1500,
        y: Math.round(Math.sin(angle) * radius) + 1500,
        z: 0
      });
    }

    const poly: Paths64 = [points];
    const startTime = Date.now();
    const { result, solution } = Clipper.triangulate(poly);
    const elapsed = Date.now() - startTime;

    expect(result).toBe(TriangulateResult.success);
    expect(elapsed).toBeLessThan(5000); // 5s guardrail
    expect(solution.length).toBeGreaterThan(0);
  }, 10000);
});
