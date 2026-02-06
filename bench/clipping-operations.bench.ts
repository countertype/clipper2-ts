import { bench, describe } from 'vitest';
import { Clipper64, PolyTree64, Clipper, ClipType, FillRule, type Paths64, type Path64 } from '../src';
import { testData, overlappingPairs } from './test-data';

describe('Union Operations', () => {
  bench('union - medium complex polygon', () => {
    const c = new Clipper64();
    c.addSubject([testData.mediumComplex]);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union - large complex polygon', () => {
    const c = new Clipper64();
    c.addSubject([testData.largeComplex]);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union - very large complex polygon (2000 vertices)', () => {
    const c = new Clipper64();
    c.addSubject([testData.veryLargeComplex]);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union - medium grid (25 rectangles)', () => {
    const c = new Clipper64();
    c.addSubject(testData.mediumGrid);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union - large grid (100 rectangles)', () => {
    const c = new Clipper64();
    c.addSubject(testData.largeGrid);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });
});

describe('Intersection Operations', () => {
  bench('intersection - medium overlapping polygons', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.medium.subject);
    c.addClip(overlappingPairs.medium.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Intersection, FillRule.NonZero, solution);
  });

  bench('intersection - large overlapping polygons', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.large.subject);
    c.addClip(overlappingPairs.large.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Intersection, FillRule.NonZero, solution);
  });

  bench('intersection - grid with rectangle', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.grid.subject);
    c.addClip(overlappingPairs.grid.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Intersection, FillRule.NonZero, solution);
  });
});

describe('Difference Operations', () => {
  bench('difference - medium overlapping polygons', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.medium.subject);
    c.addClip(overlappingPairs.medium.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Difference, FillRule.NonZero, solution);
  });

  bench('difference - large overlapping polygons', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.large.subject);
    c.addClip(overlappingPairs.large.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Difference, FillRule.NonZero, solution);
  });
});

describe('XOR Operations', () => {
  bench('xor - medium overlapping polygons', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.medium.subject);
    c.addClip(overlappingPairs.medium.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Xor, FillRule.NonZero, solution);
  });

  bench('xor - large overlapping polygons', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.large.subject);
    c.addClip(overlappingPairs.large.clip);
    const solution: Paths64 = [];
    c.execute(ClipType.Xor, FillRule.NonZero, solution);
  });
});

describe('Multiple Operations (stress test)', () => {
  bench('10 union operations on medium polygons', () => {
    for (let i = 0; i < 10; i++) {
      const c = new Clipper64();
      c.addSubject([testData.mediumComplex]);
      const solution: Paths64 = [];
      c.execute(ClipType.Union, FillRule.NonZero, solution);
    }
  });

  bench('10 intersection operations on medium polygons', () => {
    for (let i = 0; i < 10; i++) {
      const c = new Clipper64();
      c.addSubject(overlappingPairs.medium.subject);
      c.addClip(overlappingPairs.medium.clip);
      const solution: Paths64 = [];
      c.execute(ClipType.Intersection, FillRule.NonZero, solution);
    }
  });
});

describe('Convenience Functions', () => {
  bench('Clipper.union - medium grid', () => {
    Clipper.union(testData.mediumGrid, FillRule.NonZero);
  });

  bench('Clipper.intersect - medium overlapping', () => {
    Clipper.intersect(
      overlappingPairs.medium.subject,
      overlappingPairs.medium.clip,
      FillRule.NonZero
    );
  });

  bench('Clipper.difference - medium overlapping', () => {
    Clipper.difference(
      overlappingPairs.medium.subject,
      overlappingPairs.medium.clip,
      FillRule.NonZero
    );
  });
});

