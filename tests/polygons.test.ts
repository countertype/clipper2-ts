// Comprehensive Polygon Clipping Tests
import { describe, test, expect } from 'vitest';
import { Clipper64, ClipperD, ClipType, FillRule, Paths64, PathsD, Clipper, ClipperOffset, PolyTree64, InternalClipper } from '../src';
import { TestDataParser } from './test-data-parser';

describe('Comprehensive Polygon Clipping Tests', () => {
  // Utility function for tolerance checking
  function isInList(num: number, list: number[]): boolean {
    return list.includes(num);
  }

  // Load all test cases once
  const allTestCases = TestDataParser.loadAllTestCases('Polygons.txt');

  // Create individual test for each of the 195 polygon test cases (matches C# TestPolygons.cs)
  // This makes each test case show up individually in test output
  test.each(allTestCases.map((tc, idx) => ({ testNum: idx + 1, testCase: tc })))(
    'Polygon Test $testNum: $testCase.clipType/$testCase.fillRule',
    ({ testNum, testCase }) => {
      
      const c64 = new Clipper64();
      const subj: Paths64 = testCase.subjects;
      const subjOpen: Paths64 = testCase.subjectsOpen;
      const clip: Paths64 = testCase.clips;
      const solution: Paths64 = [];
      const solutionOpen: Paths64 = [];

      c64.addSubject(subj);
      c64.addOpenSubject(subjOpen);
      c64.addClip(clip);
      c64.execute(testCase.clipType, testCase.fillRule, solution, solutionOpen);
      

      const measuredCount = solution.length + solutionOpen.length; // open paths count too, as upstream
      const measuredArea = Math.trunc(Clipper.areaPaths(solution)); // (int64_t)Area(solution)
      const countDiff = testCase.expectedCount > 0 ? Math.abs(testCase.expectedCount - measuredCount) : 0;
      const areaDiff = testCase.expectedArea > 0 ? Math.abs(testCase.expectedArea - measuredArea) : 0;
      // as in C++, the area tolerance is a share of the measured area
      const areaDiffRatio = testCase.expectedArea <= 0 || measuredArea === 0 ? areaDiff : areaDiff / Math.abs(measuredArea);

      // The tolerances below are those of the C++ reference (CPP/Tests/TestPolygons.cpp in
      // PolyClipping/Clipper2). The stored counts and areas in Polygons.txt are not what the
      // reference itself produces for every test, so it needs them too. Do not loosen them
      // for this port: its output is identical to the reference on all but a few of these tests.
      if (testCase.expectedCount > 0) {
        if (isInList(testNum, [120, 121, 130, 138, 140, 148, 163, 165, 166, 167, 168, 172, 173, 175, 178, 180])) {
          expect(countDiff).toBeLessThanOrEqual(5);
        } else if (testNum === 126) {
          expect(countDiff).toBeLessThanOrEqual(3);
        } else if (isInList(testNum, [16, 27, 181])) {
          expect(countDiff).toBeLessThanOrEqual(2);
        } else if (testNum >= 120 && testNum <= 184) {
          expect(countDiff).toBeLessThanOrEqual(2);
        } else if (isInList(testNum, [23, 45, 87, 102, 111, 113, 191])) {
          expect(countDiff).toBeLessThanOrEqual(1);
        } else {
          if (countDiff !== 0) {
            console.log(`\nTest ${testNum} FAILED: expected ${testCase.expectedCount}, got ${measuredCount}, diff ${countDiff}`);
            console.log(`  ClipType: ${ClipType[testCase.clipType]}, FillRule: ${FillRule[testCase.fillRule]}`);
          }
          expect(countDiff).toBe(0);
        }
      }

      if (testCase.expectedArea > 0) {
        if (isInList(testNum, [19, 22, 23, 24])) {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.5);
        } else if (testNum === 193) {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.2);
        } else if (testNum === 63) {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.1);
        } else if (testNum === 16) {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.075);
        } else if (testNum === 26) {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.05);
        } else if (isInList(testNum, [15, 52, 53, 54, 59, 60, 64, 66, 117, 119, 184])) {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.02);
        } else {
          expect(areaDiffRatio).toBeLessThanOrEqual(0.01);
        }
      }
    }
  );
  
  // Summary test to verify overall pass rate
  test('Polygon test suite summary', () => {
    // Verify we have all 195 test cases
    expect(allTestCases.length).toBe(195);
  });

  // PolyTree consistency validation
  test('should produce consistent results between Paths64 and PolyTree64 output', () => {
    // every case, as upstream
    const testCases = TestDataParser.loadAllTestCases('Polygons.txt');
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const testNum = i + 1;
      
      // Execute with Paths64 output
      const clipperPaths = new Clipper64();
      clipperPaths.addSubject(testCase.subjects);
      clipperPaths.addOpenSubject(testCase.subjectsOpen);
      clipperPaths.addClip(testCase.clips);
      
      const solutionPaths: Paths64 = [];
      const solutionOpenPaths: Paths64 = [];
      
      const successPaths = clipperPaths.execute(
        testCase.clipType,
        testCase.fillRule,
        solutionPaths,
        solutionOpenPaths
      );
      
      // Execute with PolyTree64 output
      const clipperTree = new Clipper64();
      clipperTree.addSubject(testCase.subjects);
      clipperTree.addOpenSubject(testCase.subjectsOpen);
      clipperTree.addClip(testCase.clips);
      
      const solutionTree = new PolyTree64();
      const solutionOpenTree: Paths64 = [];
      
      const successTree = clipperTree.execute(
        testCase.clipType,
        testCase.fillRule,
        solutionTree,
        solutionOpenTree
      );
      
      expect(successPaths).toBe(successTree);
      
      if (successPaths && successTree) {
        const pathsFromTree = Clipper.polyTreeToPaths64(solutionTree);
        
        // Area comparison
        // (truncated, as the casts upstream do)
        const areaFromPaths = Math.trunc(Clipper.areaPaths(solutionPaths));
        const areaFromTree = Math.trunc(solutionTree.area());
        const areaFromTreePaths = Math.trunc(Clipper.areaPaths(pathsFromTree));
        
        if (areaFromTree !== areaFromPaths || areaFromTreePaths !== areaFromPaths) {
          console.log(`Test ${testNum}: area mismatch - paths: ${areaFromPaths}, tree: ${areaFromTree}, treePaths: ${areaFromTreePaths}`);
        }
        
        expect(areaFromTree).toBe(areaFromPaths);
        expect(areaFromTreePaths).toBe(areaFromPaths);
        
        // Count comparison
        const countFromPaths = solutionPaths.length + solutionOpenPaths.length;
        const countFromTree = pathsFromTree.length + solutionOpenTree.length;
        
        expect(countFromTree).toBe(countFromPaths);
      }
    }
  });

  // Specific geometric validation for known test cases
  test('should correctly handle basic geometric operations', () => {
    // Test case 1: Basic union operation
    const testCase1 = TestDataParser.loadTestCase('Polygons.txt', 1);
    expect(testCase1).not.toBeNull();
    expect(testCase1!.clipType).toBe(ClipType.Union);
    expect(testCase1!.fillRule).toBe(FillRule.NonZero);
    expect(testCase1!.expectedArea).toBe(9000);
    expect(testCase1!.expectedCount).toBe(1);
    
    const clipper1 = new Clipper64();
    clipper1.addSubject(testCase1!.subjects);
    
    const solution1: Paths64 = [];
    const success1 = clipper1.execute(ClipType.Union, FillRule.NonZero, solution1);
    
    expect(success1).toBe(true);
    expect(solution1.length).toBe(1);
    
    const area1 = Math.round(Clipper.areaPaths(solution1));
    expect(area1).toBe(9000); // Should be exact match for simple case
  });

  // Edge case validation for degenerate inputs
  test('should handle edge cases gracefully', () => {
    const clipper = new Clipper64();
    
    // Empty subjects
    const emptySolution: Paths64 = [];
    let success = clipper.execute(ClipType.Union, FillRule.NonZero, emptySolution);
    expect(success).toBe(true);
    expect(emptySolution.length).toBe(0);
    
    // Single point paths (should be filtered out)
    clipper.clear();
    clipper.addSubject([[{ x: 10, y: 10 }]]);
    
    const singlePointSolution: Paths64 = [];
    success = clipper.execute(ClipType.Union, FillRule.NonZero, singlePointSolution);
    expect(success).toBe(true);
    expect(singlePointSolution.length).toBe(0);
    
    // Two point paths (lines - should be filtered out for closed path operations)
    clipper.clear();
    clipper.addSubject([[{ x: 0, y: 0 }, { x: 10, y: 10 }]]);
    
    const twoPointSolution: Paths64 = [];
    success = clipper.execute(ClipType.Union, FillRule.NonZero, twoPointSolution);
    expect(success).toBe(true);
    expect(twoPointSolution.length).toBe(0);

    // the same line with its closing point repeated is still two points, and must not
    // add vertices where it crosses another path
    const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);
    const expected = Clipper.union([square], FillRule.NonZero);
    const line = Clipper.makePath([-50,50, 150,60]);
    expect(Clipper.union([square, line], FillRule.NonZero)).toEqual(expected);
    expect(Clipper.union([square, [...line, line[0]]], FillRule.NonZero)).toEqual(expected);
  });

  // Open path specific validation
  test('should correctly clip open paths', () => {
    // Use a test case that specifically includes open subjects
    const testCases = TestDataParser.loadAllTestCases('Lines.txt');
    const openPathTests = testCases.filter(tc => tc.subjectsOpen.length > 0);
    
    expect(openPathTests.length).toBeGreaterThan(0);
    
    for (const testCase of openPathTests.slice(0, 10)) { // Test first 10 for performance
      const clipper = new Clipper64();
      clipper.addSubject(testCase.subjects);
      clipper.addOpenSubject(testCase.subjectsOpen);
      clipper.addClip(testCase.clips);
      
      const solution: Paths64 = [];
      const solutionOpen: Paths64 = [];
      
      const success = clipper.execute(
        testCase.clipType,
        testCase.fillRule,
        solution,
        solutionOpen
      );
      
      expect(success).toBe(true);
      
      // Open paths should produce open solutions when clipped
      for (const openPath of solutionOpen) {
        expect(openPath.length).toBeGreaterThanOrEqual(2);
        
        // Open paths should not be closed (first point != last point)
        if (openPath.length > 2) {
          const first = openPath[0];
          const last = openPath[openPath.length - 1];
          expect(first.x !== last.x || first.y !== last.y).toBe(true);
        }
      }
    }
  });

  test('a closed path with only two distinct points is ignored, as in C++', () => {
    const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);
    // the line crosses the square; it used to be swept as a polygon and left
    // extra vertices on the square, or added area between other paths
    const line = Clipper.makePath([-50,50, 150,60]);
    const solution = Clipper.union([square, line], FillRule.NonZero);
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(4);
    expect(Clipper.areaPaths(solution)).toBe(10000);

    const paths: Paths64 = [
      Clipper.makePath([-1,165, -634,-1693, -1525,1702, -85,158]),
      Clipper.makePath([685,-1982, 1794,-1467, 1668,-722, -1864,1681, -1001,1122, 553,-730]),
      Clipper.makePath([-689,1065, -419,-1055])
    ];
    expect(Clipper.areaPaths(Clipper.union(paths, FillRule.Positive))).toBe(2072202.5);
    expect(Clipper.areaPaths(Clipper.union(paths.slice(0, 2), FillRule.Positive))).toBe(2072202.5);
  });

  test('an island that touches its hole at every vertex is nested inside it', () => {
    // the small triangle shares all three vertices with the larger hole and
    // lies inside it. C++ makes both holes of the outer, which leaves a hole
    // with positive area; the midpoints of the triangle's edges are inside
    // the larger hole, so here it is an island of that hole
    const subject: Paths64 = [
      Clipper.makePath([-6,-2, -3,-8, -10,11, -9,4]),
      Clipper.makePath([-10,8, 4,4, -15,4, -12,-13, 9,-15, 6,10, 4,-10]),
      Clipper.makePath([6,-4, 0,0, 7,7, -13,11])
    ];
    const tree = new PolyTree64();
    Clipper.booleanOpWithPolyTree(ClipType.Xor, subject, null, tree, FillRule.NonZero);
    expect(tree.count).toBe(1);
    const outer = tree.child(0);
    expect(outer.count).toBe(1);
    const hole = outer.child(0);
    expect(hole.isHole).toBe(true);
    expect(hole.count).toBe(1);
    const island = hole.child(0);
    expect(island.isHole).toBe(false);
    expect(island.polygon!.map(pt => [pt.x, pt.y])).toEqual([[-4, 4], [-9, 8], [-7, 4]]);
    expect(Clipper.area(island.polygon!)).toBeGreaterThan(0);
  });

  test('midpoints are taken by integer division, as in C++', () => {
    expect(Clipper.midPoint({ x: 1, y: 2 }, { x: 4, y: 5 })).toEqual({ x: 2, y: 3 });
    expect(Clipper.midPoint({ x: -1, y: -2 }, { x: -4, y: -5 })).toEqual({ x: -2, y: -3 });
  });

  test('ellipse truncates its default number of steps, as in C++', () => {
    // pi * sqrt((1.5 + 8) / 2) is 6.85, so 6 vertices
    expect(Clipper.ellipse({ x: -13, y: 8 }, 1.5, 8).map(pt => [pt.x, pt.y]))
      .toEqual([[-12, 8], [-12, 15], [-14, 15], [-15, 8], [-14, 1], [-12, 1]]);
    expect(Clipper.ellipse({ x: 0, y: 0 }, 100)).toHaveLength(31);
  });

  test('ellipse has at least 3 vertices, however small its radius', () => {
    // pi * sqrt(0.5) is 2.2, and C++ returns the 2 vertex line that gives
    for (const radius of [0.05, 0.5, 0.9]) {
      const circle = Clipper.ellipseD({ x: 0, y: 0 }, radius);
      expect(circle).toHaveLength(3);
      expect(Clipper.areaD(circle)).toBeGreaterThan(0);
    }
    expect(Clipper.ellipse({ x: 0, y: 0 }, 0.9)).toHaveLength(3);
    expect(ClipperOffset.ellipse({ x: 0, y: 0 }, 0.9)).toHaveLength(3);
  });

  // PolyClipping/Clipper2 32b0a72
  test('a clipper is left clean when an exception escapes execute', () => {
    const subject: Paths64 = [
      Clipper.makePath([0,0, 100,0, 100,100, 0,100]),
      Clipper.makePath([50,50, 150,50, 150,150, 50,150])
    ];
    const clip: Paths64 = [Clipper.makePath([20,-10, 80,-10, 80,200, 20,200])];

    const fresh = new Clipper64();
    fresh.addSubject(subject);
    fresh.addClip(clip);
    const expected: Paths64 = [];
    fresh.execute(ClipType.Xor, FillRule.NonZero, expected);

    const clipper = new Clipper64();
    clipper.addSubject(subject);
    clipper.addClip(clip);
    let calls = 0;
    clipper.zCallback = () => {
      if (++calls === 3) throw new Error('Z callback');
    };
    const solution: Paths64 = [];
    expect(() => clipper.execute(ClipType.Xor, FillRule.NonZero, solution)).toThrow('Z callback');
    expect(calls).toBe(3);

    clipper.zCallback = undefined;
    expect(clipper.execute(ClipType.Xor, FillRule.NonZero, solution)).toBe(true);
    expect(solution).toEqual(expected);

    // the same for PolyTree output, and for the floating point clipper
    const tree = new PolyTree64();
    calls = 0;
    clipper.zCallback = () => { if (++calls === 3) throw new Error('Z callback'); };
    expect(() => clipper.execute(ClipType.Xor, FillRule.NonZero, tree)).toThrow('Z callback');
    clipper.zCallback = undefined;
    clipper.execute(ClipType.Xor, FillRule.NonZero, solution);
    expect(solution).toEqual(expected);

    const clipperD = new ClipperD(2);
    clipperD.addSubjectPaths(subject);
    clipperD.addClipPaths(clip);
    clipperD.zCallback = () => { throw new Error('Z callback D'); };
    const solutionD: PathsD = [];
    expect(() => clipperD.execute(ClipType.Xor, FillRule.NonZero, solutionD)).toThrow('Z callback D');
    clipperD.zCallback = undefined;
    expect(clipperD.execute(ClipType.Xor, FillRule.NonZero, solutionD)).toBe(true);
    expect(solutionD.map(p => p.map(pt => ({ x: pt.x, y: pt.y })))).toEqual(expected.map(p => p.map(pt => ({ x: pt.x, y: pt.y }))));
  });

  // PolyClipping/Clipper2 0812644
  test('executing again on the same clipper gives the same results as a fresh one', () => {
    const testCases = TestDataParser.loadAllTestCases('Polygons.txt').slice(0, 100);

    for (let n = 0; n < testCases.length; n++) {
      const tc = testCases[n];
      const add = (c: Clipper64): Clipper64 => {
        c.addSubject(tc.subjects);
        c.addOpenSubject(tc.subjectsOpen);
        c.addClip(tc.clips);
        return c;
      };
      const reused = add(new Clipper64());

      for (const clipType of [ClipType.Intersection, ClipType.Union, ClipType.Difference, ClipType.Xor]) {
        const closed: Paths64 = [], open: Paths64 = [], freshClosed: Paths64 = [], freshOpen: Paths64 = [];
        reused.execute(clipType, tc.fillRule, closed, open);
        add(new Clipper64()).execute(clipType, tc.fillRule, freshClosed, freshOpen);
        if (JSON.stringify(closed) !== JSON.stringify(freshClosed)) expect(closed, `test ${n + 1}`).toEqual(freshClosed);
        if (JSON.stringify(open) !== JSON.stringify(freshOpen)) expect(open, `test ${n + 1}`).toEqual(freshOpen);

        const tree = new PolyTree64(), freshTree = new PolyTree64();
        const treeOpen: Paths64 = [], freshTreeOpen: Paths64 = [];
        reused.execute(clipType, tc.fillRule, tree, treeOpen);
        add(new Clipper64()).execute(clipType, tc.fillRule, freshTree, freshTreeOpen);
        const a = JSON.stringify(Clipper.polyTreeToPaths64(tree)), b = JSON.stringify(Clipper.polyTreeToPaths64(freshTree));
        if (a !== b) expect(a, `test ${n + 1}`).toBe(b);
        if (JSON.stringify(treeOpen) !== JSON.stringify(freshTreeOpen)) expect(treeOpen, `test ${n + 1}`).toEqual(freshTreeOpen);
      }
    }
  });

  test('intersection points are never -0', () => {
    const solution = Clipper.intersect(
      [Clipper.makePath([-10,-3, 10,4, 10,-10])],
      [Clipper.makePath([-10,3, 10,-4, 10,10])], FillRule.NonZero);
    for (const path of solution) {
      for (const pt of path) {
        expect(Object.is(pt.x, -0)).toBe(false);
        expect(Object.is(pt.y, -0)).toBe(false);
      }
    }
  });
});

