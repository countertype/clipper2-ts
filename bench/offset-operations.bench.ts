import { beforeAll, bench, describe } from 'vitest';
import { ClipperOffset, JoinType, EndType, Clipper, type Paths64 } from '../src';
import { testData } from './test-data';
import { logBenchStatsHeader, runStabilityCheck } from './bench-stats';

const inflateMediumCircle = (): void => {
  const co = new ClipperOffset();
  co.addPath(testData.mediumCircle, JoinType.Round, EndType.Polygon);
  const solution: Paths64 = [];
  co.execute(10, solution);
};

const inflateMediumComplex = (): void => {
  const co = new ClipperOffset();
  co.addPath(testData.mediumComplex, JoinType.Round, EndType.Polygon);
  const solution: Paths64 = [];
  co.execute(10, solution);
};

const deflateMediumComplex = (): void => {
  const co = new ClipperOffset();
  co.addPath(testData.mediumComplex, JoinType.Round, EndType.Polygon);
  const solution: Paths64 = [];
  co.execute(-10, solution);
};

beforeAll(() => {
  logBenchStatsHeader();
  runStabilityCheck('inflate - medium circle', inflateMediumCircle);
  runStabilityCheck('inflate - medium complex polygon', inflateMediumComplex);
  runStabilityCheck('deflate - medium complex polygon', deflateMediumComplex);
});

describe('Offset Operations', () => {
  bench('inflate - medium circle', () => {
    inflateMediumCircle();
  });

  bench('inflate - large circle', () => {
    const co = new ClipperOffset();
    co.addPath(testData.largeCircle, JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
  });

  bench('inflate - medium complex polygon', () => {
    inflateMediumComplex();
  });

  bench('inflate - large complex polygon', () => {
    const co = new ClipperOffset();
    co.addPath(testData.largeComplex, JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
  });

  bench('inflate - medium grid', () => {
    const co = new ClipperOffset();
    co.addPaths(testData.mediumGrid, JoinType.Square, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(5, solution);
  });

  bench('deflate - medium complex polygon', () => {
    deflateMediumComplex();
  });

  bench('deflate - large complex polygon', () => {
    const co = new ClipperOffset();
    co.addPath(testData.largeComplex, JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(-10, solution);
  });
});

describe('Different Join Types', () => {
  bench('inflate - miter join', () => {
    const co = new ClipperOffset(2.0);
    co.addPath(testData.mediumComplex, JoinType.Miter, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
  });

  bench('inflate - round join', () => {
    const co = new ClipperOffset(2.0);
    co.addPath(testData.mediumComplex, JoinType.Round, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
  });

  bench('inflate - bevel join', () => {
    const co = new ClipperOffset(2.0);
    co.addPath(testData.mediumComplex, JoinType.Bevel, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
  });

  bench('inflate - square join', () => {
    const co = new ClipperOffset(2.0);
    co.addPath(testData.mediumComplex, JoinType.Square, EndType.Polygon);
    const solution: Paths64 = [];
    co.execute(10, solution);
  });
});

describe('Convenience Functions', () => {
  bench('Clipper.inflatePaths - medium complex', () => {
    Clipper.inflatePaths(
      [testData.mediumComplex],
      10,
      JoinType.Round,
      EndType.Polygon
    );
  });

  bench('Clipper.inflatePaths - large complex', () => {
    Clipper.inflatePaths(
      [testData.largeComplex],
      10,
      JoinType.Round,
      EndType.Polygon
    );
  });

  bench('Clipper.inflatePaths - medium grid', () => {
    Clipper.inflatePaths(
      testData.mediumGrid,
      5,
      JoinType.Square,
      EndType.Polygon
    );
  });
});

describe('Multiple Offset Operations', () => {
  bench('10 inflate operations on medium polygon', () => {
    for (let i = 0; i < 10; i++) {
      const co = new ClipperOffset();
      co.addPath(testData.mediumComplex, JoinType.Round, EndType.Polygon);
      const solution: Paths64 = [];
      co.execute(10, solution);
    }
  });

  bench('10 deflate operations on medium polygon', () => {
    for (let i = 0; i < 10; i++) {
      const co = new ClipperOffset();
      co.addPath(testData.mediumComplex, JoinType.Round, EndType.Polygon);
      const solution: Paths64 = [];
      co.execute(-10, solution);
    }
  });
});
