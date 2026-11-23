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

    // the ring collapses to a single point, which is offset as a point
    // (a circle here, since the join type is round), as in C++
    expect(solution).toHaveLength(1);
    const r = 1.9988052480000003;
    expect(Clipper.areaD(solution[0])).toBeGreaterThan(Math.PI * r * r * 0.99);
    expect(Clipper.areaD(solution[0])).toBeLessThan(Math.PI * r * r);
  });

  // Comprehensive offset test using test data
  test('should handle offset test cases from Offsets.txt', () => {
    const testCases = TestDataParser.loadAllTestCases('Offsets.txt');
    expect(testCases.length).toBeGreaterThanOrEqual(2); // upstream runs the first two

    for (let i = 0; i < Math.min(testCases.length, 10); i++) {
      const testCase = testCases[i];
      
      const clipperOffset = new ClipperOffset();
      clipperOffset.addPaths(testCase.subjects, JoinType.Round, EndType.Polygon);
      
      const solution: Paths64 = [];
      clipperOffset.execute(1, solution);
      if (i < 2) expect(solution.length).toBeGreaterThan(0);

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

    // the reversed outer alone erodes to nothing as well
    solution = Clipper.inflatePaths([reversedSubject[0]], -50, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(0);
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

  // PolyClipping/Clipper2 issue #9
  test('empty paths are skipped and do not change the solution', () => {
    const line = Clipper.makePath([0,0, 10,0]);
    for (const et of [EndType.Joined, EndType.Butt, EndType.Square, EndType.Round]) {
      for (const jt of [JoinType.Square, JoinType.Bevel, JoinType.Round, JoinType.Miter]) {
        expect(Clipper.inflatePaths([[]], 10, jt, et)).toEqual([]);
        const expected = Clipper.inflatePaths([line], 10, jt, et);
        expect(Clipper.inflatePaths([[], line], 10, jt, et)).toEqual(expected);
        expect(Clipper.inflatePaths([line, []], 10, jt, et)).toEqual(expected);
      }
    }
  });

  test('a 2 point joined path does not change how the following paths are offset', () => {
    // 2 point joined paths are offset as open paths, but
    // the paths that follow them should still be joined
    const line = Clipper.makePath([0,0, 100,0]);
    const corner = Clipper.makePath([0,1000, 500,1000, 500,1500]);
    const expected =
      Clipper.areaPaths(Clipper.inflatePaths([line], 20, JoinType.Miter, EndType.Joined)) +
      Clipper.areaPaths(Clipper.inflatePaths([corner], 20, JoinType.Miter, EndType.Joined));
    expect(expected).toBe(73268.5); // as upstream
    expect(Clipper.areaPaths(Clipper.inflatePaths([line, corner], 20, JoinType.Miter, EndType.Joined))).toBe(expected);
    expect(Clipper.areaPaths(Clipper.inflatePaths([corner, line], 20, JoinType.Miter, EndType.Joined))).toBe(expected);
  });

  // PolyClipping/Clipper2 6c7d083
  test('a polygon group without a closed path does not change the sign of delta for later groups', () => {
    // a polygon group without a closed path is always inflated, but later groups must still shrink
    const line = Clipper.makePath([0,500, 100,500]);
    const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);
    const run = (paths: Paths64): number => {
      const co = new ClipperOffset();
      for (const p of paths) co.addPath(p, JoinType.Miter, EndType.Polygon);
      const solution: Paths64 = [];
      co.execute(-10, solution);
      return Clipper.areaPaths(solution);
    };
    expect(run([square])).toBe(6400);
    expect(run([line, square])).toBe(run([line]) + run([square]));
  });

  // PolyClipping/Clipper2 6c7d083
  test('a single point is rounded for its own delta, whatever path came before it', () => {
    const point = Clipper.makePath([0,0]);
    const line = Clipper.makePath([0,1000, 100,1000]);
    const run = (paths: Paths64): number => {
      const co = new ClipperOffset();
      co.addPaths(paths, JoinType.Round, EndType.Joined);
      co.deltaCallback = () => 20;
      const solution: Paths64 = [];
      co.execute(1, solution);
      return Clipper.areaPaths(solution);
    };
    expect(run([point, line])).toBe(run([line, point]));
    expect(run([point])).toBeGreaterThan(1200); // a circle of radius 20
  });

  // PolyClipping/Clipper2 6c7d083
  test('deltaCallback gets the normals of a single point path, not those of another path', () => {
    const co = new ClipperOffset();
    // the points come before and after a longer path so neither can see another path's normals
    co.addPaths([
      Clipper.makePath([0,0]),
      Clipper.makePath([100,0, 200,0, 200,100]),
      Clipper.makePath([500,500])
    ], JoinType.Square, EndType.Polygon);

    let normalsMatchPath = true;
    co.deltaCallback = (path, pathNorms) => {
      normalsMatchPath = normalsMatchPath && pathNorms.length === path.length;
      return 10;
    };
    const solution: Paths64 = [];
    co.execute(1, solution);
    expect(normalsMatchPath).toBe(true);
    expect(solution).toHaveLength(3);
  });

  // PolyClipping/Clipper2 ca30beb
  test('a group without a closed path in front of a clockwise polygon does not empty the solution', () => {
    const clockwiseSquare = Clipper.makePath([0,0, 0,100, 100,100, 100,0]);

    // an empty group
    let co = new ClipperOffset();
    co.addPaths([[]], JoinType.Miter, EndType.Polygon);
    co.addPath(clockwiseSquare, JoinType.Miter, EndType.Polygon);
    let solution: Paths64 = [];
    co.execute(10, solution);
    expect(Clipper.areaPaths(solution)).toBe(14400);

    // a group holding only a line
    co = new ClipperOffset();
    co.addPath(Clipper.makePath([0,500, 100,500]), JoinType.Miter, EndType.Polygon);
    co.addPath(clockwiseSquare, JoinType.Miter, EndType.Polygon);
    solution = [];
    co.execute(10, solution);
    const squarePart = solution.filter(p => p.every(pt => pt.y < 300));
    expect(squarePart).toHaveLength(1);
    expect(Clipper.area(squarePart[0])).toBe(14400);
  });

  // PolyClipping/Clipper2 ca30beb
  test('an empty path among open paths is ignored', () => {
    const line = Clipper.makePath([0,0, 10,0]);
    for (const et of [EndType.Joined, EndType.Butt, EndType.Square, EndType.Round]) {
      expect(Clipper.inflatePaths([[], line], 10, JoinType.Square, et))
        .toEqual(Clipper.inflatePaths([line], 10, JoinType.Square, et));
    }
  });

  test('a single point is offset in polygon and joined groups too', () => {
    // a single point used to be stripped as a duplicate of itself when the path was closed
    const point = Clipper.makePath([5,5]);
    for (const et of [EndType.Polygon, EndType.Joined, EndType.Butt, EndType.Square, EndType.Round]) {
      // the join type alone decides the shape, as in C++, so a round end with a miter join is a square
      const square = Clipper.inflatePaths([point], 10, JoinType.Miter, et);
      expect(square).toHaveLength(1);
      expect(Clipper.area(square[0])).toBe(400);

      const circle = Clipper.inflatePaths([point], 10, JoinType.Round, et);
      expect(circle).toHaveLength(1);
      expect(Clipper.area(circle[0])).toBeGreaterThan(300);
      expect(Clipper.area(circle[0])).toBeLessThan(315);
    }
    // a point cannot shrink
    expect(Clipper.inflatePaths([Clipper.makePath([0,0, 100,0, 100,100, 0,100]), point], -10,
      JoinType.Miter, EndType.Polygon)).toHaveLength(1);
  });

  test('offset coordinates round half away from zero, as in C++', () => {
    // every offset edge lands on an exact half here. Math.round would round each
    // negative half up, moving the whole result one unit toward the positive
    const square = Clipper.makePath([-341,-343, -231,-343, -231,-237, -341,-237]);
    expect(Clipper.inflatePaths([square], -11.5, JoinType.Miter, EndType.Polygon)).toEqual(
      [Clipper.makePath([-243,-332, -243,-249, -330,-249, -330,-332])]);
    expect(Clipper.inflatePaths([square], 11.5, JoinType.Miter, EndType.Polygon)).toEqual(
      [Clipper.makePath([-220,-226, -353,-226, -353,-355, -220,-355])]);

    // the same square mirrored into positive coordinates gives the mirrored result
    const mirrored = square.map(pt => ({ x: -pt.x, y: -pt.y, z: 0 }));
    const a = Clipper.inflatePaths([square], 11.5, JoinType.Miter, EndType.Polygon)[0];
    const b = Clipper.inflatePaths([mirrored], 11.5, JoinType.Miter, EndType.Polygon)[0];
    const key = (pts: { x: number; y: number }[]): string[] => pts.map(pt => `${pt.x},${pt.y}`).sort();
    expect(key(b)).toEqual(key(a.map(pt => ({ x: -pt.x, y: -pt.y }))));

    // scaling floating point paths rounds the same way
    const scaled = Clipper.scalePath64([{ x: -1.25, y: -0.25 }, { x: 1.25, y: 0.25 }, { x: -0.125, y: 0.125 }], 2);
    expect(scaled.map(pt => [pt.x, pt.y])).toEqual([[-3, -1], [3, 1], [0, 0]]);
    expect(Object.is(scaled[2].x, -0)).toBe(false);
  });

  // https://github.com/countertype/clipper2-ts/issues/44
  // Expected points are the output of C++ InflatePaths. Coordinates may differ by 1
  // because C++ rounds with nearbyint and this port rounds with Math.round.
  describe('square joins clamp to the cap segment (#44)', () => {
    const expectPathNear = (actual: Paths64, expected: number[]) => {
      expect(actual).toHaveLength(1);
      const exp = Clipper.makePath(expected);
      expect(actual[0]).toHaveLength(exp.length);
      for (let i = 0; i < exp.length; i++) {
        expect(Math.abs(actual[0][i].x - exp[i].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(actual[0][i].y - exp[i].y)).toBeLessThanOrEqual(1);
      }
    };

    const joined = Clipper.makePath([70000,85000, 678000,579000, 7000,40000]);

    test('joined path, square join', () => {
      expectPathNear(Clipper.inflatePaths([joined], 187080, JoinType.Square, EndType.Joined), [
        181100,-65546, 185718,-62026, 861161,486771, 941090,551042,
        705958,842090, 625584,776858, -251948,71955, -32255,-217943
      ]);
    });

    test('joined path, miter join past the miter limit', () => {
      expectPathNear(Clipper.inflatePaths([joined], 187080, JoinType.Miter, EndType.Joined), [
        183464,-63858, 861168,486777, 941090,551042, 705958,842090,
        625584,776858, -251948,71955, -32255,-217943
      ]);
    });

    test('narrow notch does not extend past delta', () => {
      const chevron = Clipper.makePath([19900,0, 100000,-1750, 20000,0, 100000,1750]);
      expectPathNear(Clipper.inflatePaths([chevron], 10000, JoinType.Miter, EndType.Polygon), [
        109865,-8036, 110216,-8029, 110041,0, 110216,8029, 109865,8036,
        109779,11966, 15150,9899, 10000,10000, 10000,9786, 9900,9784,
        9900,-9784, 10000,-9786, 10000,-10000, 15150,-9899, 109779,-11966
      ]);
    });

    test('acute corner far from the origin keeps precision', () => {
      const tri = Clipper.makePath([0,800000000, 1000000000,1000000000, -1,1200000000]);
      expectPathNear(Clipper.inflatePaths([tri], 100000, JoinType.Miter, EndType.Polygon), [
        1000100000,999918020, 1000100000,1000081980, -100001,1200121980, -100000,799878020
      ]);
    });
  });
});
