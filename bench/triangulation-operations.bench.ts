import { bench, describe } from 'vitest';
import { Clipper } from '../src/Clipper';
import { testData, generatePolygonWithHoles } from './test-data';
import type { Paths64 } from '../src';

function scalePath(path: { x: number; y: number }[], scale: number) {
  const result: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    result.push({
      x: Math.round(pt.x * scale),
      y: Math.round(pt.y * scale),
      z: 0
    });
  }
  return result;
}

function scalePaths(paths: Paths64, scale: number): Paths64 {
  return paths.map(p => scalePath(p, scale));
}

const smallPaths = [testData.mediumComplex];
const geoPaths = [scalePath(testData.mediumComplex, 360000)];
const largePaths = [testData.largeComplex];
const largeGeoPaths = [scalePath(testData.largeComplex, 360000)];
const veryLargePaths = [testData.veryLargeComplex];
const veryLargeGeoPaths = [scalePath(testData.veryLargeComplex, 360000)];

const h10 = generatePolygonWithHoles(500, 80, 10, 40, 16);
const holes10: Paths64 = [h10.outer, ...h10.holes];
const holes10Geo = scalePaths(holes10, 360000);

const h50 = generatePolygonWithHoles(2000, 200, 50, 80, 16);
const holes50: Paths64 = [h50.outer, ...h50.holes];
const holes50Geo = scalePaths(holes50, 360000);

describe('Triangulation Operations', () => {
  bench('triangulate - 100 verts', () => {
    Clipper.triangulate(smallPaths);
  });

  bench('triangulate - 100 verts geo', () => {
    Clipper.triangulate(geoPaths);
  });

  bench('triangulate - 500 verts', () => {
    Clipper.triangulate(largePaths);
  });

  bench('triangulate - 500 verts geo', () => {
    Clipper.triangulate(largeGeoPaths);
  });

  bench('triangulate - 2000 verts', () => {
    Clipper.triangulate(veryLargePaths);
  });

  bench('triangulate - 2000 verts geo', () => {
    Clipper.triangulate(veryLargeGeoPaths);
  });

  bench('triangulate - 10 holes (240 verts)', () => {
    Clipper.triangulate(holes10);
  });

  bench('triangulate - 10 holes geo', () => {
    Clipper.triangulate(holes10Geo);
  });

  bench('triangulate - 50 holes (1000 verts)', () => {
    Clipper.triangulate(holes50);
  });

  bench('triangulate - 50 holes geo', () => {
    Clipper.triangulate(holes50Geo);
  });
});
