// Exercise the package.json exports map through Node's own loaders rather than
// Vitest's source resolver. A package can reference itself by name when it has
// an "exports" field, so no pack or install is needed. Requires a built dist/
// (the prepare script builds it on npm install).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const supportsRequireEsm = Boolean(process.features.require_module);

// A real operation ensures the entry point loads its dependency graph too.
const checkIntersection = `
  const square = (x, y) => [
    { x, y }, { x: x + 10, y },
    { x: x + 10, y: y + 10 }, { x, y: y + 10 },
  ];
  const result = clipper.intersect([square(0, 0)], [square(5, 5)], clipper.FillRule.NonZero);
  assert.equal(Math.abs(clipper.areaPaths(result)), 25);
`;

// Runs source with Node in the package root. On failure the child's stderr
// (the loader's own message) is included in the thrown error.
function node(source: string, mode: 'module' | 'commonjs'): void {
  try {
    execFileSync(process.execPath, [`--input-type=${mode}`, '--eval', source], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 10_000,
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`node --input-type=${mode} failed:\n${stderr}`, { cause: err });
  }
}

describe('package exports', () => {
  test('dist is built', () => {
    expect(existsSync(new URL('../dist/index.js', import.meta.url)),
      'dist/index.js is missing; run npm run build').toBe(true);
  });

  test('ES module import resolves through the exports map', () => {
    node(`
      import assert from 'node:assert/strict';
      import * as clipper from 'clipper2-ts';
      ${checkIntersection}
    `, 'module');
  });

  test.skipIf(!supportsRequireEsm)('CommonJS require resolves through the exports map', () => {
    const clipper = createRequire(import.meta.url)('clipper2-ts');
    expect(typeof clipper.intersect).toBe('function');
    expect(typeof clipper.Clipper64).toBe('function');
  });

  test.skipIf(!supportsRequireEsm)('import and require share one module instance', () => {
    node(`
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as imported from 'clipper2-ts';
      const required = createRequire(import.meta.url)('clipper2-ts');
      assert.equal(required.intersect, imported.intersect);
      assert.equal(required.Clipper64, imported.Clipper64);
      assert.ok(new required.Clipper64() instanceof imported.Clipper64);
    `, 'module');
  });
});
