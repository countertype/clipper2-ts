import { describe, it, expect } from 'vitest';
import { Clipper } from '../src/Clipper';
import { TriangulateResult, Paths64, PathsD } from '../src/index';

/**
 * Triangulation tests
 * Tests constrained Delaunay triangulation functionality
 */

describe('Triangulation Tests (Point64)', () => {
  it('should triangulate a simple square', () => {
    const square: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(square);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2); // A square is triangulated into 2 triangles
    
    // Each triangle should have 3 vertices
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }

    // Check that triangles cover approximately the same area as the square
    let totalArea = 0;
    for (const triangle of solution) {
      totalArea += Math.abs(Clipper.area(triangle));
    }
    expect(Math.abs(totalArea - 10000)).toBeLessThan(1); // Square area is 100*100 = 10000
  });

  it('should triangulate a simple triangle (returns single triangle)', () => {
    const triangle: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 50, 100])
    ];

    const { result, solution } = Clipper.triangulate(triangle);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(1); // A triangle stays a triangle
    expect(solution[0]).toHaveLength(3);
  });

  it('should triangulate a pentagon', () => {
    const pentagon: Paths64 = [
      Clipper.makePath([50, 0, 100, 38, 82, 100, 18, 100, 0, 38])
    ];

    const { result, solution } = Clipper.triangulate(pentagon);

    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(3); // A pentagon is triangulated into 3 triangles
    
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
    expect(solution).toHaveLength(4); // A hexagon is triangulated into 4 triangles
    
    for (const triangle of solution) {
      expect(triangle).toHaveLength(3);
    }
  });

  it('should handle a polygon with a hole', () => {
    const outer: Paths64 = [
      Clipper.makePath([0, 0, 200, 0, 200, 200, 0, 200]),  // outer square
      Clipper.makePath([50, 50, 150, 50, 150, 150, 50, 150]) // inner hole (counter-clockwise)
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
    
    // Both should produce triangulations
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

describe('Triangulation Edge Cases', () => {
  it('should handle collinear points', () => {
    const collinear: Paths64 = [
      Clipper.makePath([0, 0, 50, 50, 100, 100, 50, 150, 0, 100])
    ];

    const { result, solution } = Clipper.triangulate(collinear);

    // Should either succeed or handle gracefully
    expect([TriangulateResult.success, TriangulateResult.noPolygons, TriangulateResult.fail])
      .toContain(result);
  });

  it('should handle star shape', () => {
    // Five-pointed star
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
    
    // All triangles should have consistent (counter-clockwise) orientation
    for (const triangle of solution) {
      const area = Clipper.area(triangle);
      expect(area).toBeGreaterThan(0); // Counter-clockwise = positive area
    }
  });
});













