// Tests from upstream that had no counterpart here.
//
// Ported from PolyClipping/Clipper2 CPP/Tests (TestIsCollinear, TestOrientation,
// TestPolytreeIntersection, TestPolytreeUnion, TestRandomPaths, TestRect, TestRectClip,
// TestRounding, TestSimplifyPath, TestTrimCollinear, TestExportHeaders), with their inputs
// and expected values. The test names give the upstream test and issue.
import { describe, test, expect } from 'vitest';
import {
  Clipper, Clipper64, ClipperD, ClipType, FillRule, InternalClipper, PolyTree64, PolyTreeD,
  RectClip64, Rect64Utils,
  type Path64, type Paths64, type PathsD, type Rect64,
} from '../src';

const rect64 = (left: number, top: number, right: number, bottom: number): Rect64 =>
  ({ left, top, right, bottom });

describe('upstream TestIsCollinear.cpp', () => {
  test('TestIsCollinear2 (#831)', () => {
    const i = 0x4000000000000;
    const subject = Clipper.makePath([-i,-i, i,-i, -i,i, i,i]);
    const clipper = new Clipper64();
    clipper.addSubject([subject]);
    const solution: Paths64 = [];
    clipper.execute(ClipType.Union, FillRule.EvenOdd, solution);
    expect(solution.length).toBe(2);
  });

  // only the ProductsAreEqual checks: MultiplyInt64 and CompareProducts have no counterpart,
  // and their other operands are past the safe integer range
  test('TestCompareProducts, ProductsAreEqual checks', () => {
    // two products above 2^64 that differ only in the low word
    const p = 2 ** 32 + 1;
    const q = 2 ** 32;
    expect(InternalClipper.productsAreEqual(-p, p, p, -p)).toBe(true);
    expect(InternalClipper.productsAreEqual(p, p, q, q + 2)).toBe(false);
  });
});

describe('upstream TestOrientation.cpp', () => {
  test('TestNegativeOrientation', () => {
    const subjects: Paths64 = [
      Clipper.makePath([0,0, 0,100, 100,100, 100,0]),
      Clipper.makePath([10,10, 10,110, 110,110, 110,10]),
    ];
    expect(Clipper.isPositive(subjects[0])).toBe(false);
    expect(Clipper.isPositive(subjects[1])).toBe(false);
    const clips: Paths64 = [Clipper.makePath([50,50, 50,150, 150,150, 150,50])];
    expect(Clipper.isPositive(clips[0])).toBe(false);
    const solution = Clipper.union(subjects, clips, FillRule.Negative);
    expect(solution.length).toBe(1);
    expect(solution[0].length).toBe(12);
  });
});

describe('upstream TestPolytreeIntersection.cpp', () => {
  test('TestPolyTreeIntersection', () => {
    const clipper = new Clipper64();
    const subject: Paths64 = [Clipper.makePath([0,0, 0,5, 5,5, 5,0])];
    clipper.addSubject(subject);
    const clip: Paths64 = [Clipper.makePath([1,1, 1,6, 6,6, 6,1])];
    clipper.addClip(clip);
    const solution = new PolyTree64();
    const openPaths: Paths64 = [];
    if (Clipper.isPositive(subject[0])) {
      clipper.execute(ClipType.Intersection, FillRule.Positive, solution, openPaths);
    } else {
      clipper.execute(ClipType.Intersection, FillRule.Negative, solution, openPaths);
    }
    expect(openPaths.length).toBe(0);
    expect(solution.count).toBe(1);
    expect(solution.child(0).polygon!.length).toBe(4);
  });
});

