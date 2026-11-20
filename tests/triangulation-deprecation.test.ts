// Triangulation is deprecated (issue #41). It warns once per process the first
// time it is used, through Node's deprecation warnings.
import { test, expect, vi } from 'vitest';
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

test('under --throw-deprecation the warning goes to console.warn instead of being thrown', async () => {
  // Node throws a DeprecationWarning on a later tick under that flag, where no caller can catch it
  const proc = process as unknown as { throwDeprecation?: boolean };
  const before = proc.throwDeprecation;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const warnings: Error[] = [];
  const onWarning = (w: Error): void => { warnings.push(w); };
  process.on('warning', onWarning);

  try {
    proc.throwDeprecation = true;
    vi.resetModules(); // a fresh copy of the module, which has not warned yet
    const fresh = await import('../src');
    const square = [fresh.Clipper.makePath([0,0, 100,0, 100,100, 0,100])];
    expect(fresh.triangulate(square).result).toBe(fresh.TriangulateResult.success);
    fresh.triangulate(square);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('triangulation is deprecated');
    expect(warnings.filter(w => (w as Error & { code?: string }).code === 'CLIPPER2TS_TRIANGULATION'))
      .toHaveLength(0);
  } finally {
    proc.throwDeprecation = before;
    process.off('warning', onWarning);
    warn.mockRestore();
  }
});
