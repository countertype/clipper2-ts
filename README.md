# clipper2-ts

TypeScript port of Angus Johnson's [Clipper2](https://github.com/AngusJohnson/Clipper2) library for polygon clipping and offsetting

## Installation

```bash
npm install @countertype/clipper2-ts
```

## Usage

```typescript
import { Clipper, FillRule, JoinType, EndType } from '@countertype/clipper2-ts';

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
const intersection = Clipper.intersect(subject, clip, FillRule.NonZero);
const union = Clipper.union(subject, clip, FillRule.NonZero);
const difference = Clipper.difference(subject, clip, FillRule.NonZero);
const xor = Clipper.xor(subject, clip, FillRule.NonZero);

// Polygon offsetting (inflate/deflate)
const offset = Clipper.inflatePaths(subject, 10, JoinType.Round, EndType.Polygon);
```

## API

This port follows the structure and functionality of Clipper2's C# implementation, with method names adapted to JavaScript conventions. Where C# uses `PascalCase` for methods (`AddPath`, `Execute`), this port uses `camelCase` (`addPath`, `execute`). Class names remain unchanged

For detailed API documentation, see the [official Clipper2 docs](https://www.angusj.com/clipper2/Docs/Overview.htm)

## Testing

The port includes 235 tests validating against Clipper2's reference test suite:

```bash
npm test              # Run all 235 tests
npm test:coverage     # Run with coverage report
```

Test results: 194/195 polygon tests pass (99.5%), matching C# reference implementation exactly. The single failure (Test 16, bow-tie polygon) also fails in C#

## License

Boost Software License 1.0 (same as Clipper2)

## Credits

Original library by Angus Johnson. TypeScript port by Jeremy Tribby