describe('upstream TestPolytreeUnion.cpp', () => {
  test('TestPolytreeUnion', () => {
    const subject: Paths64 = [
      Clipper.makePath([0,0, 0,5, 5,5, 5,0]),
      Clipper.makePath([1,1, 1,6, 6,6, 6,1]),
    ];
    const clipper = new Clipper64();
    clipper.addSubject(subject);
    const solution = new PolyTree64();
    const openPaths: Paths64 = [];
    if (Clipper.isPositive(subject[0])) {
      clipper.execute(ClipType.Union, FillRule.Positive, solution, openPaths);
    } else {
      // because clipping ops normally return Positive solutions
      clipper.reverseSolution = true;
      clipper.execute(ClipType.Union, FillRule.Negative, solution, openPaths);
    }
    expect(openPaths.length).toBe(0);
    expect(solution.count).toBe(1);
    expect(solution.child(0).polygon!.length).toBe(8);
    expect(Clipper.isPositive(solution.child(0).polygon!)).toBe(Clipper.isPositive(subject[0]));
  });

  test('TestPolytreeUnion2 (#987)', () => {
    const subject: Paths64 = [
      Clipper.makePath([534,1024, 534,-800, 1026,-800, 1026,1024]),
      Clipper.makePath([1,1024, 8721,1024, 8721,1920, 1,1920]),
      Clipper.makePath([30,1024, 30,-800, 70,-800, 70,1024]),
      Clipper.makePath([1,1024, 1,-1024, 3841,-1024, 3841,1024]),
      Clipper.makePath([3900,-1024, 6145,-1024, 6145,1024, 3900,1024]),
      Clipper.makePath([5884,1024, 5662,1024, 5662,-1024, 5884,-1024]),
      Clipper.makePath([534,1024, 200,1024, 200,-800, 534,-800]),
      Clipper.makePath([200,-800, 200,1024, 70,1024, 70,-800]),
      Clipper.makePath([1200,1920, 1313,1920, 1313,-800, 1200,-800]),
      Clipper.makePath([6045,-800, 6045,1024, 5884,1024, 5884,-800]),
    ];
    const clipper = new Clipper64();
    clipper.addSubject(subject);
    const solution = new PolyTree64();
    const openPaths: Paths64 = [];
    clipper.execute(ClipType.Union, FillRule.EvenOdd, solution, openPaths);

    expect(solution.count).toBe(1);
    expect(solution.child(0).count).toBe(1);
  });

  // upstream only requires that this returns
  test('TestPolytreeUnion3', () => {
    const subject: Paths64 = [Clipper.makePath([
      -120927680, 590077597,
      -120919386, 590077307,
      -120919432, 590077309,
      -120919451, 590077309,
      -120919455, 590077310,
      -120099297, 590048669,
      -120928004, 590077608,
      -120902794, 590076728,
      -120919444, 590077309,
      -120919450, 590077309,
      -120919842, 590077323,
      -120922852, 590077428,
      -120902452, 590076716,
      -120902455, 590076716,
      -120912590, 590077070,
      11914491, 249689797,
    ])];
    const clipper = new Clipper64();
    clipper.addSubject(subject);
    const solution = new PolyTree64();
    clipper.execute(ClipType.Union, FillRule.EvenOdd, solution);
  });
});

describe('upstream TestRandomPaths.cpp', () => {
  // std::default_random_engine and uniform_int_distribution differ between standard
  // libraries, so the sequence here is a local one with the same seed and ranges
  function makeRng(seed: number): (min: number, max: number) => number {
    let state = seed >>> 0;
    return (min, max) => {
      if (min === max) return min;
      // mulberry32
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return min + Math.floor(r * (max - min + 1));
    };
  }

  function generateRandomPaths(rng: (min: number, max: number) => number, minPathCount: number, maxComplexity: number): Paths64 {
    const pathCount = rng(minPathCount, maxComplexity);
    const result: Paths64 = [];
    for (let path = 0; path < pathCount; path++) {
      const minPointCount = 0;
      const pathLength = rng(minPointCount, Math.max(minPointCount, maxComplexity));
      const resultPath: Path64 = [];
      for (let point = 0; point < pathLength; point++) {
        if (resultPath.length === 0) {
          const x = rng(-maxComplexity, maxComplexity * 2);
          const y = rng(-maxComplexity, maxComplexity * 2);
          resultPath.push({ x, y });
        } else {
          const previous = resultPath[resultPath.length - 1];
          const x = previous.x + rng(-5, 5);
          const y = previous.y + rng(-5, 5);
          resultPath.push({ x, y });
        }
      }
      result.push(resultPath);
    }
    return result;
  }

  test('TestRandomPaths', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 750; i++) {
      const maxComplexity = Math.max(1, Math.trunc(i / 10));
      const subject = generateRandomPaths(rng, 1, maxComplexity);
      const subjectOpen = generateRandomPaths(rng, 0, maxComplexity);
      const clip = generateRandomPaths(rng, 0, maxComplexity);
      const ct = rng(0, 4) as ClipType;
      const fr = rng(0, 3) as FillRule;

      const solution: Paths64 = [];
      const solutionOpen: Paths64 = [];
      const c = new Clipper64();
      c.addSubject(subject);
      c.addOpenSubject(subjectOpen);
      c.addClip(clip);
      c.execute(ct, fr, solution, solutionOpen);
      const areaPaths = Math.trunc(Clipper.areaPaths(solution));

      const solutionPolytree = new PolyTree64();
      const solutionPolytreeOpen: Paths64 = [];
      const clipperPolytree = new Clipper64();
      clipperPolytree.addSubject(subject);
      clipperPolytree.addOpenSubject(subjectOpen);
      clipperPolytree.addClip(clip);
      clipperPolytree.execute(ct, fr, solutionPolytree, solutionPolytreeOpen);
      const solutionPolytreePaths = Clipper.polyTreeToPaths64(solutionPolytree);
      const areaPolytree = Math.trunc(Clipper.areaPaths(solutionPolytreePaths));

      if (areaPaths !== areaPolytree) {
        expect.soft(areaPolytree, `iteration ${i} ${ClipType[ct]} ${FillRule[fr]} ` +
          JSON.stringify({ subject, subjectOpen, clip })).toBe(areaPaths);
      }
    }
  }, 30000); // 750 clips twice over; the default limit is close on a busy machine
});

