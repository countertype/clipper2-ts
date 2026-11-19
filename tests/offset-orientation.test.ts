// Offsetting returns outers wound positively whatever the orientation of the
// input, and works out which paths are outers and which are holes from their
// size and containment.
//
// Ported from PolyClipping/Clipper2 64a9ecc (CPP/Tests/TestOffsetOrientation.cpp
// and the tests that commit added to CPP/Tests/TestOffsets.cpp).
// https://github.com/PolyClipping/Clipper2/issues/13
import { describe, test, expect } from 'vitest';
import {
  Clipper, ClipperOffset, JoinType, EndType,
  type Path64, type Paths64, type PathsD,
} from '../src';

function makeSquare(left: number, top: number, size: number, clockwise: boolean): Path64 {
  const result = Clipper.makePath([left,top, left + size,top, left + size,top + size, left,top + size]);
  if (clockwise) result.reverse();
  return result;
}

const sortedAreas = (paths: Paths64): number[] => paths.map(p => Clipper.area(p)).sort((a, b) => a - b);

// each path in its own group
function offsetAreas(groups: Paths64, delta: number): number[] {
  const co = new ClipperOffset();
  for (const path of groups) co.addPath(path, JoinType.Round, EndType.Polygon);
  const solution: Paths64 = [];
  co.execute(delta, solution);
  return sortedAreas(solution);
}

function oneGroupAreas(paths: Paths64, delta: number): number[] {
  return sortedAreas(Clipper.inflatePaths(paths, delta, JoinType.Round, EndType.Polygon));
}

function offsetGroups(groups: Paths64[], delta: number): Paths64 {
  const co = new ClipperOffset();
  for (const group of groups) co.addPaths(group, JoinType.Miter, EndType.Polygon);
  const solution: Paths64 = [];
  co.execute(delta, solution);
  return solution;
}

const reversed = (path: Path64): Path64 => [...path].reverse();