// C++ resets before returning for NoClip, so the call succeeds
describe('execute with ClipType.NoClip', () => {
  const square = Clipper.makePath([0,0, 10,0, 10,10, 0,10]);

  test('Clipper64 returns true and no paths', () => {
    const c = new Clipper64();
    c.addSubject([square]);
    const solution: Paths64 = [];
    expect(c.execute(ClipType.NoClip, FillRule.NonZero, solution)).toBe(true);
    expect(solution).toEqual([]);
    expect(c.execute(ClipType.NoClip, FillRule.NonZero, new PolyTree64())).toBe(true);
  });

  test('ClipperD returns true and no paths', () => {
    const c = new ClipperD(2);
    c.addSubjectPaths([square]);
    const solution: PathsD = [];
    expect(c.execute(ClipType.NoClip, FillRule.NonZero, solution)).toBe(true);
    expect(solution).toEqual([]);
  });
});

// Ported from PolyClipping/Clipper2 CPP/Tests/TestPolygons.cpp
describe('polygon tests ported from upstream TestPolygons.cpp', () => {
  test('TestIntersectInt32SpanBeyondIntMax', () => {
    // (upstream checks 32-bit points, whose spans overflow int; here the same points must simply meet at zero)
    const ip = InternalClipper.getLineIntersectPt(
      { x: -2000000000, y: -1000000000 }, { x: 2000000000, y: 1000000000 },
      { x: -1000000000, y: 2000000000 }, { x: 1000000000, y: -2000000000 });
    expect(ip).not.toBeNull();
    expect([ip!.x, ip!.y]).toEqual([0, 0]);
  });

  test('TestHorzSpikes (#720)', () => {
    const paths: Paths64 = [
      Clipper.makePath([1600,0, 1600,100, 2050,100, 2050,300, 450,300, 450,0]),
      Clipper.makePath([1800,200, 1800,100, 1600,100, 2000,100, 2000,200])
    ];
    const c = new Clipper64();
    c.addSubject(paths);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
    expect(solution.length).toBeGreaterThanOrEqual(1);
  });

  test('TestCollinearOnMacOs (#777)', () => {
    const subject: Paths64 = [
      Clipper.makePath([0,-453054451, 0,-433253797, -455550000,0]),
      Clipper.makePath([0,-433253797, 0,0, -455550000,0])
    ];
    const clipper = new Clipper64();
    clipper.preserveCollinear = false;
    clipper.addSubject(subject);
    const solution: Paths64 = [];
    clipper.execute(ClipType.Union, FillRule.NonZero, solution);
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(3);
    expect(Clipper.isPositive(solution[0])).toBe(Clipper.isPositive(subject[0]));
  });

  test('TestIntersectPointIsNotFused', () => {
    // both exact intersections have a coordinate of -100.5, and the tie rounds to even
    let ip = InternalClipper.getLineIntersectPt(
      { x: -207, y: -383 }, { x: 350, y: 194 }, { x: 347, y: 193 }, { x: -206, y: -384 });
    expect(ip).not.toBeNull();
    expect([ip!.x, ip!.y]).toEqual([66, -100]);
    ip = InternalClipper.getLineIntersectPt(
      { x: -383, y: -207 }, { x: 194, y: 350 }, { x: 193, y: 347 }, { x: -384, y: -206 });
    expect(ip).not.toBeNull();
    expect([ip!.x, ip!.y]).toEqual([-100, 66]);
  });
});

