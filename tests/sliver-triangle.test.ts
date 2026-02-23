import { describe, test, expect } from 'vitest';
import { Clipper64, ClipType, FillRule, Paths64, Clipper } from '../src';

describe('Sliver triangle union bug (Issue #1067)', () => {
  test('union with sliver triangles should not produce area outside input polygons', () => {
    // From https://github.com/AngusJohnson/Clipper2/issues/1067
    // poly1: one triangle as subject
    const poly1: Paths64 = [
      [
        { x: -45077288, y: -27835646 },
        { x: -45216220, y: -27853069 },
        { x: -44996290, y: -28378125 },
      ],
    ];

    // poly2: four triangles as clip (two are slivers with near-zero area)
    const poly2: Paths64 = [
      // Sliver
      [
        { x: -45943111, y: -27944226 },
        { x: -45990276, y: -27890686 },
        { x: -46034753, y: -27840198 },
      ],
      // Sliver
      [
        { x: -44185329, y: -29939581 },
        { x: -45679436, y: -28243538 },
        { x: -47826654, y: -25806113 },
      ],
      // Big triangle
      [
        { x: -48000000, y: -29000000 },
        { x: -44185329, y: -29939581 },
        { x: -47826654, y: -25806113 },
      ],
      // Small triangle
      [
        { x: -45679436, y: -28243538 },
        { x: -45514581, y: -27890485 },
        { x: -45943111, y: -27944226 },
      ],
    ];

    // Compute total area of all input polygons
    let inputArea = 0;
    for (const path of poly1) {
      inputArea += Math.abs(Clipper.area(path));
    }
    for (const path of poly2) {
      inputArea += Math.abs(Clipper.area(path));
    }

    const clipper = new Clipper64();
    clipper.addSubject(poly1);
    clipper.addClip(poly2);
    const result: Paths64 = [];
    clipper.execute(ClipType.Union, FillRule.NonZero, result);

    // Compute result area
    let resultArea = 0;
    for (const path of result) {
      resultArea += Math.abs(Clipper.area(path));
    }

    // The union area should never exceed the sum of input polygon areas.
    // The bug causes the result to contain a large area not present in the input.
    // Allow a small tolerance for rounding.
    const tolerance = inputArea * 0.01; // 1% tolerance for rounding
    expect(resultArea).toBeLessThanOrEqual(inputArea + tolerance);
  });
});
