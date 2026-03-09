import { bench, describe } from 'vitest';
import { Clipper } from '../src/Clipper';
import { testData } from './test-data';

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

const smallPaths = [testData.mediumComplex];
const geoPaths = [scalePath(testData.mediumComplex, 360000)];
const largePaths = [testData.largeComplex];
const largeGeoPaths = [scalePath(testData.largeComplex, 360000)];
const veryLargePaths = [testData.veryLargeComplex];
const veryLargeGeoPaths = [scalePath(testData.veryLargeComplex, 360000)];

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
});
