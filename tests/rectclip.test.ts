import { describe, test, expect } from 'vitest';
import {
  Clipper, FillRule, rectClip, rectClipLines, intersect, areaPaths, isPositive,
  type Path64, type Paths64, type Point64, type Rect64,
} from '../src';

describe('RectClip', () => {
  // https://github.com/countertype/clipper2-ts/issues/37
  describe('path entering through a vertex on the rect edge (#37)', () => {
    const rect: Rect64 = { left: 0, top: 0, right: 10, bottom: 10 };
    const rectPath = Clipper.makePath([0,0, 10,0, 10,10, 0,10]);
    // (5,10) lies on the bottom edge; (30,15) is outside
    const base = Clipper.makePath([5,10, 5,5, 30,15]);

    const rotations: Path64[] = [0, 1, 2].map(k => [...base.slice(k), ...base.slice(0, k)]);
    const variants: [string, Path64][] = [
      ...rotations.map((p, k): [string, Path64] => [`rotation ${k}`, p]),
      ...rotations.map((p, k): [string, Path64] => [`reversed rotation ${k}`, [...p].reverse()]),
    ];

    for (const [name, path] of variants) {
      test(`matches intersect (${name})`, () => {
        const clipped = rectClip(rect, [path]);
        const reference = intersect([path], [rectPath], FillRule.EvenOdd);
        expect(Math.abs(areaPaths(clipped))).toBe(20);
        expect(Math.abs(areaPaths(clipped))).toBe(Math.abs(areaPaths(reference)));
        // the corner (10,10) must be present
        expect(clipped[0].some(p => p.x === 10 && p.y === 10)).toBe(true);
      });
    }

    test('scaling does not change the result', () => {
      for (const s of [10, 1000]) {
        const path = Clipper.scalePath(base, s);
        const r: Rect64 = { left: 0, top: 0, right: 10 * s, bottom: 10 * s };
        expect(Math.abs(areaPaths(rectClip(r, [path])))).toBe(20 * s * s);
      }
    });
  });

  // https://github.com/AngusJohnson/Clipper2/pull/1114 (upstream #1095)
  // Rounding in the general line intersection could leave an intersection one
  // unit inside the rectangle side. The coordinate on the side must be exact.
  describe('intersections stay exactly on the boundary (#1095)', () => {
    interface Transform { name: string; transpose: boolean; reflectX: boolean; reflectY: boolean; reverse: boolean; dx: number; dy: number }
    const transforms: Transform[] = [
      { name: 'seed', transpose: false, reflectX: false, reflectY: false, reverse: false, dx: 0, dy: 0 },
      { name: 'reversed', transpose: false, reflectX: false, reflectY: false, reverse: true, dx: 0, dy: 0 },
      { name: 'reflect-x', transpose: false, reflectX: true, reflectY: false, reverse: false, dx: 0, dy: 0 },
      { name: 'transposed-translated', transpose: true, reflectX: false, reflectY: false, reverse: false, dx: 7000000, dy: -9000000 },
      { name: 'transposed-reflect-y-translated', transpose: true, reflectX: false, reflectY: true, reverse: false, dx: 7000000, dy: -9000000 },
    ];

    const baseRect: Rect64 = { left: 19669914, top: -390330085, right: 24669914, bottom: -385330085 };
    const baseSubject = Clipper.makePath([
      8821540, -379573701,
      27274660, -333900624,
      72947737, -352353745,
      54494616, -398026821,
    ]);

    function transformPoint(pt: Point64, rect: Rect64, t: Transform): Point64 {
      let { x, y } = pt;
      let r = rect;
      if (t.transpose) {
        [x, y] = [y, x];
        r = { left: rect.top, top: rect.left, right: rect.bottom, bottom: rect.right };
      }
      if (t.reflectX) x = r.left + r.right - x;
      if (t.reflectY) y = r.top + r.bottom - y;
      return { x: x + t.dx, y: y + t.dy };
    }

    function transformRect(rect: Rect64, t: Transform): Rect64 {
      const r = t.transpose
        ? { left: rect.top, top: rect.left, right: rect.bottom, bottom: rect.right }
        : { ...rect };
      return { left: r.left + t.dx, top: r.top + t.dy, right: r.right + t.dx, bottom: r.bottom + t.dy };
    }

    const onVertical = (pt: Point64, r: Rect64) =>
      (pt.x === r.left || pt.x === r.right) && pt.y > r.top && pt.y < r.bottom;
    const onHorizontal = (pt: Point64, r: Rect64) =>
      (pt.y === r.top || pt.y === r.bottom) && pt.x > r.left && pt.x < r.right;

    function makeCase(t: Transform) {
      const rect = transformRect(baseRect, t);
      const corner = transformPoint({ x: 24669914, y: -385330085 }, baseRect, t);
      const hit1 = transformPoint({ x: 24669914, y: -385976859 }, baseRect, t);
      const hit2 = transformPoint({ x: 23069090, y: -385330085 }, baseRect, t);
      const verticalHit = onVertical(hit1, rect) ? hit1 : hit2;
      const horizontalHit = onHorizontal(hit1, rect) ? hit1 : hit2;
      let subject = baseSubject.map(p => transformPoint(p, baseRect, t));
      if (t.reverse) subject = subject.reverse();
      return { rect, subject, corner, verticalHit, horizontalHit };
    }

    // The free coordinate may differ by one unit after reflection; the
    // coordinate on the rectangle side must match exactly.
    function expectBoundaryClip(solution: Paths64, c: ReturnType<typeof makeCase>, isPolygon: boolean): void {
      expect(solution).toHaveLength(1);
      const path = solution[0];
      expect(path).toHaveLength(isPolygon ? 3 : 2);
      let vertical = 0, horizontal = 0, corners = 0;
      for (const pt of path) {
        if (pt.x === c.verticalHit.x && Math.abs(pt.y - c.verticalHit.y) <= 1) vertical++;
        else if (pt.y === c.horizontalHit.y && Math.abs(pt.x - c.horizontalHit.x) <= 1) horizontal++;
        else if (isPolygon && pt.x === c.corner.x && pt.y === c.corner.y) corners++;
        else expect.fail(`unexpected point (${pt.x}, ${pt.y})`);
      }
      expect(vertical).toBe(1);
      expect(horizontal).toBe(1);
      if (isPolygon) expect(corners).toBe(1);
    }

    for (const t of transforms) {
      test(`polygon: ${t.name}`, () => {
        const c = makeCase(t);
        const solution = rectClip(c.rect, [c.subject]);
        expectBoundaryClip(solution, c, true);
        expect(isPositive(solution[0])).toBe(isPositive(c.subject));
      });

      test(`line: ${t.name}`, () => {
        const c = makeCase(t);
        const edge: Path64 = [c.subject[c.subject.length - 1], c.subject[0]];
        expectBoundaryClip(rectClipLines(c.rect, edge), c, false);
      });
    }
  });

  describe('rectClipLines controls', () => {
    const rect: Rect64 = { left: 10, top: 10, right: 20, bottom: 20 };

    test('lines touching only a corner or running outside are dropped', () => {
      expect(rectClipLines(rect, Clipper.makePath([0,0, 10,10]))).toEqual([]);
      expect(rectClipLines(rect, Clipper.makePath([0,5, 30,5]))).toEqual([]);
    });

    test('diagonal through opposite corners', () => {
      const out = rectClipLines(rect, Clipper.makePath([0,0, 30,30]));
      expect(out).toHaveLength(1);
      expect(out[0].map(p => [p.x, p.y])).toEqual([[10, 10], [20, 20]]);
    });

    test('line along a side is kept', () => {
      const out = rectClipLines(rect, Clipper.makePath([20,12, 20,18]));
      expect(out).toHaveLength(1);
      expect(out[0].map(p => [p.x, p.y])).toEqual([[20, 12], [20, 18]]);
    });

    test('empty rectangles produce nothing', () => {
      expect(rectClipLines({ left: 10, top: 10, right: 10, bottom: 20 }, Clipper.makePath([5,15, 15,15]))).toEqual([]);
      expect(rectClip({ left: 10, top: 10, right: 20, bottom: 10 }, [Clipper.makePath([5,5, 25,5, 25,15])])).toEqual([]);
    });
  });
});
