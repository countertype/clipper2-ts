// Regression tests ported from PolyClipping/Clipper2 (CPP/Tests/TestPolygons.cpp
// and TestRectClip.cpp) for the fixes to how intersection points are rounded
// and ordered: ec5f2d4, f774daf, 4a3bf64 and 2b32367.
// https://github.com/PolyClipping/Clipper2/issues/13
import { describe, test, expect } from 'vitest';
import { Clipper, FillRule, type Paths64 } from '../src';

describe('intersection rounding and ordering (PolyClipping/Clipper2 #13)', () => {
  // ec5f2d4
  test('xor of paths sharing edges that diverge by less than half a unit', () => {
    // the paths share edges that diverge at 33889,18931 by less than half a unit for several scanbeams
    const subject: Paths64 = [Clipper.makePath([
      97513,3213, 97542,3449, 97548,169199, 97559,169465, 97626,170263, 97663,170547, 97747,170984, 97915,171671,
      97999,171956, 98156,172387, 98420,173010, 98536,173254, 98766,173674, 99129,174259, 99290,174494, 99585,174873,
      100292,175675, 133417,208800, 133586,209021, 133442,209203, 129002,213655, 128782,213824, 128600,213682,
      7772,92854, 7604,92634, 7752,92446, 13507,86686, 13738,86509, 14008,86472, 26760,86465, 27036,86453,
      27811,86385, 28080,86349, 28535,86262, 29186,86101, 29446,86025, 29917,85856, 30530,85596, 30783,85475,
      31229,85228, 31842,84841, 32182,84600, 32810,84072, 33032,83862, 33342,83530, 33958,82797, 34128,82575,
      34408,82159, 34675,81711, 34805,81471, 35000,81054, 35259,80418, 35352,80157, 35483,79709, 35634,79071,
      35688,78786, 35750,78289, 35820,77190, 35816,24593, 35807,24353, 35739,23457, 35684,23032, 35633,22770,
      35468,22076, 35370,21745, 35176,21200, 35042,20881, 34747,20272, 34566,19941, 34037,19135, 33889,18931,
      33621,18600, 32723,17588, 32698,3608, 32710,3376, 32737,3177, 97246,3177
    ])];
    const clip: Paths64 = [Clipper.makePath([
      97512,3212, 97542,3449, 97548,169199, 97559,169465, 97626,170263, 97663,170547, 97747,170984, 97915,171671,
      97999,171956, 98156,172387, 98420,173010, 98536,173254, 98766,173674, 99129,174259, 99290,174494, 99585,174873,
      100292,175675, 133417,208800, 133586,209021, 133442,209203, 129002,213655, 128782,213824, 128600,213682,
      7772,92854, 7604,92634, 7752,92446, 13507,86686, 13738,86509, 14008,86472, 26760,86465, 27036,86453,
      27811,86385, 28080,86349, 28535,86262, 29186,86101, 29446,86025, 29917,85856, 30530,85596, 30783,85475,
      31229,85228, 31842,84841, 32182,84600, 32810,84072, 33032,83862, 33342,83530, 33958,82797, 34128,82575,
      34408,82159, 34675,81711, 34805,81471, 35000,81054, 35259,80418, 35352,80157, 35483,79709, 35634,79071,
      35688,78786, 35750,78289, 35820,77190, 35816,24593, 35807,24353, 35739,23457, 35684,23032, 35633,22770,
      35468,22076, 35370,21745, 35176,21200, 35042,20881, 34747,20272, 34566,19941, 34037,19135, 33889,18931,
      33622,18601, 33118,18033, 33040,17609, 33017,3570, 33032,3337, 33058,3177, 97246,3177
    ])];

    const solution = Clipper.xor(subject, clip, FillRule.EvenOdd);
    const swapped = Clipper.xor(clip, subject, FillRule.EvenOdd);
    expect(solution.length).toBeGreaterThan(0);
    expect(swapped.length).toBeGreaterThan(0);
    for (const path of solution) expect(Clipper.isPositive(path)).toBe(true);
    for (const path of swapped) expect(Clipper.isPositive(path)).toBe(true);
    expect(Clipper.areaPaths(solution)).toBe(Clipper.areaPaths(swapped));
  });

  // f774daf
  test('difference rounds its intersection points', () => {
    // the exact difference has an area of 3.27; truncating its intersection points
    // reversed the only contour to an area of -3.5
    const subject: Paths64 = [Clipper.makePath([0,10, 5,2, 7,1])];
    const clip: Paths64 = [Clipper.makePath([3,6, 6,1, 11,11])];
    const solution = Clipper.difference(subject, clip, FillRule.NonZero);

    expect(solution).toHaveLength(1);
    expect(Clipper.isPositive(solution[0])).toBe(true);
    expect(Math.abs(Clipper.areaPaths(solution) - 3.27)).toBeLessThanOrEqual(1);
  });

  // f774daf
  test('rectClip rounds a shared edge the same way in both directions', () => {
    // the shared edge crosses the top of the rect at exactly x = 7.5, and the two triangles
    // give it in opposite directions, so both must round that crossing to the same point
    const rect = { left: -10, top: 115, right: 30, bottom: 150 };
    const adjacent: Paths64 = [
      Clipper.makePath([0,100, 11,122, 0,144]),
      Clipper.makePath([11,122, 0,100, 11,78])
    ];
    const separate = Clipper.rectClip(rect, adjacent);
    const merged = Clipper.rectClip(rect, Clipper.union(adjacent, FillRule.NonZero));
    expect(Clipper.areaPaths(separate)).toBe(Clipper.areaPaths(merged));
  });

  // 4a3bf64
  test('union keeps a clamped intersection inside the scanbeam', () => {
    // the clip edge leaving -28785,-61 starts almost on the subject's flat edge, so their intersection
    // is computed just below the scanbeam, and clamping it used to leave it 6 units before that vertex
    const subject: Paths64 = [Clipper.makePath([-69425,73, -33569,-35, -24000,-87])];
    const clip: Paths64 = [Clipper.makePath([-3862,183, -33569,-35, -28785,-61, -26393,-75, -24000,-87])];
    const solution = Clipper.union(subject, clip, FillRule.EvenOdd);

    expect(solution).toHaveLength(1);
    expect(solution[0]).toHaveLength(4);
    expect(Clipper.areaPaths(solution)).toBe(2230933);
  });

  // 2b32367
  test('difference clamps an intersection to its segment', () => {
    // the lines of two edges cross just beyond the subject vertex at 6,6
    const subject: Paths64 = [Clipper.makePath([6,6, 8,2, 2,12, 3,7, 12,4])];
    const clip: Paths64 = [Clipper.makePath([10,3, 7,12, 3,1, 2,11, 11,2, 1,8])];
    const solution = Clipper.difference(subject, clip, FillRule.EvenOdd);
    for (const path of solution) expect(Clipper.isPositive(path)).toBe(true);
  });
});
