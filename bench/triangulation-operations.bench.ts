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

describe('Triangulation Operations', () => {
  bench('triangulate - medium complex', () => {
    Clipper.triangulate(smallPaths);
  });

  bench('triangulate - geo complex', () => {
    Clipper.triangulate(geoPaths);
  });
});
