// PolyTree Hierarchical Structure Tests
import { describe, test, expect } from 'vitest';
import { Clipper64, ClipType, FillRule, Paths64, Clipper, PolyTree64, PolyPath64, Point64, PointInPolygonResult } from '../src';
import { TestDataParser } from './test-data-parser';

describe('PolyTree Hierarchical Structure Tests', () => {
  // Validates that PolyTree contains child polygons correctly
  function polyPathContainsPoint(pp: PolyPath64, pt: Point64): { result: boolean; counter: number } {
    let counter = 0;
    
    if (pp.polygon && pp.polygon.length > 0) {
      const pointInPoly = Clipper.pointInPolygon(pt, pp.polygon);
      if (pointInPoly !== PointInPolygonResult.IsOutside) {
        if (pp.isHole) {
          counter--;
        } else {
          counter++;
        }
      }
    }
    
    for (let i = 0; i < pp.count; i++) {
      const child = pp.child(i);
      const childResult = polyPathContainsPoint(child, pt);
      counter += childResult.counter;
    }
    
    return { result: counter !== 0, counter };
  }

  // Validates point containment within PolyTree structure
  function polytreeContainsPoint(pp: PolyTree64, pt: Point64): boolean {
    let counter = 0;
    
    for (let i = 0; i < pp.count; i++) {
      const child = pp.child(i);
      const result = polyPathContainsPoint(child, pt);
      counter += result.counter;
    }
    
    expect(counter).toBeGreaterThanOrEqual(0); // Point can't be inside more holes than outers
    return counter !== 0;
  }

  // Validates that parent polygons fully contain their children
  function polyPathFullyContainsChildren(pp: PolyPath64): boolean {
    for (let i = 0; i < pp.count; i++) {
      const child = pp.child(i);
      
      if (!child.polygon) continue;
      
      // Check if all vertices of child are inside parent
      for (const pt of child.polygon) {
        if (!pp.polygon) return false;
        
        const result = Clipper.pointInPolygon(pt, pp.polygon);
        if (result === PointInPolygonResult.IsOutside) {
          return false;
        }
      }
      
      // Recursively check nested children
      if (child.count > 0 && !polyPathFullyContainsChildren(child)) {
        return false;
      }
    }
    
    return true;
  }

  // Top-level PolyTree containment validation
  function checkPolytreeFullyContainsChildren(polytree: PolyTree64): boolean {
    for (let i = 0; i < polytree.count; i++) {
      const child = polytree.child(i);
      if (child.count > 0 && !polyPathFullyContainsChildren(child)) {
        return false;
      }
    }
    return true;
  }

  // The six tests below are ported from PolyClipping/Clipper2 CPP/Tests/TestPolytreeHoles.cpp
  const runTree = (ct: ClipType, fr: FillRule, subject: Paths64, clip: Paths64 = []): PolyTree64 => {
    const c = new Clipper64();
    c.addSubject(subject);
    c.addClip(clip);
    const tree = new PolyTree64();
    c.execute(ct, fr, tree);
    return tree;
  };

  test('TestPolytreeHoles1', () => {
    const testCase = TestDataParser.loadTestCase('PolytreeHoleOwner.txt', 1);
    expect(testCase).not.toBeNull();
    const c = new Clipper64();
    c.addSubject(testCase!.subjects);
    c.addOpenSubject(testCase!.subjectsOpen);
    c.addClip(testCase!.clips);
    const solution = new PolyTree64();
    c.execute(testCase!.clipType, testCase!.fillRule, solution, []);
    expect(checkPolytreeFullyContainsChildren(solution)).toBe(true);
  });

  test('TestPolytreeHoles3', () => {
    const subject = [Clipper.makePath([1072,501, 1072,501, 1072,539, 1072,539, 1072,539, 870,539,
      870,539, 870,539, 870,520, 894,520, 898,524, 911,524, 915,520, 915,520, 936,520,
      940,524, 953,524, 957,520, 957,520, 978,520, 983,524, 995,524, 1000,520, 1021,520,
      1025,524, 1038,524, 1042,520, 1038,516, 1025,516, 1021,520, 1000,520, 995,516,
      983,516, 978,520, 957,520, 953,516, 940,516, 936,520, 915,520, 911,516, 898,516,
      894,520, 870,520, 870,516, 870,501, 870,501, 870,501, 1072,501])];
    const clip = [Clipper.makePath([870,501, 971,501, 971,539, 870,539])];
    const solution = runTree(ClipType.Intersection, FillRule.NonZero, subject, clip);
    expect(solution.count).toBe(1);
    expect(solution.child(0).count).toBe(2);
  });

  test('TestPolytreeHoles4 (#618)', () => {
    const subject = [
      Clipper.makePath([50,500, 50,300, 100,300, 100,350, 150,350,
        150,250, 200,250, 200,450, 350,450, 350,200, 400,200, 400,225, 450,225,
        450,175, 400,175, 400,200, 350,200, 350,175, 200,175, 200,250, 150,250,
        150,200, 100,200, 100,300, 50,300, 50,125, 500,125, 500,500]),
      Clipper.makePath([250,425, 250,375, 300,375, 300,425])
    ];
    // a polygon with 3 holes, one of which holds a nested polygon
    const solution = runTree(ClipType.Union, FillRule.NonZero, subject);
    expect(solution.count).toBe(1);
    expect(solution.child(0).count).toBe(3);
  });

  test('TestPolytreeHoles5', () => {
    const subject = [Clipper.makePath([0,30, 400,30, 400,100, 0,100])];
    const clip = [
      Clipper.makePath([20,30, 30,30, 30,150, 20,150]),
      Clipper.makePath([200,0, 300,0, 300,30, 280,30, 280,20, 220,20, 220,30, 200,30]),
      Clipper.makePath([200,50, 300,50, 300,80, 200,80])
    ];
    // 3 polygons, the last with 2 holes
    const tree = runTree(ClipType.Xor, FillRule.NonZero, subject, clip);
    expect(tree.count).toBe(3);
    expect(tree.child(2).count).toBe(2);
  });

  test('TestPolytreeHoles6 (#618)', () => {
    const subject = [
      Clipper.makePath([150,50, 200,50, 200,100, 150,100]),
      Clipper.makePath([125,100, 150,100, 150,150, 125,150]),
      Clipper.makePath([225,50, 300,50, 300,80, 225,80]),
      Clipper.makePath([225,100, 300,100, 300,150, 275,150, 275,175, 260,175,
        260,250, 235,250, 235,300, 275,300, 275,275, 300,275, 300,350, 225,350]),
      Clipper.makePath([300,150, 350,150, 350,175, 300,175])
    ];
    const clip = [
      Clipper.makePath([0,0, 400,0, 400,50, 0,50]),
      Clipper.makePath([0,100, 400,100, 400,150, 0,150]),
      Clipper.makePath([260,175, 325,175, 325,275, 260,275])
    ];
    // 3 polygons, the last with 1 hole
    const tree = runTree(ClipType.Xor, FillRule.NonZero, subject, clip);
    expect(tree.count).toBe(3);
    expect(tree.child(2).count).toBe(1);
  });

  test('TestPolytreeHoles7 (#618)', () => {
    const subject = [
      Clipper.makePath([0,0, 100000,0, 100000,100000, 200000,100000,
        200000,0, 300000,0, 300000,200000, 0,200000]),
      Clipper.makePath([0,0, 0,-100000, 250000,-100000, 250000,0])
    ];
    const polytree = runTree(ClipType.Union, FillRule.NonZero, subject);
    expect(polytree.count).toBe(1);
    expect(polytree.child(0).count).toBe(1);
  });

  // PolyTree hole ownership test (TestPolytree2 equivalent)
  test('should correctly establish hole ownership relationships', () => {
    const testCase = TestDataParser.loadTestCase('PolytreeHoleOwner2.txt', 1);
    expect(testCase).not.toBeNull();

    // as upstream: the points outside are outside every subject, and the points
    // inside are inside exactly one (which rules out subject holes)
    const countSubjectsAt = (pt: Point64): number => testCase!.subjects.filter(
      path => Clipper.pointInPolygon(pt, path) !== PointInPolygonResult.IsOutside).length;
    for (const pt of [[21887, 10420], [21726, 10825], [21662, 10845], [21617, 10890]]) {
      expect(countSubjectsAt({ x: pt[0], y: pt[1] })).toBe(0);
    }
    for (const pt of [[21887, 10430], [21843, 10520], [21810, 10686], [21900, 10461]]) {
      expect(countSubjectsAt({ x: pt[0], y: pt[1] })).toBe(1);
    }
    expect(testCase!.fillRule).toBe(FillRule.Negative); // upstream passes Negative itself

    const clipper = new Clipper64();
    clipper.addSubject(testCase!.subjects);
    clipper.addOpenSubject(testCase!.subjectsOpen);
    clipper.addClip(testCase!.clips);
    
    const solutionTree = new PolyTree64();
    const solutionOpen: Paths64 = [];
    
    const success = clipper.execute(
      testCase!.clipType,
      testCase!.fillRule,
      solutionTree,
      solutionOpen
    );
    
    expect(success).toBe(true);
    
    // Validate expected geometric properties
    const solutionPaths = Clipper.polyTreeToPaths64(solutionTree);
    const area1 = Math.abs(Clipper.areaPaths(solutionPaths));
    const area2 = Math.abs(solutionTree.area());
    
    expect(area1).toBeGreaterThan(330000);
    expect(Math.abs(area1 - area2)).toBeLessThan(0.0001);
    // as upstream: smaller than the subjects' area (negated for the fill rule), but not by much
    const subjectArea = -Clipper.areaPaths(testCase!.subjects);
    expect(solutionPaths.length).toBeGreaterThan(0);
    expect(Clipper.areaPaths(solutionPaths)).toBeLessThan(subjectArea);
    expect(Clipper.areaPaths(solutionPaths)).toBeGreaterThan(subjectArea * 0.92);
    expect(Math.abs(solutionTree.area() - Clipper.areaPaths(solutionPaths))).toBeLessThan(0.0001);
    
    // Validate hierarchical containment
    expect(checkPolytreeFullyContainsChildren(solutionTree)).toBe(true);
    
    // Test specific points
    const pointsOfInterestOutside: Point64[] = [
      { x: 21887, y: 10420 },
      { x: 21726, y: 10825 },
      { x: 21662, y: 10845 },
      { x: 21617, y: 10890 }
    ];
    
    const pointsOfInterestInside: Point64[] = [
      { x: 21887, y: 10430 },
      { x: 21843, y: 10520 },
      { x: 21810, y: 10686 },
      { x: 21900, y: 10461 }
    ];
    
    // Validate that outside points are correctly identified
    for (const pt of pointsOfInterestOutside) {
      expect(polytreeContainsPoint(solutionTree, pt)).toBe(false);
    }
    
    // Validate that inside points are correctly identified
    for (const pt of pointsOfInterestInside) {
      expect(polytreeContainsPoint(solutionTree, pt)).toBe(true);
    }
  });

  // Complex nesting validation (TestPolytree3 equivalent)
  test('should handle complex polygon nesting correctly', () => {
    const subjects: Paths64 = [];
    
    subjects.push(Clipper.makePath([1588700, -8717600, 1616200, -8474800, 1588700, -8474800]));
    
    subjects.push(Clipper.makePath([
      13583800, -15601600, 13582800, -15508500, 13555300, -15508500, 
      13555500, -15182200, 13010900, -15185400
    ]));
    
    subjects.push(Clipper.makePath([956700, -3092300, 1152600, 3147400, 25600, 3151700]));
    
    // Complete the polygon
    subjects.push(Clipper.makePath([
      22575900, -16604000, 31286800, -12171900,
      31110200, 4882800, 30996200, 4826300, 30414400, 5447400, 30260000, 5391500,
      29662200, 5805400, 28844500, 5337900, 28435000, 5789300, 27721400, 5026400,
      22876300, 5034300, 21977700, 4414900, 21148000, 4654700, 20917600, 4653400,
      19334300, 12411000, -2591700, 12177200, 53200, 3151100, -2564300, 12149800,
      7819400, 4692400, 10116000, 5228600, 6975500, 3120100, 7379700, 3124700,
      11037900, 596200, 12257000, 2587800, 12257000, 596200, 15227300, 2352700,
      18444400, 1112100, 19961100, 5549400, 20173200, 5078600, 20330000, 5079300,
      20970200, 4544300, 20989600, 4563700, 19465500, 1112100, 21611600, 4182100,
      22925100, 1112200, 22952700, 1637200, 23059000, 1112200, 24908100, 4181200,
      27070100, 3800600, 27238000, 3800700, 28582200, 520300, 29367800, 1050100,
      29291400, 179400, 29133700, 360700, 29056700, 312600, 29121900, 332500,
      29269900, 162300, 28941400, 213100, 27491300, -3041500, 27588700, -2997800,
      22104900, -16142800, 13010900, -15603000, 13555500, -15182200,
      13555300, -15508500, 13582800, -15508500, 13583100, -15154700,
      1588700, -8822800, 1588700, -8379900, 1588700, -8474800, 1616200, -8474800,
      1003900, -630100, 1253300, -12284500, 12983400, -16239900
    ]));
    
    subjects.push(Clipper.makePath([198200, 12149800, 1010600, 12149800, 1011500, 11859600]));
    subjects.push(Clipper.makePath([21996700, -7432000, 22096700, -7432000, 22096700, -7332000]));
    
    const solutionTree = new PolyTree64();
    
    const clipper = new Clipper64();
    clipper.addSubject(subjects);
    
    const success = clipper.execute(ClipType.Union, FillRule.NonZero, solutionTree);
    expect(success).toBe(true);
    
    // Validate the expected nesting structure: 1 outer with 2 holes, one hole has 1 nested polygon
    expect(solutionTree.count).toBe(1);
    expect(solutionTree.child(0).count).toBe(2);
    expect(solutionTree.child(0).child(1).count).toBe(1);
  });

  // PolyTree area calculation validation
  test('should calculate PolyTree areas correctly', () => {
    // Create nested rectangles: outer + hole + nested inner
    const outer = Clipper.makePath([0, 0, 100, 0, 100, 100, 0, 100]);
    const hole = Clipper.makePath([20, 20, 80, 20, 80, 80, 20, 80]);
    const inner = Clipper.makePath([30, 30, 70, 30, 70, 70, 30, 70]);
    
    const subjects: Paths64 = [outer, hole, inner];
    
    const clipper = new Clipper64();
    clipper.addSubject(subjects);
    
    const solutionTree = new PolyTree64();
    const success = clipper.execute(ClipType.Union, FillRule.EvenOdd, solutionTree);
    
    expect(success).toBe(true);
    
    // Calculate expected area: outer - hole + inner
    const expectedArea = 10000 - 3600 + 1600; // 8000
    const calculatedArea = Math.abs(solutionTree.area());
    
    expect(Math.abs(calculatedArea - expectedArea)).toBeLessThan(100); // Small tolerance for rounding
  });

  // Emptied OutRecs whose splits form a cycle used to recurse forever in
  // checkSplitOwner (PolyClipping/Clipper2 f97d65db, upstream #1084)
  describe('cyclic splits', () => {
    function xorToTree(subject: Paths64, clip: Paths64): PolyTree64 {
      const clipper = new Clipper64();
      clipper.preserveCollinear = false;
      if (subject.length > 0) clipper.addSubject(subject);
      clipper.addClip(clip);
      const tree = new PolyTree64();
      const open: Paths64 = [];
      expect(clipper.execute(ClipType.Xor, FillRule.EvenOdd, tree, open)).toBe(true);
      return tree;
    }

    test('13 vertex path', () => {
      const clip = [Clipper.makePath([3,0, 3,5, 0,3, 5,3, 0,5, 5,3, 0,3, 0,0, 0,3, 5,3, 0,0, 3,3, 2,3])];
      xorToTree([], clip);
    });

    test('57 vertex subject and clip', () => {
      const subject = [
        Clipper.makePath([1,0, -1,1, 0,-1, 1,1, -1,1, 1,0, 0,-1, -1,1, 0,1, -1,0, 1,-1, -1,2,
          0,0, 1,2, -2,0, 0,-1, -1,0, 0,0, 0,1, -1,0, -1,-2, -1,1, -1,0]),
        Clipper.makePath([-1,0, 1,0, -1,-1, 0,1, -2,0, 0,0, -1,-1, -1,1, 0,1, -1,0, 1,0, -2,-1, -1,1, 1,-1]),
      ];
      const clip = [
        Clipper.makePath([-1,1, 0,-1, -1,0, 0,0, -1,1, 0,-1, -1,0, 0,1, 1,1]),
        Clipper.makePath([0,1, 1,1, -1,0, 0,-1, 0,1, -1,0, 0,0, -1,0, -1,1, 0,0, 1,0]),
      ];
      xorToTree(subject, clip);
    });
  });
});
