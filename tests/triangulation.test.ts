import { describe, it, expect } from 'vitest';
import { Clipper } from '../src/Clipper';
import { TriangulateResult, Paths64, PathsD } from '../src/index';

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
