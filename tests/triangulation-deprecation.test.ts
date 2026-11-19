// Triangulation is deprecated (issue #41). It warns once per process the first
// time it is used, through Node's deprecation warnings.
import { test, expect } from 'vitest';
import { Clipper, triangulate, triangulateD, Delaunay, TriangulateResult } from '../src';

test('triangulation warns that it is deprecated, once', async () => {
  const warnings: Error[] = [];
  const onWarning = (w: Error): void => { warnings.push(w); };
  process.on('warning', onWarning);

  try {
    const square = [Clipper.makePath([0,0, 100,0, 100,100, 0,100])];
    expect(triangulate(square).result).toBe(TriangulateResult.success);
    triangulate(square);
    triangulateD([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]], 2);
    new Delaunay().execute(square);

    // warnings are emitted on the next tick
    await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    process.off('warning', onWarning);
  }

  const ours = warnings.filter(w => (w as Error & { code?: string }).code === 'CLIPPER2TS_TRIANGULATION');
  expect(ours).toHaveLength(1);
  expect(ours[0].name).toBe('DeprecationWarning');
  expect(ours[0].message).toContain('triangulation is deprecated');
  expect(ours[0].message).toContain('issues/41');
});
