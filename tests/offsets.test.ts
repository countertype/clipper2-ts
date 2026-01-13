// Polygon Offset Tests
import { describe, test, expect } from 'vitest';
import { ClipperOffset, JoinType, EndType, Paths64, Clipper } from '../src';
import { TestDataParser } from './test-data-parser';

describe('Polygon Offset Tests', () => {
  // Basic offset operation test
  test('should handle empty path offset operation', () => {
    const solution: Paths64 = [];
    
    const clipperOffset = new ClipperOffset();
    clipperOffset.execute(10, solution);
    
    expect(solution).toHaveLength(0);
  });

  test('inflatePathsD should not throw on a zero-area ring (all points identical)', () => {
    const solution = Clipper.inflatePathsD(
      [
        [
          { x: 496.7798371623349, y: 253.05785493587112 },
          { x: 496.7798371623349, y: 253.05785493587112 },
          { x: 496.7798371623349, y: 253.05785493587112 },
          { x: 496.7798371623349, y: 253.05785493587112 },
        ],
      ],
      1.9988052480000003,
      JoinType.Round,
      EndType.Polygon,
      2,
      8,
      0
    );

    expect(solution).toHaveLength(0);
  });

  // Comprehensive offset test using test data
  test('should handle offset test cases from Offsets.txt', () => {
    const testCases = TestDataParser.loadAllTestCases('Offsets.txt');
    
    for (let i = 0; i < Math.min(testCases.length, 10); i++) {
      const testCase = testCases[i];
      
      const clipperOffset = new ClipperOffset();
      clipperOffset.addPaths(testCase.subjects, JoinType.Round, EndType.Polygon);
      
      const solution: Paths64 = [];
      clipperOffset.execute(1, solution);
      
      if (solution.length > 0) {
        // Check orientation consistency
        const totalArea = Clipper.areaPaths(solution);
        const isPositiveArea = totalArea > 0;
        
        let positiveCount = 0;
        let negativeCount = 0;
        
        for (const path of solution) {
          if (Clipper.isPositive(path)) {
            positiveCount++;
          } else {
            negativeCount++;
          }
        }
        
        // There should be exactly one exterior path
        if (isPositiveArea) {
          expect(positiveCount).toBe(1);
        } else {
          expect(negativeCount).toBe(1);
        }
      }
    }
  });

  // Offset precision and arc tolerance test
  test('should respect arc tolerance in rounded offsets', () => {
    const scale = 10;
    const delta = 10 * scale;
    const arcTolerance = 0.25 * scale;
    
    const subject: Paths64 = [
      Clipper.makePath([50, 50, 100, 50, 100, 150, 50, 150, 0, 100])
    ];
    
    // Scale up the subject for precision
    const scaledSubject: Paths64 = [];
    for (const path of subject) {
      const scaledPath = Clipper.scalePath(path, scale);
      scaledSubject.push(scaledPath);
    }
    
    const clipperOffset = new ClipperOffset();
    clipperOffset.arcTolerance = arcTolerance;
    clipperOffset.addPaths(scaledSubject, JoinType.Round, EndType.Polygon);
    
    const solution: Paths64 = [];
    clipperOffset.execute(delta, solution);
    
    expect(solution).toHaveLength(1);
    
    // Round joins should not create excessive vertices
    expect(solution[0].length).toBeLessThanOrEqual(21);
    
    // Check offset distance
    if (solution.length > 0 && scaledSubject.length > 0) {
      const originalPath = scaledSubject[0];
      const offsetPath = solution[0];
      
      let minDistance = Number.MAX_VALUE;
      let maxDistance = 0;
      
      for (const subjPt of originalPath) {
        for (let i = 0; i < offsetPath.length; i++) {
          const pt1 = offsetPath[i];
          const pt2 = offsetPath[(i + 1) % offsetPath.length];
          
          // Calculate midpoint of offset edge
          const midPt = {
            x: (pt1.x + pt2.x) / 2,
            y: (pt1.y + pt2.y) / 2
          };
          
          const distance = Math.sqrt(
            Math.pow(midPt.x - subjPt.x, 2) + Math.pow(midPt.y - subjPt.y, 2)
          );
          
          if (distance < delta * 2) {
            minDistance = Math.min(minDistance, distance);
            maxDistance = Math.max(maxDistance, distance);
          }
        }
      }
      
      // Check distance within tolerance
      expect(minDistance + 1).toBeGreaterThanOrEqual(delta - arcTolerance);
    }
  });

  // Negative offset (shrinking) test
  test('should handle negative offset operations correctly', () => {
    const subject: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100])
    ];
    
    // Large negative offset should eliminate the polygon
    let solution = Clipper.inflatePaths(subject, -50, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(0);
    
    // Add a hole and test positive offset
    const subjectWithHole: Paths64 = [
      Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100]),
      Clipper.makePath([40, 60, 60, 60, 60, 40, 40, 40])
    ];
    
    solution = Clipper.inflatePaths(subjectWithHole, 10, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(1);
    
    // Test with reversed path orientation
    const reversedSubject: Paths64 = [
      [...subjectWithHole[0]].reverse(),
      [...subjectWithHole[1]].reverse()
    ];
    
    solution = Clipper.inflatePaths(reversedSubject, 10, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(1);
  });

  // Join type validation test
  test('should produce correct results for different join types', () => {
    const subject: Paths64 = [
      Clipper.makePath([0, 0, 50, 0, 50, 50, 0, 50])
    ];
    
    const delta = 10;
    
    // Test Miter join
    let solution = Clipper.inflatePaths(subject, delta, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(1);
    const miterVertexCount = solution[0].length;
    
    // Test Round join (should have more vertices than miter)
    solution = Clipper.inflatePaths(subject, delta, JoinType.Round, EndType.Polygon);
    expect(solution).toHaveLength(1);
    expect(solution[0].length).toBeGreaterThanOrEqual(miterVertexCount);
    
    // Test Bevel join
    solution = Clipper.inflatePaths(subject, delta, JoinType.Bevel, EndType.Polygon);
    expect(solution).toHaveLength(1);
    
    // Test Square join
    solution = Clipper.inflatePaths(subject, delta, JoinType.Square, EndType.Polygon);
    expect(solution).toHaveLength(1);
  });

  // Open path offset test
  test('should handle open path offsetting correctly', () => {
    const openPath: Paths64 = [
      Clipper.makePath([0, 50, 20, 50, 40, 50, 60, 50, 80, 50, 100, 50])
    ];
    
    const delta = 10;
    
    // Test with Butt end type
    let solution = Clipper.inflatePaths(openPath, delta, JoinType.Round, EndType.Butt);
    expect(solution).toHaveLength(1);
    
    // Test with Round end type
    solution = Clipper.inflatePaths(openPath, delta, JoinType.Round, EndType.Round);
    expect(solution).toHaveLength(1);
    
    // Test with Square end type
    solution = Clipper.inflatePaths(openPath, delta, JoinType.Round, EndType.Square);
    expect(solution).toHaveLength(1);
    
    // All offset open paths should be closed polygons
    for (const path of solution) {
      expect(path.length).toBeGreaterThanOrEqual(4); // Minimum for a closed polygon
    }
  });
});
