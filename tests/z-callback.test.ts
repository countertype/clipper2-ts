import { describe, it, expect } from 'vitest';
import { Clipper64, ClipperD, ClipType, FillRule, Point64, PointD, Paths64, PathsD, ZCallback64, ZCallbackD } from '../src/index';
import { Clipper } from '../src/Clipper';

/**
 * Z-coordinate callback tests
 * Ported from CSharp/Clipper2Lib.Tests/Tests2/Tests/TestZCallback1.cs
 */

// Test callback that sets Z to 1 at intersections
class TestCallbacks {
  myCallback64(bot1: Point64, top1: Point64, bot2: Point64, top2: Point64, intersectPt: Point64): void {
    intersectPt.z = 1;
  }

  myCallbackD(bot1: PointD, top1: PointD, bot2: PointD, top2: PointD, intersectPt: PointD): void {
    intersectPt.z = 1;
  }
}

describe('Z Callback Tests (Point64)', () => {
  it('should call Z callback for subject union (Point64)', () => {
    const solution: Paths64 = [];
    const subject: Paths64 = [];
    subject.push(Clipper.makePath([100, 50, 10, 79, 65, 2, 65, 98, 10, 21]));

    const c64 = new Clipper64();
    const ct = new TestCallbacks();

    c64.zCallback = ct.myCallback64.bind(ct);
    c64.addSubject(subject);
    c64.execute(ClipType.Union, FillRule.NonZero, solution);

    // Check that the Z for every second vertex == 1
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(10);
    
    for (let i = 0; i < solution[0].length; i++) {
      if ((i & 1) === 1) {
        expect(solution[0][i].z).toBe(0);
      } else {
        expect(solution[0][i].z).toBe(1);
      }
    }
  });

  it('should call Z callback for subject+clip union (Point64)', () => {
    const solution: Paths64 = [];
    const subject: Paths64 = [];
    const clip: Paths64 = [];
    
    // Union two triangles
    subject.push(Clipper.makePath([10, 30, 80, 30, 45, 90]));
    clip.push(Clipper.makePath([10, 70, 80, 70, 45, 10]));

    const c64 = new Clipper64();
    const ct = new TestCallbacks();

    c64.zCallback = ct.myCallback64.bind(ct);
    c64.addSubject(subject);
    c64.addClip(clip);
    c64.execute(ClipType.Union, FillRule.NonZero, solution);

    // Check that the Z for every second vertex == 1
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(12);
    
    for (let i = 0; i < solution[0].length; i++) {
      if ((i & 1) === 1) {
        expect(solution[0][i].z).toBe(0);
      } else {
        expect(solution[0][i].z).toBe(1);
      }
    }
  });
});

describe('Z Callback Tests (PointD)', () => {
  it('should call Z callback for subject union (PointD)', () => {
    const solution: PathsD = [];
    const subject: PathsD = [];
    subject.push(Clipper.makePathD([100, 50, 10, 79, 65, 2, 65, 98, 10, 21]));

    const cD = new ClipperD();
    const ct = new TestCallbacks();

    cD.zCallback = ct.myCallbackD.bind(ct);
    cD.addSubjectPaths(subject);
    cD.execute(ClipType.Union, FillRule.NonZero, solution);

    // Check that the Z for every second vertex == 1
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(10);
    
    for (let i = 0; i < solution[0].length; i++) {
      if ((i & 1) === 1) {
        expect(solution[0][i].z).toBe(0);
      } else {
        expect(solution[0][i].z).toBe(1);
      }
    }
  });

  it('should call Z callback for subject+clip union (PointD)', () => {
    const solution: PathsD = [];
    const subject: PathsD = [];
    const clip: PathsD = [];
    
    // Union two triangles
    subject.push(Clipper.makePathD([10, 30, 80, 30, 45, 90]));
    clip.push(Clipper.makePathD([10, 70, 80, 70, 45, 10]));

    const cD = new ClipperD();
    const ct = new TestCallbacks();

    cD.zCallback = ct.myCallbackD.bind(ct);
    cD.addSubjectPaths(subject);
    cD.addClipPaths(clip);
    cD.execute(ClipType.Union, FillRule.NonZero, solution);

    // Check that the Z for every second vertex == 1
    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(12);
    
    for (let i = 0; i < solution[0].length; i++) {
      if ((i & 1) === 1) {
        expect(solution[0][i].z).toBe(0);
      } else {
        expect(solution[0][i].z).toBe(1);
      }
    }
  });

  it('should handle Z coordinates with actual values (PointD)', () => {
    const c = new ClipperD(5);
    const bitePoly: PathsD = [[
      { x: 5, y: 5, z: 5 },
      { x: 10, y: 5, z: 5 },
      { x: 10, y: 10, z: 5 },
      { x: 5, y: 10, z: 5 }
    ]];

    const surfacePoly: PathsD = [[
      { x: 0, y: 0, z: 5 },
      { x: 15, y: 0, z: 5 },
      { x: 15, y: 15, z: 5 },
      { x: 0, y: 15, z: 5 }
    ]];

    c.addSubjectPaths(surfacePoly);
    c.addClip(bitePoly[0]);
    const solution: PathsD = [];

    c.execute(ClipType.Difference, FillRule.EvenOdd, solution);
    
    // Should execute without error
    expect(solution).toBeDefined();
    expect(solution.length).toBeGreaterThan(0);
  });
});






