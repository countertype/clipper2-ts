import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { Clipper64, ClipType, FillRule, areaPaths, union, type Paths64 } from '../src';

const input: Paths64 = JSON.parse(readFileSync(new URL('./test-data/union-blowup-minimal.json', import.meta.url), 'utf8'));

describe('horizontal edge direction changes', () => {
  for (const reverse of [false, true]) for (const mirror of [false, true]) {
    for (const mixed of [false, true]) for (const preserve of [false, true]) {
      test(`spikes reverse=${reverse} mirror=${mirror} open=${mixed} preserve=${preserve}`, () => {
        const paths = input.map(r => {
          const p = r.map(({x,y}) => ({x: mirror ? -x : x, y}));
          return reverse ? p.reverse() : p;
        });
        const clipper = new Clipper64();
        clipper.preserveCollinear = preserve;
        clipper.addSubject(paths);
        // Select the general horizontal path as well as the closed-only fast path.
        if (mixed) clipper.addOpenSubject([[{x:0,y:0},{x:10,y:0}]]);
        const closed: Paths64 = [], open: Paths64 = [];
        expect(clipper.execute(ClipType.Union, FillRule.NonZero, closed, open)).toBe(true);
        expect(closed).toHaveLength(1);
        expect(areaPaths(closed)).toBe(13.5);
        expect(closed[0].every(p => p.y === 2463086 || p.y === 2463087)).toBe(true);
        expect(open).toHaveLength(mixed ? 1 : 0);
      });
    }
  }
  test('public union accepts the uncleaned spike ring', () => {
    expect(areaPaths(union(input, FillRule.NonZero))).toBe(13.5);
  });
});
