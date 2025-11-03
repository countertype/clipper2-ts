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
    expect(sum).toEqual({ x: 40, y: 60 });
    
    const diff = Point64Utils.subtract(pt2, pt1);
    expect(diff).toEqual({ x: 20, y: 20 });
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
