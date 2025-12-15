import { bench, describe } from 'vitest';
import { Clipper64, PolyTree64 } from '../src/Engine';
import { ClipType, FillRule, Path64, Paths64 } from '../src/Core';

// Bench: glyph "e" outline from DrawBot snippet (flattened to polyline)
// This models a font outline that may include self-intersections and
// benefits from running through Union to normalize

type Pt = { x: number; y: number };

function roundPt(p: Pt): Pt {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  // Bernstein basis
  return (mt * mt * mt) * p0 +
    (3 * mt * mt * t) * p1 +
    (3 * mt * t * t) * p2 +
    (t * t * t) * p3;
}

function addPt(path: Path64, x: number, y: number): void {
  const len = path.length;
  if (len > 0) {
    const prev = path[len - 1];
    if (prev.x === x && prev.y === y) return;
  }
  path.push({ x, y, z: 0 });
}

function flattenCubic(path: Path64, p0: Pt, c1: Pt, c2: Pt, p3: Pt, steps: number): void {
  // Add points excluding p0 (assumed already present), including p3
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = cubicAt(p0.x, c1.x, c2.x, p3.x, t);
    const y = cubicAt(p0.y, c1.y, c2.y, p3.y, t);
    const rp = roundPt({ x, y });
    addPt(path, rp.x, rp.y);
  }
}

function buildGlyphEFlat(stepsPerCurve: number): Path64 {
  const out: Path64 = [];

  // moveTo(375,576)
  addPt(out, 375, 576);

  // lineTo(375,576) duplicate (ignored by addPt)
  addPt(out, 375, 576);

  // lineTo(853,576)
  addPt(out, 853, 576);

  // curveTo((861,604),(867,658),(867,750))
  flattenCubic(out, { x: 853, y: 576 }, { x: 861, y: 604 }, { x: 867, y: 658 }, { x: 867, y: 750 }, stepsPerCurve);

  // curveTo((864,976),(729,1116),(502,1116))
  flattenCubic(out, { x: 867, y: 750 }, { x: 864, y: 976 }, { x: 729, y: 1116 }, { x: 502, y: 1116 }, stepsPerCurve);

  // curveTo((238,1116),(50,913),(50,584))
  flattenCubic(out, { x: 502, y: 1116 }, { x: 238, y: 1116 }, { x: 50, y: 913 }, { x: 50, y: 584 }, stepsPerCurve);

  // curveTo((50,267),(190,50),(489,50))
  flattenCubic(out, { x: 50, y: 584 }, { x: 50, y: 267 }, { x: 190, y: 50 }, { x: 489, y: 50 }, stepsPerCurve);

  // curveTo((647,50),(791,133),(839,199))
  flattenCubic(out, { x: 489, y: 50 }, { x: 647, y: 50 }, { x: 791, y: 133 }, { x: 839, y: 199 }, stepsPerCurve);

  // lineTo((817,258))
  addPt(out, 817, 258);

  // curveTo((769,213),(685,182),(630,182))
  flattenCubic(out, { x: 817, y: 258 }, { x: 769, y: 213 }, { x: 685, y: 182 }, { x: 630, y: 182 }, stepsPerCurve);

  // curveTo((454,182),(390,358),(387,598))
  flattenCubic(out, { x: 630, y: 182 }, { x: 454, y: 182 }, { x: 390, y: 358 }, { x: 387, y: 598 }, stepsPerCurve);

  // curveTo((382,995),(425,1061),(487,1061))
  flattenCubic(out, { x: 387, y: 598 }, { x: 382, y: 995 }, { x: 425, y: 1061 }, { x: 487, y: 1061 }, stepsPerCurve);

  // curveTo((541,1061),(563,994),(563,771))
  flattenCubic(out, { x: 487, y: 1061 }, { x: 541, y: 1061 }, { x: 563, y: 994 }, { x: 563, y: 771 }, stepsPerCurve);

  // lineTo((563,609))
  addPt(out, 563, 609);

  // lineTo((710,652))
  addPt(out, 710, 652);

  // lineTo((373,631))
  addPt(out, 373, 631);

  // closePath() back to (375,576)
  addPt(out, 375, 576);

  // Clipper will handle the duplicated closing vertex if present
  return out;
}

// Precompute so we measure clipping, not curve flattening.
const glyphE16: Path64 = buildGlyphEFlat(16);
const glyphE64: Path64 = buildGlyphEFlat(64);

describe('Glyph: e (flattened outline)', () => {
  bench('union - glyph e (16 steps/curve)', () => {
    const c = new Clipper64();
    c.addSubject([glyphE16]);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union (polytree) - glyph e (16 steps/curve)', () => {
    const c = new Clipper64();
    c.addSubject([glyphE16]);
    const polytree = new PolyTree64();
    c.execute(ClipType.Union, FillRule.NonZero, polytree);
  });

  bench('union (polytree) - glyph e (64 steps/curve)', () => {
    const c = new Clipper64();
    c.addSubject([glyphE64]);
    const polytree = new PolyTree64();
    c.execute(ClipType.Union, FillRule.NonZero, polytree);
  });

  // Replicated work inside one benchmark iteration to reduce noise when the
  // single execute is too fast relative to harness overhead
  bench('union (polytree) x10 - glyph e (16 steps/curve)', () => {
    for (let i = 0; i < 10; i++) {
      const c = new Clipper64();
      c.addSubject([glyphE16]);
      const polytree = new PolyTree64();
      c.execute(ClipType.Union, FillRule.NonZero, polytree);
    }
  });
});