describe('offset orientation (PolyClipping/Clipper2 64a9ecc)', () => {
  test('output is positive whatever the orientation of the input', () => {
    const subject: Paths64 = [Clipper.makePath([0,0, 0,5, 5,5, 5,0])];
    const solution = Clipper.inflatePaths(subject, 1, JoinType.Round, EndType.Polygon);
    expect(solution).toHaveLength(1);
    expect(Clipper.isPositive(subject[0])).toBe(false);
    expect(Clipper.isPositive(solution[0])).toBe(true);
  });

  test('output is negative when reverseSolution is set', () => {
    const subject: Paths64 = [
      Clipper.makePath([20,220, 280,220, 280,280, 20,280]),
      Clipper.makePath([0,200, 0,300, 300,300, 300,200])
    ];
    const co = new ClipperOffset();
    co.reverseSolution = true;
    co.addPaths(subject, JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(5, solution);
    expect(solution).toHaveLength(2);
    expect(Clipper.isPositive(solution[0])).toBe(false);
  });

  test('orientation with and without reverseSolution, with a hole (#733)', () => {
    // start subject's orientation positive ...
    const subject: Paths64 = [Clipper.makePath([100,100, 200,100, 200,400, 100,400])];
    let solution = Clipper.inflatePaths(subject, 50, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(1);
    expect(Clipper.isPositive(solution[0])).toBe(true);
    // reversing subject's orientation no longer changes the solution's
    subject[0].reverse();
    solution = Clipper.inflatePaths(subject, 50, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(1);
    expect(Math.abs(Clipper.area(solution[0]))).toBeGreaterThan(Math.abs(Clipper.area(subject[0])));
    expect(Clipper.isPositive(solution[0])).toBe(true);

    const co = new ClipperOffset(2, 0, false, true); // last param. reverses solution
    co.addPaths(subject, JoinType.Miter, EndType.Polygon);
    solution = [];
    co.execute(50, solution);
    expect(solution).toHaveLength(1);
    expect(Math.abs(Clipper.area(solution[0]))).toBeGreaterThan(Math.abs(Clipper.area(subject[0])));
    expect(Clipper.isPositive(solution[0])).toBe(false);

    // add a hole (ie has reverse orientation to outer path)
    subject.push(Clipper.makePath([130,130, 170,130, 170,370, 130,370]));
    solution = Clipper.inflatePaths(subject, 30, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(1);
    expect(Clipper.isPositive(solution[0])).toBe(true);
    co.clear(); // should still reverse solution orientation
    co.addPaths(subject, JoinType.Miter, EndType.Polygon);
    co.execute(30, solution);
    expect(solution).toHaveLength(1);
    expect(Math.abs(Clipper.area(solution[0]))).toBeGreaterThan(Math.abs(Clipper.area(subject[0])));
    expect(Clipper.isPositive(solution[0])).toBe(false);
    solution = Clipper.inflatePaths(subject, -15, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(0);
  });

  test('a stray negative sliver lower than the outer path does not reverse the group (#13)', () => {
    const subject: Paths64 = [
      Clipper.makePath([33621,18600, 33889,18931, 33622,18601, 33118,18033]),
      Clipper.makePath([33058,3177, 33032,3337, 33017,3570, 33040,17609, 33118,18033, 32723,17588, 32698,3608,
        32710,3376, 32737,3177])
    ];
    const solution = Clipper.inflatePaths(subject, -8, JoinType.Round, EndType.Polygon);
    expect(solution).toHaveLength(1);
    // the sliver is a hole, so the result is the outer path's own inward offset
    expect(Clipper.areaPaths(solution)).toBe(
      Clipper.areaPaths(Clipper.inflatePaths([subject[1]], -8, JoinType.Round, EndType.Polygon)));
  });

  test('a group holding only holes takes its orientation from the outer in another group', () => {
    let outer = Clipper.makePath([0,0, 300,0, 300,300, 0,300]);
    let hole = Clipper.makePath([100,100, 100,200, 200,200, 200,100]);

    for (let mirror = 0; mirror < 2; mirror++) {
      for (const outerFirst of [true, false]) {
        const co = new ClipperOffset();
        co.addPath(outerFirst ? outer : hole, JoinType.Miter, EndType.Polygon);
        co.addPath(outerFirst ? hole : outer, JoinType.Miter, EndType.Polygon);
        const solution: Paths64 = [];
        co.execute(10, solution);
        expect(Clipper.areaPaths(solution)).toBe(320 * 320 - 80 * 80);
      }
      outer = reversed(outer);
      hole = reversed(hole);
    }
  });

  test('a group wound against another is its own outer, unless it lies inside that group\'s outer', () => {
    const outer = makeSquare(0, 0, 1000, false);
    const disjoint = makeSquare(2000, 0, 100, true);
    const hole = makeSquare(400, 400, 200, true);

    for (const outerFirst of [true, false]) {
      const groups = (other: Path64): Paths64 => outerFirst ? [outer, other] : [other, outer];

      expect(offsetAreas(groups(disjoint), 10)).toEqual([14308, 1040308]);
      expect(offsetAreas(groups(disjoint), -10)).toEqual([6400, 960400]);
      expect(offsetAreas(groups(hole), 10)).toEqual([-32400, 1040308]);
      expect(offsetAreas(groups(hole), -10)).toEqual([-48308, 960400]);
    }
  });

  test('the innermost enclosing path decides, so a group inside another group\'s hole is an island', () => {
    const chain: Paths64 = [makeSquare(0, 0, 1000, false), makeSquare(200, 200, 500, true),
      makeSquare(300, 300, 100, false)];
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

    for (const order of orders) {
      const groups: Paths64 = [chain[order[0]], chain[order[1]], chain[order[2]]];
      expect(offsetAreas(groups, 10)).toEqual([-230400, 14308, 1040308]);
    }
  });

  test('separate groups behave like one group when their paths\' roles are unambiguous', () => {
    const outer = makeSquare(0, 0, 1000, false);
    const ringHole = makeSquare(500, 500, 400, true);
    const touching = makeSquare(0, 400, 200, true); // first vertex on the outer's edge
    const inscribed = Clipper.makePath([0,500, 500,1000, 1000,500, 500,0]);
    const island = makeSquare(600, 600, 100, false);
    const hole = makeSquare(100, 100, 100, true);

    expect(offsetAreas([touching, outer], 10)).toEqual(oneGroupAreas([outer, touching], 10));
    expect(offsetAreas([inscribed, outer], 10)).toEqual(oneGroupAreas([outer, inscribed], 10));

    // a group of an outer and its hole encloses an island in the hole and a hole in the ring
    const co = new ClipperOffset();
    co.addPath(island, JoinType.Round, EndType.Polygon);
    co.addPath(hole, JoinType.Round, EndType.Polygon);
    co.addPaths([outer, ringHole], JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
    expect(sortedAreas(solution)).toEqual(oneGroupAreas([outer, ringHole, island, hole], 10));

    // the hole lies in an outer and in another group's hole of the same area, and the outer decides
    const frame = makeSquare(-500, -500, 2000, false);
    const frameHole = makeSquare(0, 0, 1000, true);

    for (const outerFirst of [true, false]) {
      const tie = new ClipperOffset();
      tie.addPath(hole, JoinType.Round, EndType.Polygon);
      if (outerFirst) tie.addPath(outer, JoinType.Round, EndType.Polygon);
      tie.addPaths([frame, frameHole], JoinType.Round, EndType.Polygon);
      if (!outerFirst) tie.addPath(outer, JoinType.Round, EndType.Polygon);
      const tied: Paths64 = [];
      tie.execute(10, tied);
      expect(sortedAreas(tied)).toEqual(oneGroupAreas([frame, frameHole, outer, hole], 10));
    }
  });

  test('a container with many collinear vertices is searched through an index of its edges', () => {
    const corners = Clipper.makePath([0,0, 1000,0, 1000,400, 400,400, 400,1000, 0,1000]);
    const lShape: Path64 = [];

    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const steps = (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 50;
      for (let k = 0; k < steps; k++) {
        lShape.push({ x: a.x + Math.trunc((b.x - a.x) * k / steps), y: a.y + Math.trunc((b.y - a.y) * k / steps) });
      }
    }

    expect(lShape.length).toBeGreaterThanOrEqual(64);
    const inArm = makeSquare(100, 100, 100, true);
    const touching = makeSquare(0, 500, 100, true); // first vertex on an edge's vertex
    const inNotch = makeSquare(600, 600, 100, true); // inside the bounds only
    const notchOuter = reversed(inNotch);

    for (const delta of [10, -10]) {
      expect(offsetAreas([inNotch, inArm, touching, lShape], delta))
        .toEqual(oneGroupAreas([lShape, inArm, touching, notchOuter], delta));
    }
  });

  test('a hole that no outer encloses contributes nothing', () => {
    // not even the loops of its concave joins
    const outer = makeSquare(0, 0, 100, false);
    const stray = makeSquare(500, 500, 50, true);
    const cwOuter = makeSquare(0, 0, 100, true);
    const ccwStray = makeSquare(500, 500, 50, false);

    for (const joinType of [JoinType.Miter, JoinType.Round]) {
      for (const delta of [10, -10]) {
        expect(Clipper.inflatePaths([outer, stray], delta, joinType, EndType.Polygon))
          .toEqual(Clipper.inflatePaths([outer], delta, joinType, EndType.Polygon));
        expect(Clipper.inflatePaths([cwOuter, ccwStray], delta, joinType, EndType.Polygon))
          .toEqual(Clipper.inflatePaths([cwOuter], delta, joinType, EndType.Polygon));
      }
    }

    // a hole around another group's island is still stray, since none of its vertices is inside an outer
    const farOuter = makeSquare(0, 0, 1000, false);
    const around = makeSquare(2000, 0, 300, true);
    const island = makeSquare(2100, 100, 50, false);
    const co = new ClipperOffset();
    co.addPath(island, JoinType.Round, EndType.Polygon);
    co.addPaths([farOuter, around], JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
    expect(solution).toEqual(Clipper.inflatePaths([farOuter, island], 10, JoinType.Round, EndType.Polygon));

    // a hole poking out of its outer still cuts it
    const poking = makeSquare(80, 40, 40, true);
    expect(Clipper.areaPaths(Clipper.inflatePaths([outer, poking], 10, JoinType.Miter, EndType.Polygon)))
      .toBeLessThan(120 * 120);
  });

  test('a stray hole does not decide the orientation of another group', () => {
    // the stray strip crosses the middle square without enclosing any of its vertices, so it must not
    // decide that the small square inside it is an island rather than the middle square's hole
    let farOuter = makeSquare(5000, 5000, 10000, false);
    let strip = Clipper.makePath([-100,600, 1100,600, 1100,400, -100,400]);
    let middle = makeSquare(0, 0, 1000, false);
    let hole = makeSquare(450, 450, 100, true);

    for (let mirror = 0; mirror < 2; mirror++) {
      for (const delta of [0, 10, -10]) {
        expect(offsetGroups([[farOuter, strip], [middle], [hole]], delta))
          .toEqual(offsetGroups([[farOuter], [middle], [hole]], delta));
      }
      farOuter = reversed(farOuter);
      strip = reversed(strip);
      middle = reversed(middle);
      hole = reversed(hole);
    }
  });

  test('a chain of stray holes settles, however long', () => {
    // each strip is stray only once the hole beside the previous strip is known to be a hole
    for (const mirror of [false, true]) {
      const withStrips: Paths64[] = [];
      const withoutStrips: Paths64[] = [];
      const farOuter = makeSquare(-300000000, -50000000, 100000000, mirror);
      withStrips.push([farOuter]);
      withoutStrips.push([farOuter]);
      let stripGroup = 0;
      let size = 10000000;

      for (let i = 1; i <= 6; i++, size /= 10) {
        const x = i * 300000000;
        const strip = Clipper.makePath([x - size * 6 / 10,-size / 10, x + size * 6 / 10,-size / 10,
          x + size * 6 / 10,size / 10, x - size * 6 / 10,size / 10]);
        if (!mirror) strip.reverse();

        const small = makeSquare(x - size / 20, -size / 20, size / 10, !mirror);
        const middle = makeSquare(x - size / 2, -size / 2, size, mirror);
        // the strip sits in the group of the previous level's small square
        withStrips[stripGroup].push(strip);
        stripGroup = withStrips.length;
        withStrips.push([small]);
        withStrips.push([middle]);
        withoutStrips.push([small]);
        withoutStrips.push([middle]);
      }

      for (const delta of [0, 10, -10]) {
        expect(offsetGroups(withStrips, delta)).toEqual(offsetGroups(withoutStrips, delta));
      }
    }
  });

  test('hole sizes compare exactly', () => {
    // a rounded area compares both of these wrongly, and a hole compared as larger than its outer was dropped as stray
    const farOuter = makeSquare(-300000000, -300000000, 200000000, false);
    const outer = Clipper.makePath([7786030,124989629, 13919251,42104456,
      167208900,68570499, 199121929,96243643, 185340413,198615010, 66854563,174207781]);
    const coincident = reversed(outer);

    // a thin outer and a thin hole strictly inside it, whose areas are exactly 36 and 16
    const thinOuter = Clipper.makePath([-310414360,-251832566, 13677104,72258904,
      337768562,396350368, 13677098,72258898]);
    const thinHole = Clipper.makePath([13677099,72258899, 229738075,288319879,
      13677103,72258903, -202383873,-143802077]);
    const smallOuter = makeSquare(-1000000, -1000000, 100000, false);

    for (const delta of [0, 10, -10]) {
      expect(offsetGroups([[farOuter, outer, coincident]], delta))
        .toEqual(offsetGroups([[farOuter], [outer, coincident]], delta));
      expect(offsetGroups([[smallOuter, thinOuter, thinHole]], delta))
        .toEqual(offsetGroups([[smallOuter], [thinOuter, thinHole]], delta));
    }
  });

  test('large or non-integer coordinates do not break the area ranking', () => {
    // the area sum needs BigInt as intermediate arithmetic above about 3e7; the result is a number
    const big = Clipper.makePath([0,0, 3e14,0, 3e14,3e14, 0,3e14]);
    const hole = Clipper.makePath([1e14,1e14, 1e14,2e14, 2e14,2e14, 2e14,1e14]);
    const solution = Clipper.inflatePaths([hole, big], 10, JoinType.Miter, EndType.Polygon);
    expect(solution).toHaveLength(2);
    expect(Clipper.areaPaths(solution)).toBeGreaterThan(0);

    // BigInt cannot hold these; they used to throw a raw conversion error here
    const fractional: Paths64 = [[
      { x: 0.5, y: 0.25 }, { x: 5e7 + 0.5, y: 0.25 }, { x: 5e7 + 0.5, y: 5e7 + 0.75 }, { x: 0.5, y: 5e7 + 0.75 }
    ]];
    expect(() => Clipper.inflatePaths(fractional, 10, JoinType.Miter, EndType.Polygon)).not.toThrow();
    expect(Clipper.inflatePaths(fractional, 10, JoinType.Miter, EndType.Polygon)).toHaveLength(1);
  });

  test('a zero delta normalizes the winding too', () => {
    // a zero delta is insignificant like any other below half a unit
    const square = makeSquare(0, 0, 100, true);
    const solution = Clipper.inflatePaths([square], 0, JoinType.Miter, EndType.Polygon);
    expect(solution).toEqual(Clipper.inflatePaths([square], 0.3, JoinType.Miter, EndType.Polygon));
    expect(Clipper.areaPaths(solution)).toBe(100 * 100);

    const squareD: PathsD = [Clipper.makePathD([0,0, 0,1, 1,1, 1,0])];
    const solutionD = Clipper.inflatePathsD(squareD, 0, JoinType.Miter, EndType.Polygon);
    expect(solutionD).toEqual(Clipper.inflatePathsD(squareD, 0.003, JoinType.Miter, EndType.Polygon));
    expect(Clipper.areaPathsD(solutionD)).toBeCloseTo(1, 12);
  });

  test('an open path is kept beside a clockwise polygon', () => {
    // every group's outers are wound positively
    const co = new ClipperOffset();
    co.addPath(Clipper.makePath([0,0, 0,100, 100,100, 100,0]), JoinType.Miter, EndType.Polygon);
    co.addPath(Clipper.makePath([0,500, 100,500]), JoinType.Miter, EndType.Butt);
    const solution: Paths64 = [];
    co.execute(10, solution);
    expect(Clipper.areaPaths(solution)).toBe(120 * 120 + 100 * 20);
  });

  test('a clockwise group offsets its points exactly as a counter-clockwise group does', () => {
    const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);
    const clockwiseSquare = Clipper.makePath([0,0, 0,100, 100,100, 100,0]);
    const point = Clipper.makePath([500,500]);

    for (const delta of [10, -10]) {
      const expected = Clipper.inflatePaths([square, point], delta, JoinType.Miter, EndType.Polygon);
      const solution = Clipper.inflatePaths([clockwiseSquare, point], delta, JoinType.Miter, EndType.Polygon);
      expect(solution).toHaveLength(expected.length);
      expect(Clipper.areaPaths(solution)).toBe(Clipper.areaPaths(expected));
    }
  });

  test('points and lines follow the sign of delta', () => {
    // points and lines have no area, so a positive delta grows them and a negative one erodes them away
    const point = Clipper.makePath([500,500]);
    const line = Clipper.makePath([500,500, 600,500]);
    const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);
    const innerLine = Clipper.makePath([30,50, 70,50]);
    const inflate = (paths: Paths64, delta: number, et: EndType = EndType.Polygon): Paths64 =>
      Clipper.inflatePaths(paths, delta, JoinType.Miter, et);

    expect(Clipper.areaPaths(inflate([point], 10))).toBe(400);
    expect(Clipper.areaPaths(inflate([line], 10))).toBe(2400);
    expect(inflate([point], -10)).toHaveLength(0);
    expect(inflate([line], -10)).toHaveLength(0);
    expect(Clipper.inflatePathsD([[{ x: 5.0, y: 5.0 }]], -1, JoinType.Miter, EndType.Polygon)).toHaveLength(0);

    // open paths are offset by their width, whatever the sign
    expect(Clipper.areaPaths(inflate([point], -10, EndType.Square))).toBe(400);
    expect(Clipper.areaPaths(inflate([line], -10, EndType.Square))).toBe(2400);

    // a bow-tie has no net area but is not flat, so it keeps growing as before
    const bowTie = Clipper.makePath([0,0, 100,100, 0,100, 100,0]);
    expect(Clipper.areaPaths(inflate([bowTie], -10))).toBe(5750);
    expect(Clipper.areaPaths(inflate([square, innerLine], -10))).toBe(Clipper.areaPaths(inflate([square], -10)));

    // this hole's area rounds to zero in floating point, but it is not flat and must survive
    const outer = Clipper.makePath([-100,999999900, 10000101,999999900, 10000101,1010000100, -100,1010000100]);
    const hole = Clipper.makePath([10000001,1010000000, 10000000,1009999999, 0,1000000000]);
    expect(inflate([outer, hole], -10)).toHaveLength(2);
  });

  test('a line that a callback grows at one end and erodes at the other keeps only its growth', () => {
    // the line's eroded end must not cut into the square
    const line = Clipper.makePath([0,0, 100,0]);
    const square = Clipper.makePath([-50,-50, 150,-50, 150,50, -50,50]);
    const deltaCb = (path: Path64, _norms: unknown, currIdx: number): number => {
      if (path.length !== 2) return 0.0;
      return (currIdx === 0) ? -20.0 : 10.0;
    };

    for (const joinType of [JoinType.Miter, JoinType.Square, JoinType.Bevel, JoinType.Round]) {
      const co = new ClipperOffset();
      co.addPaths([square, line], joinType, EndType.Polygon);
      const solution: Paths64 = [];
      co.executeWithCallback(deltaCb, solution);
      expect(Clipper.areaPaths(solution)).toBe(Clipper.area(square));

      // alone, the grown end survives
      co.clear();
      co.addPath(line, joinType, EndType.Polygon);
      co.executeWithCallback(deltaCb, solution);
      expect(Clipper.areaPaths(solution)).toBeGreaterThan(0);
    }
  });

  test('an insignificant delta drops open paths', () => {
    // an open path offset by less than half a unit has no width, so it must not be closed into a polygon
    const openPath = Clipper.makePath([200,0, 300,0, 300,100]);
    const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);

    for (const endType of [EndType.Joined, EndType.Butt, EndType.Square, EndType.Round]) {
      expect(Clipper.inflatePaths([openPath], 0.3, JoinType.Miter, endType)).toHaveLength(0);
      expect(Clipper.inflatePaths([openPath], 0, JoinType.Miter, endType)).toHaveLength(0);
      expect(Clipper.inflatePathsD([[{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }]], 0, JoinType.Miter, endType))
        .toHaveLength(0);

      const co = new ClipperOffset();
      co.addPath(square, JoinType.Miter, EndType.Polygon);
      co.addPath(openPath, JoinType.Miter, endType);
      const solution: Paths64 = [];
      co.execute(0.3, solution);
      expect(solution).toEqual(Clipper.inflatePaths([square], 0.3, JoinType.Miter, EndType.Polygon));
    }
  });
});