describe('sweep details that differed from upstream', () => {
  const mk = (paths: number[][][]): Paths64 => paths.map(p => p.map(([x, y]) => ({ x, y })));

  test('a left bound is placed after a joined pair, even one out of curX order', () => {
    // the search for its place starts from the first edge, as in C++
    const c = new Clipper64();
    c.addSubject(mk([[[0,2],[3,0],[2,1],[0,0],[2,0],[2,1],[1,1]]]));
    c.addClip(mk([
      [[0,2],[3,3],[0,2],[0,3],[2,0],[2,0]],
      [[1,2],[3,1],[1,0],[2,2],[1,2],[0,0],[1,2],[0,2]]
    ]));
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.EvenOdd, solution);
    expect(solution.map(p => p.map(q => [q.x, q.y])))
      .toEqual([[[2,0],[2,1],[3,1],[2,2],[2,1],[0,2],[1,1],[0,0]]]);
  });

  test('a clipper run inside a Z callback does not disturb the one that called it', () => {
    // the outer clipper has open paths and the inner one has none
    const run = (runInner: boolean): [boolean, Paths64, Paths64] => {
      const outer = new Clipper64();
      outer.zCallback = () => {
        if (!runInner) return;
        const inner = new Clipper64();
        inner.addSubject(mk([[[0,0],[5,0],[5,5],[0,5]]]));
        inner.execute(ClipType.Union, FillRule.NonZero, []);
      };
      outer.addOpenSubject(mk([[[-5,5],[15,5]], [[-5,2],[15,8]]]));
      outer.addSubject(mk([[[1,1],[9,1],[9,9],[1,9]]]));
      outer.addClip(mk([[[0,0],[10,0],[10,10],[0,10]], [[3,3],[12,3],[12,7],[3,7]]]));
      const closed: Paths64 = [], open: Paths64 = [];
      const ok = outer.execute(ClipType.Intersection, FillRule.NonZero, closed, open);
      return [ok, closed, open];
    };
    const plain = run(false);
    expect(plain[0]).toBe(true);
    expect(plain[2].length).toBeGreaterThan(0);
    expect(run(true)).toEqual(plain);
  });

  test('stripDuplicates keeps the one point of a closed path of repeats, as in C++', () => {
    expect(Clipper.stripDuplicates(mk([[[3,3],[3,3],[3,3]]])[0], true)).toEqual([{ x: 3, y: 3 }]);
    expect(Clipper.stripDuplicates(mk([[[3,3],[4,4],[3,3]]])[0], true)).toEqual([{ x: 3, y: 3 }, { x: 4, y: 4 }]);
  });
});

describe('degenerate input to the clipper', () => {
  test('getBounds skips a path of one point, or of one point repeated', () => {
    const c = new Clipper64();
    c.addSubject([[{ x: 1, y: 1 }], [{ x: 7, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 7 }]]);
    expect(c.getBounds()).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    c.addSubject([Clipper.makePath([2,3, 12,3, 12,9])]);
    expect(c.getBounds()).toEqual({ left: 2, top: 3, right: 12, bottom: 9 });
  });

  test('midpoints are never negative zero', () => {
    const isNegativeZero = (v: number): boolean => Object.is(v, -0);
    const pt = Clipper.midPoint({ x: -1, y: -1 }, { x: 0, y: 0 });
    expect(isNegativeZero(pt.x) || isNegativeZero(pt.y)).toBe(false);
    expect(pt).toEqual({ x: 0, y: 0 });
  });
});