describe('upstream TestRect.cpp', () => {
  // Rect64 operator+ upstream; there is no rect union here
  const plus = (a: Rect64, b: Rect64): Rect64 => ({
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  });

  test('TestRectOpPlus', () => {
    {
      const lhs = Rect64Utils.createInvalid();
      const rhs = rect64(-1, -1, 10, 10);
      expect(plus(lhs, rhs)).toEqual(rhs);
      expect(plus(rhs, lhs)).toEqual(rhs);
    }
    {
      const lhs = Rect64Utils.createInvalid();
      const rhs = rect64(1, 1, 10, 10);
      expect(plus(lhs, rhs)).toEqual(rhs);
      expect(plus(rhs, lhs)).toEqual(rhs);
    }
    {
      const lhs = rect64(0, 0, 1, 1);
      const rhs = rect64(-1, -1, 0, 0);
      const expected = rect64(-1, -1, 1, 1);
      expect(plus(lhs, rhs)).toEqual(expected);
      expect(plus(rhs, lhs)).toEqual(expected);
    }
    {
      const lhs = rect64(-10, -10, -1, -1);
      const rhs = rect64(1, 1, 10, 10);
      const expected = rect64(-10, -10, 10, 10);
      expect(plus(lhs, rhs)).toEqual(expected);
      expect(plus(rhs, lhs)).toEqual(expected);
    }
  });
});

