// Exercise the shipped package with Node's loaders rather than Vitest's source resolver.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const supportsRequireEsm = Boolean(process.features.require_module);
let consumer: string;

function npm(args: string[], cwd: string): string {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('Run the package-loading tests through npm test.');
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

function node(source: string, mode: 'module' | 'commonjs'): void {
  execFileSync(process.execPath, [`--input-type=${mode}`, '--eval', source], {
    cwd: consumer,
    timeout: 10_000,
  });
}

// A real operation ensures the installed entry point loads its dependency graph too.
const checkIntersection = `
  const square = (x, y) => [
    { x, y }, { x: x + 10, y },
    { x: x + 10, y: y + 10 }, { x, y: y + 10 },
  ];
  const result = clipper.intersect([square(0, 0)], [square(5, 5)], clipper.FillRule.NonZero);
  assert.equal(Math.abs(clipper.areaPaths(result)), 25);
`;

describe('installed package loading', () => {
  beforeAll(() => {
    consumer = mkdtempSync(join(tmpdir(), 'clipper2-ts-package-'));
    npm(['run', 'build'], root);
    const packed = JSON.parse(npm([
      'pack', '--ignore-scripts', '--json', '--pack-destination', consumer,
    ], root)) as { filename: string }[];
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true }));
    npm([
      'install', '--ignore-scripts', '--no-audit', '--no-fund',
      join(consumer, packed[0]!.filename),
    ], consumer);
  }, 120_000);

  afterAll(() => {
    if (consumer) rmSync(consumer, { recursive: true, force: true });
  });

  test('ES module import performs a polygon intersection', () => {
    expect(() => node(`
      import assert from 'node:assert/strict';
      import * as clipper from 'clipper2-ts';
      ${checkIntersection}
    `, 'module')).not.toThrow();
  });

  test.skipIf(!supportsRequireEsm)('CommonJS require performs a polygon intersection', () => {
    expect(() => node(`
      const assert = require('node:assert/strict');
      const clipper = require('clipper2-ts');
      ${checkIntersection}
    `, 'commonjs')).not.toThrow();
  });

  test.skipIf(!supportsRequireEsm)('import and require share functions and constructors', () => {
    expect(() => node(`
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as imported from 'clipper2-ts';
      const required = createRequire(import.meta.url)('clipper2-ts');
      assert.equal(required.intersect, imported.intersect);
      assert.equal(required.Clipper64, imported.Clipper64);
      assert.ok(new required.Clipper64() instanceof imported.Clipper64);
    `, 'module')).not.toThrow();
  });
});
