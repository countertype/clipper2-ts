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
    
    // With Delaunay disabled, should not have the infinite loop issue
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