describe('upstream TestRectClip.cpp', () => {
  test('TestRectClip', () => {
    let rect = rect64(100, 100, 700, 500);
    let clp: Paths64 = [Rect64Utils.asPath(rect)];
    let sub: Paths64 = [Clipper.makePath([100,100, 700,100, 700,500, 100,500])];
    let sol = Clipper.rectClip(rect, sub);
    expect(Clipper.areaPaths(sol)).toBe(Clipper.areaPaths(sub));

    sub = [Clipper.makePath([110,110, 700,100, 700,500, 100,500])];
    sol = Clipper.rectClip(rect, sub);
    expect(Clipper.areaPaths(sol)).toBe(Clipper.areaPaths(sub));

    sub = [Clipper.makePath([90,90, 700,100, 700,500, 100,500])];
    sol = Clipper.rectClip(rect, sub);
    expect(Clipper.areaPaths(sol)).toBe(Clipper.areaPaths(clp));

    sub = [Clipper.makePath([110,110, 690,110, 690,490, 110,490])];
    sol = Clipper.rectClip(rect, sub);
    expect(Clipper.areaPaths(sol)).toBe(Clipper.areaPaths(sub));

    rect = rect64(390, 290, 410, 310);
    clp = [Rect64Utils.asPath(rect)];
    sub = [Clipper.makePath([410,290, 500,290, 500,310, 410,310])];
    sol = Clipper.rectClip(rect, sub);
    expect(sol.length).toBe(0);

    sub = [Clipper.makePath([430,290, 470,330, 390,330])];
    sol = Clipper.rectClip(rect, sub);
    expect(sol.length).toBe(0);

    sub = [Clipper.makePath([450,290, 480,330, 450,330])];
    sol = Clipper.rectClip(rect, sub);
    expect(sol.length).toBe(0);

    sub = [Clipper.makePath([208,66, 366,112, 402,303,
      234,332, 233,262, 243,140, 215,126, 40,172])];
    rect = rect64(237, 164, 322, 248);
    sol = Clipper.rectClip(rect, sub);
    const solBounds = Clipper.getBoundsPaths(sol);
    expect(Rect64Utils.width(solBounds)).toBe(Rect64Utils.width(rect));
    expect(Rect64Utils.height(solBounds)).toBe(Rect64Utils.height(rect));
  });

  test('TestRectClip2 (#597)', () => {
    const rect = rect64(54690, 0, 65628, 6000);
    const subject: Paths64 = [Clipper.makePath([700000,6000, 0,6000, 0,5925, 700000,5925])];
    const solution = Clipper.rectClip(rect, subject);
    expect(solution.length).toBe(1);
    expect(solution[0].length).toBe(4);
  });

  test('TestRectClip3 (#637)', () => {
    const r = rect64(-1800000000, -137573171, -1741475021, 3355443);
    const subject: Paths64 = [Clipper.makePath([-1800000000, 10005000,
      -1800000000, -5000, -1789994999, -5000, -1789994999, 10005000])];
    const solution = Clipper.rectClip(r, subject);
    expect(solution.length).toBe(1);
  });

  test('TestRectClipOrientation (#864)', () => {
    const rect = rect64(1222, 1323, 3247, 3348);
    const subject = Clipper.makePath([375,1680, 1915,4716, 5943,586, 3987,152]);
    const clip = new RectClip64(rect);
    const solution = clip.execute([subject]);
    expect(solution.length).toBe(1);
    expect(Clipper.isPositive(solution[0])).toBe(Clipper.isPositive(subject));
  });
});

describe('upstream TestRounding.cpp', () => {
  // RoundToInt64 upstream is roundToEven here; an int64_t has no -0
  const roundToInt64 = (val: number): number => InternalClipper.roundToEven(val) + 0;

  // std::nearbyint in the default rounding mode
  function nearbyint(val: number): number {
    const f = Math.floor(val);
    const diff = val - f;
    if (diff < 0.5) return f + 0;
    if (diff > 0.5) return f + 1;
    return (f % 2 === 0 ? f : f + 1) + 0;
  }

  // the default rounding mode only: the others cannot be selected
  test('TestRoundToInt64', () => {
    const values = [0.0, -0.0, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 2.4, -2.6,
      0.49999999999999994, -0.49999999999999994, 4503599627370495.5, -4503599627370495.5,
      9007199254740992.0, -9007199254740994.0, 1e18 + 0.0, InternalClipper.max_coord, InternalClipper.min_coord];

    expect(roundToInt64(values[2])).toBe(0);
    expect(roundToInt64(values[3])).toBe(0);
    expect(roundToInt64(values[4])).toBe(2);
    expect(roundToInt64(values[6])).toBe(2);
    expect(roundToInt64(values[7])).toBe(-2);
    expect(roundToInt64(values[12])).toBe(4503599627370496);
    expect(roundToInt64(values[13])).toBe(-4503599627370496);
    expect(roundToInt64(values[17])).toBe(InternalClipper.max_coord);

    for (const val of values) {
      expect(roundToInt64(val), `value ${val}`).toBe(nearbyint(val));
    }
  });
});

describe('upstream TestSimplifyPath.cpp', () => {
  // Length upstream
  function length(path: Path64, isClosedPath: boolean = false): number {
    let result = 0.0;
    if (path.length < 2) return result;
    for (let i = 0; i < path.length - 1; i++) {
      result += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    }
    if (isClosedPath) {
      const last = path[path.length - 1];
      result += Math.hypot(path[0].x - last.x, path[0].y - last.y);
    }
    return result;
  }

  test('TestSimplifyPath', () => {
    const input1 = Clipper.makePath([
      0,0, 1,1, 0,20, 0,21, 1,40, 0,41, 0,60, 0,61, 0,80, 1,81, 0,100,
    ]);
    const output1 = Clipper.simplifyPath(input1, 2, false);
    expect(length(output1)).toBe(100);
    expect(output1.length).toBe(2);
  });
});