describe('Simple Union Operations', () => {
  const simpleRects: Paths64 = [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    [{ x: 150, y: 150 }, { x: 250, y: 150 }, { x: 250, y: 250 }, { x: 150, y: 250 }],
    [{ x: 300, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 100 }, { x: 300, y: 100 }]
  ];

  const twoOverlapping: Paths64 = [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }]
  ];

  const simplePath: Path64 = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    simplePath.push({
      x: Math.round(Math.cos(angle) * 50 + 100),
      y: Math.round(Math.sin(angle) * 50 + 100)
    });
  }
  const fourCircles: Paths64 = [
    simplePath,
    simplePath.map((p) => ({ x: p.x + 200, y: p.y })),
    simplePath.map((p) => ({ x: p.x, y: p.y + 200 })),
    simplePath.map((p) => ({ x: p.x + 200, y: p.y + 200 }))
  ];

  bench('union - 3 non-overlapping rectangles', () => {
    const c = new Clipper64();
    c.addSubject(simpleRects);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union - 2 overlapping rectangles', () => {
    const c = new Clipper64();
    c.addSubject(twoOverlapping);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('union - 4 simple circles (no self-intersection)', () => {
    const c = new Clipper64();
    c.addSubject(fourCircles);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });
});

describe('PolyTree Operations', () => {
  bench('polytree - medium grid union', () => {
    const c = new Clipper64();
    c.addSubject(testData.mediumGrid);
    const polytree = new PolyTree64();
    c.execute(ClipType.Union, FillRule.NonZero, polytree);
  });

  bench('polytree - nested rectangles', () => {
    const c = new Clipper64();
    c.addSubject([
      [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 }
      ]
    ]);
    c.addClip([
      [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 }
      ]
    ]);
    const polytree = new PolyTree64();
    c.execute(ClipType.Difference, FillRule.NonZero, polytree);
  });

  bench('polytree - complex overlapping', () => {
    const c = new Clipper64();
    c.addSubject(overlappingPairs.medium.subject);
    c.addClip(overlappingPairs.medium.clip);
    const polytree = new PolyTree64();
    c.execute(ClipType.Intersection, FillRule.NonZero, polytree);
  });
});

describe('Instance Reuse', () => {
  bench('fresh instance - 2 overlapping rectangles', () => {
    const c = new Clipper64();
    c.addSubject([
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }]
    ]);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  const reusedClipper = new Clipper64();
  const reusedSolution: Paths64 = [];
  bench('reused instance - 2 overlapping rectangles', () => {
    reusedClipper.clear();
    reusedClipper.addSubject([
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }]
    ]);
    reusedSolution.length = 0;
    reusedClipper.execute(ClipType.Union, FillRule.NonZero, reusedSolution);
  });

  bench('fresh polytree - nested rectangles', () => {
    const c = new Clipper64();
    c.addSubject([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]]);
    c.addClip([[{ x: 200, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 800 }, { x: 200, y: 800 }]]);
    const polytree = new PolyTree64();
    c.execute(ClipType.Difference, FillRule.NonZero, polytree);
  });

  const reusedClipperPT = new Clipper64();
  const reusedPolytree = new PolyTree64();
  bench('reused polytree - nested rectangles', () => {
    reusedClipperPT.clear();
    reusedClipperPT.addSubject([[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]]);
    reusedClipperPT.addClip([[{ x: 200, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 800 }, { x: 200, y: 800 }]]);
    reusedPolytree.clear();
    reusedClipperPT.execute(ClipType.Difference, FillRule.NonZero, reusedPolytree);
  });
});

describe('Geo-scale Coordinates', () => {
  const scale = 360_000;
  const geoComplex: Path64 = testData.mediumComplex.map(p => ({
    x: Math.round(p.x * scale),
    y: Math.round(p.y * scale)
  }));
  const geoComplexShifted: Path64 = geoComplex.map(p => ({
    x: p.x + Math.round(200 * scale),
    y: p.y + Math.round(200 * scale)
  }));

  bench('union - geo-scale complex polygon', () => {
    const c = new Clipper64();
    c.addSubject([geoComplex]);
    const solution: Paths64 = [];
    c.execute(ClipType.Union, FillRule.NonZero, solution);
  });

  bench('intersection - geo-scale overlapping', () => {
    const c = new Clipper64();
    c.addSubject([geoComplex]);
    c.addClip([geoComplexShifted]);
    const solution: Paths64 = [];
    c.execute(ClipType.Intersection, FillRule.NonZero, solution);
  });
});
