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

// Use the built public entry points so declaration/build omissions cannot hide in source tests.
const checkBoundary = `
  const ring = [[0,0], [20,0], [40,0], [40,40], [0,40]].map(([x,y]) => ({x,y}));
  const {result, solution} = clipper.triangulate([ring], true, true);
  assert.equal(result, clipper.TriangulateResult.success);
  assert.equal(solution.length, 3);
  assert.equal(clipper.areaPaths(solution), 1600);
  const key = (a,b) => [a.x + ',' + a.y, b.x + ',' + b.y].sort().join(':');
  const edges = new Map();
  for (const triangle of solution) for (let i=0; i<3; i++) {
    const k=key(triangle[i], triangle[(i+1)%3]);
    edges.set(k,(edges.get(k)||0)+1);
  }
  for (let i=0; i<ring.length; i++) assert.equal(edges.get(key(ring[i],ring[(i+1)%ring.length])),1);
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

  test('boundary preservation is available through the ES module entry point', () => {
    node(`
      import assert from 'node:assert/strict';
      import * as clipper from 'clipper2-ts';
      ${checkBoundary}
    `, 'module');
  });

  test.skipIf(!supportsRequireEsm)('boundary preservation is available through CommonJS', () => {
    node(`
      const assert = require('node:assert/strict');
      const clipper = require('clipper2-ts');
      ${checkBoundary}
    `, 'commonjs');
  });

  test('boundary preservation survives the minified bundle', () => {
    node(`
      import assert from 'node:assert/strict';
      import * as clipper from './dist/clipper2.min.mjs';
      ${checkBoundary}
    `, 'module');
  });
});
