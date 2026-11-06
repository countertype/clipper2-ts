/**
 * https://github.com/AngusJohnson/Clipper2/issues/1085
 * Union of four overlapping subjects produces one ring joined by a zero-width
 * bridge (a repeated vertex) where two rings are expected. A second union of
 * the result gives the expected two rings.
 */
import { describe, expect, it } from 'vitest';
import { Clipper, FillRule, type Path64, type Paths64 } from '../src';

const subject: Paths64 = [
  Clipper.makePath([420, -270, 500, 0, 470, 100, 0, 100, 0, -483, 207, -454]),
  Clipper.makePath([0, 100, 370, 100, 400, 0, 336, -216, 166, -363, 0, -386]),
  Clipper.makePath([252, -162, 300, 0, 270, 100, 0, 100, 0, -289, 124, -272]),
  Clipper.makePath([0, 100, 170, 100, 200, 0, 168, -108, 83, -181, 0, -192]),
];

function hasRepeatedVertex(path: Path64): boolean {
  const seen = new Set<string>();
  for (const pt of path) {
    const key = `${pt.x},${pt.y}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

describe('Clipper2 issue #1085 (union zero-width bridge)', () => {
  // Known failure, open upstream and in this port. Remove `.fails` once fixed.
  it.fails('union yields two rings with no repeated vertex', () => {
    const out = Clipper.union(subject, FillRule.NonZero);
    expect(out).toHaveLength(2);
    for (const path of out) expect(hasRepeatedVertex(path)).toBe(false);
  });

  it('a second union of the result yields the two rings', () => {
    const once = Clipper.union(subject, FillRule.NonZero);
    const twice = Clipper.union(once, FillRule.NonZero);
    expect(twice).toHaveLength(2);
    for (const path of twice) expect(hasRepeatedVertex(path)).toBe(false);
    expect(Clipper.areaPaths(twice)).toBe(Clipper.areaPaths(once));
  });
});
