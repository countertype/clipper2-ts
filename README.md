# clipper2-ts

[![npm version](https://img.shields.io/npm/v/clipper2-ts.svg)](https://www.npmjs.com/package/clipper2-ts)
[![license](https://img.shields.io/npm/l/clipper2-ts.svg)](https://github.com/countertype/clipper2-ts/blob/main/LICENSE)

TypeScript port of Angus Johnson's [Clipper2](https://github.com/AngusJohnson/Clipper2) library for polygon clipping, offsetting, and triangulation

## Installation

```bash
npm install clipper2-ts
```

## Usage

```typescript
import { intersect, union, difference, xor, inflatePaths, FillRule, JoinType, EndType } from 'clipper2-ts';

// Define polygons as arrays of points
const subject = [[
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 }
]];

const clip = [[
  { x: 50, y: 50 },
  { x: 150, y: 50 },
  { x: 150, y: 150 },
  { x: 50, y: 150 }
]];

// Boolean operations
const intersection = intersect(subject, clip, FillRule.NonZero);
const unionResult = union(subject, clip, FillRule.NonZero);
const diff = difference(subject, clip, FillRule.NonZero);
const xorResult = xor(subject, clip, FillRule.NonZero);

// Polygon offsetting (inflate/deflate)
const offset = inflatePaths(subject, 10, JoinType.Round, EndType.Polygon);
```

### Triangulation

Convert polygons into triangles using constrained Delaunay triangulation:

```typescript
import { triangulate, triangulateD, TriangulateResult } from 'clipper2-ts';

const polygon = [[
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 }
]];

const { result, solution } = triangulate(polygon);
if (result === TriangulateResult.success) {
  // solution contains triangles (each with 3 vertices)
  console.log(`Created ${solution.length} triangles`);
}

// For floating-point coordinates:
const { result: resultD, solution: solutionD } = triangulateD(polygon, 2);
```

### Z-coordinate support

Points can optionally carry a Z value (e.g., elevation, layer index, color). Z callbacks allow you to assign Z values to new vertices created at intersection points. See [Clipper2 Z Docs](https://www.angusj.com/clipper2/Docs/Overview.htm) for details

## Examples

Try the [interactive example](https://countertype.github.io/clipper2-ts/) showing all Clipper2 operations

To run locally:

```bash
npm install
npm run serve
# Then open http://localhost:3000/example/
```

## API

This port follows the structure and functionality of Clipper2's C# implementation, with method names adapted to JavaScript conventions. Where C# uses `PascalCase` for methods (`AddPath`, `Execute`), this port uses `camelCase` (`addPath`, `execute`). Class names remain unchanged

For detailed API documentation, see the [official Clipper2 docs](https://www.angusj.com/clipper2/Docs/Overview.htm)

## Testing

The port includes 258 tests validating against Clipper2's reference test suite:

```bash
npm test              # Run all tests
npm test:coverage     # Run with coverage report
```

The test suite validates clipping, offsetting, triangulation, and Z-callbacks against Clipper2's reference implementation. Polygon test 16 (bow-tie) uses relaxed tolerances as this edge case also fails in the C# reference

## Numeric precision

Unlike C# Clipper2, which has full int64 support, this library uses JavaScript's `Number` rather than `BigInt` for performance, with `BigInt` used for some intermediate arithmetic where needed. Coordinates must stay within the [safe integer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger) range (2^53); the library throws on overflow

If you have a use case that requires the full 64-bit range, and Clipper2-WASM isn't an option, please open an issue and we can discuss!

### Bundlers / minifiers (terser)

This library uses `BigInt` internally. Some versions/configurations of terser have had issues when compressing `BigInt` literals (eg `0n`). `clipper2-ts` avoids BigInt literal syntax in its source to improve compatibility

If you still hit terser issues in a consuming build, one workaround is `terserOptions: { compress: { evaluate: false } }`

## Performance 

Faster than JavaScript-based Clipper (Clipper1) ports, slower than Clipper2-WASM; choose based on your constraints

## License

Boost Software License 1.0 (same as Clipper2)

## Credits

Original Clipper2 library by Angus Johnson. TypeScript port maintained by Jeremy Tribby

Benchmark polygon data from [Poly2Tri](https://github.com/jhasse/poly2tri) (BSD 3-clause). See `LICENSE_THIRD_PARTY` for details
