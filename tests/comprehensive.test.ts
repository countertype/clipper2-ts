// Comprehensive Integration Tests
import { describe, test, expect } from 'vitest';
import { 
  Clipper64, 
  ClipType, 
  FillRule, 
  Paths64, 
  Clipper, 
  PolyTree64,
  ClipperOffset,
  JoinType,
  EndType,
  Point64,
  RectClip64,
  Rect64Utils,
  Point64Utils
} from '../src';

describe('Comprehensive Integration Tests', () => {
  // Boolean operations integration test
  test('should perform all boolean operations correctly', () => {
    const subject: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];
    
    const clip: Paths64 = [
      Clipper.makePath([50, 50, 150, 50, 150, 150, 50, 150])
    ];
    
    // Test Intersection
    const intersectionResult = Clipper.intersect(subject, clip, FillRule.NonZero);
    expect(intersectionResult).toHaveLength(1);
    expect(Math.abs(Clipper.areaPaths(intersectionResult))).toBe(2500); // 50x50 overlap
    
    // Test Union
    const unionResult = Clipper.union(subject, clip, FillRule.NonZero);
    expect(unionResult).toHaveLength(1);
    expect(Math.abs(Clipper.areaPaths(unionResult))).toBeGreaterThan(10000); // Should be larger than either input
    
    // Test Difference
    const differenceResult = Clipper.difference(subject, clip, FillRule.NonZero);
    expect(differenceResult).toHaveLength(1);
    
    // Test XOR
    const xorResult = Clipper.xor(subject, clip, FillRule.NonZero);
    expect(xorResult).toHaveLength(2); // Should produce two separate regions
  });

  // Path utility functions integration test
  test('should handle path utility functions correctly', () => {
    const originalPath = Clipper.makePath([0, 0, 10, 0, 10, 10, 0, 10]);
    
    // Test scaling
    const scaledPath = Clipper.scalePath(originalPath, 2.0);
    expect(scaledPath[1]).toEqual({ x: 20, y: 0 });
    
    // Test translation
    const translatedPath = Clipper.translatePath(originalPath, 5, 7);
    expect(translatedPath[0]).toEqual({ x: 5, y: 7 });
    
    // Test reversal
    const reversedPath = Clipper.reversePath(originalPath);
    expect(reversedPath[0]).toEqual(originalPath[originalPath.length - 1]);
    
    // Test bounds calculation
    const bounds = Clipper.getBounds(originalPath);
    expect(bounds.left).toBe(0);
    expect(bounds.right).toBe(10);
    expect(bounds.top).toBe(0);
    expect(bounds.bottom).toBe(10);
    
    // Test area calculation
    const area = Math.abs(Clipper.area(originalPath));
    expect(area).toBe(100);
    
    // Test orientation
    const isPositiveOrientation = Clipper.isPositive(originalPath);
    expect(typeof isPositiveOrientation).toBe('boolean');
  });

  // Rectangle clipping integration test
  test('should perform rectangle clipping correctly', () => {
    const rect = Rect64Utils.create(50, 50, 150, 150);
    
    // Test polygon completely inside rectangle
    const insidePoly: Paths64 = [
      Clipper.makePath([60, 60, 140, 60, 140, 140, 60, 140])
    ];
    
    let result = Clipper.rectClip(rect, insidePoly);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(insidePoly[0]);
    
    // Test polygon completely outside rectangle
    const outsidePoly: Paths64 = [
      Clipper.makePath([200, 200, 300, 200, 300, 300, 200, 300])
    ];
    
    result = Clipper.rectClip(rect, outsidePoly);
    expect(result).toHaveLength(0);
    
    // Test polygon intersecting rectangle
    const intersectingPoly: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];
    
    result = Clipper.rectClip(rect, intersectingPoly);
    expect(result).toHaveLength(1);
    expect(result[0].length).toBeGreaterThanOrEqual(3);
  });

  // RectClip: polygon passes right through the rect (enters one side, exits the opposite)
  test('rectClip handles pass-through polygon', () => {
    const rect = Rect64Utils.create(100, 100, 200, 200);
    // Tall thin polygon that enters from top, exits from bottom
    const passThrough: Paths64 = [
      Clipper.makePath([140, 0, 160, 0, 160, 300, 140, 300])
    ];
    const result = Clipper.rectClip(rect, passThrough);
    expect(result).toHaveLength(1);
    // Clipped result should be bounded by the rect vertically
    for (const pt of result[0]) {
      expect(pt.y).toBeGreaterThanOrEqual(100);
      expect(pt.y).toBeLessThanOrEqual(200);
    }
  });

  // RectClip: polygon crosses two adjacent edges (enters left, exits top)
  test('rectClip handles corner-crossing polygon', () => {
    const rect = Rect64Utils.create(100, 100, 200, 200);
    // Triangle that enters from the left side, exits from the top
    const cornerCross: Paths64 = [
      Clipper.makePath([50, 150, 150, 50, 150, 150])
    ];
    const result = Clipper.rectClip(rect, cornerCross);
    expect(result).toHaveLength(1);
    expect(result[0].length).toBeGreaterThanOrEqual(3);
    for (const pt of result[0]) {
      expect(pt.x).toBeGreaterThanOrEqual(100);
      expect(pt.x).toBeLessThanOrEqual(200);
      expect(pt.y).toBeGreaterThanOrEqual(100);
      expect(pt.y).toBeLessThanOrEqual(200);
    }
  });

  // RectClip: polygon completely contains the rect
  test('rectClip handles polygon enclosing rect', () => {
    const rect = Rect64Utils.create(100, 100, 200, 200);
    const enclosing: Paths64 = [
      Clipper.makePath([0, 0, 300, 0, 300, 300, 0, 300])
    ];
    const result = Clipper.rectClip(rect, enclosing);
    expect(result).toHaveLength(1);
    // Result should be the rect itself
    const bounds = Clipper.getBounds(result[0]);
    expect(bounds.left).toBe(100);
    expect(bounds.top).toBe(100);
    expect(bounds.right).toBe(200);
    expect(bounds.bottom).toBe(200);
  });

  // RectClip: concave polygon with multiple crossings on the same edge
  test('rectClip handles concave polygon with multiple edge crossings', () => {
    const rect = Rect64Utils.create(100, 100, 300, 300);
    // W-shaped polygon that crosses the top edge multiple times
    const concave: Paths64 = [
      Clipper.makePath([
        50, 50,   // above-left
        150, 200, // dips into rect
        200, 50,  // back above
        250, 200, // dips into rect again
        350, 50,  // above-right
        350, 350, // below-right
        50, 350   // below-left
      ])
    ];
    const result = Clipper.rectClip(rect, concave);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // All result points should be within the rect
    for (const path of result) {
      for (const pt of path) {
        expect(pt.x).toBeGreaterThanOrEqual(100);
        expect(pt.x).toBeLessThanOrEqual(300);
        expect(pt.y).toBeGreaterThanOrEqual(100);
        expect(pt.y).toBeLessThanOrEqual(300);
      }
    }
  });

  // RectClip: polygon with edge exactly on rect boundary
  test('rectClip handles polygon with edge on rect boundary', () => {
    const rect = Rect64Utils.create(100, 100, 200, 200);
    // Polygon shares its left edge with the rect's right edge
    const onEdge: Paths64 = [
      Clipper.makePath([200, 100, 300, 100, 300, 200, 200, 200])
    ];
    const result = Clipper.rectClip(rect, onEdge);
    // Touching at a line (zero area overlap) - could be 0 or 1 depending on implementation
    // but should not crash
    expect(result.length).toBeLessThanOrEqual(1);
  });

  // RectClip: multiple polygons, mix of inside/outside/crossing
  test('rectClip handles multiple polygons', () => {
    const rect = Rect64Utils.create(100, 100, 300, 300);
    const paths: Paths64 = [
      Clipper.makePath([120, 120, 280, 120, 280, 280, 120, 280]), // fully inside
      Clipper.makePath([400, 400, 500, 400, 500, 500, 400, 500]), // fully outside
      Clipper.makePath([50, 150, 350, 150, 350, 250, 50, 250]),   // crosses left and right
    ];
    const result = Clipper.rectClip(rect, paths);
    expect(result).toHaveLength(2); // inside + crossing, not the outside one
  });

  // RectClipLines: line passes through rect
  test('rectClipLines handles line through rect', () => {
    const rect = Rect64Utils.create(100, 100, 200, 200);
    const lines: Paths64 = [
      Clipper.makePath([50, 150, 250, 150]) // horizontal line through middle
    ];
    const result = Clipper.rectClipLines(rect, lines);
    expect(result).toHaveLength(1);
    // Clipped segment should span the rect width
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].x).toBe(100);
    expect(result[0][1].x).toBe(200);
  });

  // Point utility functions test
  test('should handle point utility functions correctly', () => {
    const pt1 = Point64Utils.create(10, 20);
    const pt2 = Point64Utils.create(30, 40);
    
    // Test point creation
    expect(pt1.x).toBe(10);
    expect(pt1.y).toBe(20);
    
    // Test point equality
    const pt3 = Point64Utils.create(10, 20);
    expect(Point64Utils.equals(pt1, pt3)).toBe(true);
    expect(Point64Utils.equals(pt1, pt2)).toBe(false);
    
    // Test point arithmetic
    const sum = Point64Utils.add(pt1, pt2);
    expect(sum).toEqual({ x: 40, y: 60, z: 0 });
    
    const diff = Point64Utils.subtract(pt2, pt1);
    expect(diff).toEqual({ x: 20, y: 20, z: 0 });
  });

  // Collinear point handling test
  test('should handle collinear points correctly', () => {
    const pathWithCollinear = Clipper.makePath([
      0, 0, 50, 0, 100, 0, 100, 100, 0, 100
    ]);
    
    // Test with PreserveCollinear = false (default)
    const clipper1 = new Clipper64();
    clipper1.preserveCollinear = false;
    clipper1.addSubject([pathWithCollinear]);
    
    const solution1: Paths64 = [];
    const success1 = clipper1.execute(ClipType.Union, FillRule.NonZero, solution1);
    
    expect(success1).toBe(true);
    expect(solution1).toHaveLength(1);
    expect(solution1[0].length).toBeLessThan(pathWithCollinear.length); // Collinear points should be removed
    
    // Test with PreserveCollinear = true
    const clipper2 = new Clipper64();
    clipper2.preserveCollinear = true;
    clipper2.addSubject([pathWithCollinear]);
    
    const solution2: Paths64 = [];
    const success2 = clipper2.execute(ClipType.Union, FillRule.NonZero, solution2);
    
    expect(success2).toBe(true);
    expect(solution2).toHaveLength(1);
    expect(solution2[0].length).toBeGreaterThanOrEqual(solution1[0].length); // Should preserve more points
  });

  // Fill rule behavior validation
  test('should handle different fill rules correctly', () => {
    const overlappingRects: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100]),
      Clipper.makePath([50, 50, 150, 50, 150, 150, 50, 150])
    ];
    
    // Test EvenOdd fill rule
    const clipper1 = new Clipper64();
    clipper1.addSubject(overlappingRects);
    
    const solutionEvenOdd: Paths64 = [];
    const success1 = clipper1.execute(ClipType.Union, FillRule.EvenOdd, solutionEvenOdd);
    
    expect(success1).toBe(true);
    
    // Test NonZero fill rule
    const clipper2 = new Clipper64();
    clipper2.addSubject(overlappingRects);
    
    const solutionNonZero: Paths64 = [];
    const success2 = clipper2.execute(ClipType.Union, FillRule.NonZero, solutionNonZero);
    
    expect(success2).toBe(true);
    
    // Both should succeed (different fill rules should not cause failures)
    expect(solutionEvenOdd.length).toBeGreaterThan(0);
    expect(solutionNonZero.length).toBeGreaterThan(0);
  });
});