describe('upstream TestTrimCollinear.cpp', () => {
  test('TestTrimCollinear', () => {
    const input1 = Clipper.makePath([10,10, 10,10, 50,10, 100,10, 100,100, 10,100, 10,10, 20,10]);
    const output1 = Clipper.trimCollinear(input1, false);
    expect(output1.length).toBe(4);

    const input2 = Clipper.makePath([10,10, 10,10, 100,10, 100,100, 10,100, 10,10, 10,10]);
    const output2 = Clipper.trimCollinear(input2, true);
    expect(output2.length).toBe(5);

    const input3 = Clipper.makePath([10,10, 10,50, 10,10, 50,10, 50,50,
      50,10, 70,10, 70,50, 70,10, 50,10, 100,10, 100,50, 100,10]);
    const output3 = Clipper.trimCollinear(input3);
    expect(output3.length).toBe(0);

    const input4 = Clipper.makePath([2,3, 3,4, 4,4, 4,5, 7,5,
      8,4, 8,3, 9,3, 8,3, 7,3, 6,3, 5,3, 4,3, 3,3, 2,3]);
    const output4a = Clipper.trimCollinear(input4);
    const output4b = Clipper.trimCollinear(output4a);
    const area4a = Math.trunc(Clipper.area(output4a));
    const area4b = Math.trunc(Clipper.area(output4b));
    expect(output4a.length).toBe(7);
    expect(area4a).toBe(-9);
    expect(output4a.length).toBe(output4b.length);
    expect(area4a).toBe(area4b);
  });
});

// the C export layer has no counterpart here, so these run the same inputs through the
// classes that layer calls
describe('upstream TestExportHeaders.cpp, geometry only', () => {
  const squares = (): number[][] => {
    const result: number[][] = [];
    for (let i = 1; i < 6; i++) {
      result.push([-i * 20,-i * 20, i * 20,-i * 20, i * 20,i * 20, -i * 20,i * 20]);
    }
    return result;
  };
  const clipCoords = [-90,-120, 90,-120, 90,120, -90,120];

  test('ExportHeader64', () => {
    const subj: Paths64 = squares().map(s => Clipper.makePath(s));
    const clip: Paths64 = [Clipper.makePath(clipCoords)];
    const c = new Clipper64();
    c.addSubject(subj);
    c.addClip(clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Intersection, FillRule.EvenOdd, solution, []);
    expect(solution.length).toBe(5);
  });

  test('ExportHeaderD', () => {
    const subj: PathsD = squares().map(s => Clipper.makePathD(s));
    const clip: PathsD = [Clipper.makePathD(clipCoords)];
    const c = new ClipperD(2);
    c.addSubjectPaths(subj);
    c.addClipPaths(clip);
    const solution: PathsD = [];
    c.execute(ClipType.Intersection, FillRule.EvenOdd, solution, []);
    expect(solution.length).toBe(5);
  });

  test('ExportHeaderTree64', () => {
    const subj: Paths64 = squares().map(s => Clipper.makePath(s));
    const clip: Paths64 = [Clipper.makePath(clipCoords)];
    const c = new Clipper64();
    c.addSubject(subj);
    c.addClip(clip);
    const solTree = new PolyTree64();
    c.execute(ClipType.Intersection, FillRule.EvenOdd, solTree, []);
    let pp: { count: number, child(i: number): any } = solTree;
    for (let i = 0; i < 5; i++) {
      expect(pp.count).toBe(1);
      pp = pp.child(0);
    }
  });

  test('ExportHeaderTreeD', () => {
    const subj: PathsD = squares().map(s => Clipper.makePathD(s));
    const clip: PathsD = [Clipper.makePathD(clipCoords)];
    const c = new ClipperD(4);
    c.addSubjectPaths(subj);
    c.addClipPaths(clip);
    const solTree = new PolyTreeD();
    c.execute(ClipType.Intersection, FillRule.EvenOdd, solTree, []);
    let pp: { count: number, child(i: number): any } = solTree;
    for (let i = 0; i < 5; i++) {
      expect(pp.count).toBe(1);
      pp = pp.child(0);
    }
  });
});
