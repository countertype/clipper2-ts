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

  // PolyTree hole ownership test (TestPolytree2 equivalent)
  test('should correctly establish hole ownership relationships', () => {
    const testCase = TestDataParser.loadTestCase('PolytreeHoleOwner2.txt', 1);
    expect(testCase).not.toBeNull();
    
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
});
