# Changelog

All changes to this project will be documented in this file

## [2.0.1-12]

### Changed

- `Triangulation`: removed dead `horizontalBetween` checks (never reached in practice)

### Performance

- `Offset`: `hypotenuse` uses `x * x` instead of `Math.pow(x, 2)`

## [2.0.1-11]

### Fixed

- `Offset`: Z now propagates through all join types, open path caps, and single-point offsets
- `Core`: `getLineIntersectPt` endpoint copies now carry Z

## [2.0.1-10]

### Fixed

- Build/minifier compatibility: replaced BigInt literal syntax (eg `0n`) with cached `BigInt()` constants to avoid a `compress.evaluate` error in some consuming pipelines and terser versions

## [2.0.1-9]

### Quality

- `Engine`: ScanlineHeap siftUp/siftDown now use hole-sift pattern instead of destructuring swap (avoids temporary array allocation per swap step)
- `Core`: removed redundant `< 46341` fast path in `productsAreEqual` (`maxDeltaForSafeProduct` replaced it)
- Converted remaining TypeScript `namespace` declarations to plain `const` objects across Core.ts, Engine.ts, and Minkowski.ts`InternalClipper.UInt128Struct` preserved as a deprecated type alias for backward compatibility though it's unlikely anyone was using it
- Removed stale `OutPtPool` and `VertexPool` files from dist (no corresponding source)
- Added `exports` field to package.json for modern bundler resolution
- Froze `InvalidRect64` and `InvalidRectD` singletons with `Object.freeze`
- Added rolldown bundled/minified single-file dist (`dist/clipper2.min.mjs`)
- Added `type` modifiers to type-only re-exports in index.ts

### Performance

- `Engine`: removed debug ID counters from `OutPt` and `OutRec`
- `Engine`: `cleanCollinear` now skips `fixSelfIntersects` when no points were actually removed
- `Offset`: push `pathOut` directly into `solution` instead of spread-cloning it; the array is freshly allocated per output path so the copy was unnecessary
- `Core`/`Engine`: `getLineIntersectPt` returns `Point64 | null` instead of a `{ intersects, point }` wrapper object, eliminating an allocation on every intersection test
- `Engine`: `createIntersectNode` takes ownership of the point directly instead of copying it (the caller always passes a fresh allocation)
- `Engine`: `popScanline` returns `number | null` instead of a `{ success, y }` wrapper object, eliminating an allocation on every scanline transition in the main sweep loop
- `RectClip`: `getSegmentIntersection` returns `Point64 | null` instead of a wrapper object; `getIntersection` reuses a single result object instead of allocating per call
- `Core`: `roundToEven` rewritten to do `Math.round` first and only correct the rare exact-half case, removing unnecessary `Math.floor`/`Math.abs` from the hot `topX` path
- `Triangulation`: `removeEdgeFromVertex` uses swap-with-last-and-pop instead of `splice`


## [2.0.1-8]

### Fixed
- Triangulation: fixed overlapping triangles in polygons with holes ([#1062](https://github.com/AngusJohnson/Clipper2/issues/1062)) by correcting bridge-edge visibility check in `createInnerLocMinLooseEdge`
- Export `polyTreeToPaths64` and `polyTreeToPathsD` directly from index (previously only available via `Clipper` namespace)

## [2.0.1-7]

### Fixed
- Triangulation: stabilized Delaunay flip handling to prevent flip oscillations in edge-case inputs

### Changed
- Triangulation: added a safe-math pre-scan for speed when coordinates stay within safe integer range

### Added
- Triangulation: expanded test coverage for failure cases and edge conditions

## [2.0.1-6]

### Changed
- Removed `Clipper` namespace for better tree-shaking via [#11](https://github.com/countertype/clipper2-ts/pull/11), which was based on [#4](https://github.com/countertype/clipper2-ts/pull/4) to address [#3](https://github.com/countertype/clipper2-ts/issues/3)
  - Added `sideEffects: false` to package.json for same reason
- Updated eslint to v9 (flat config) to resolve moderate security vulnerability
  - Removed unused imports across source files

### Deprecated
- `Clipper` object export from `Clipper.js` - use named exports or `import * as Clipper` instead

## [2.0.1-5]

### Fixed
- Precision safety for large coordinates: BigInt fallback for intermediate calculations to prevent overflow beyond `MAX_SAFE_INTEGER`, with runtime errors when inputs exceed safe bounds ([#6](https://github.com/countertype/clipper2-ts/pull/6))

## [2.0.1-4]

### Fixed
- Fixed triangulation failures and infinite loops from upstream issues [#1055](https://github.com/AngusJohnson/Clipper2/issues/1055)/[#1056](https://github.com/AngusJohnson/Clipper2/issues/1056) (shared endpoints and near-collinear segments)

### Changed
- Rolled back precision safety changes from 2.0.1-3 while evaluating completeness and performance tradeoffs - current draft is happening in [#6](https://github.com/countertype/clipper2-ts/pull/6)

## [2.0.1-3]

### Changed
- BigInt fallback for intermediate calculations (cross products, dot products, area) to handle large-but-safe coordinate values correctly

## [2.0.1-2]

### Fixed 
- Fixed crash in `inflatePathsD` when given a zero-area ring — JS optional chaining returns `undefined` vs C#'s `null`, so changed `=== null` to `== null` in `addPathsToVertexList`

## [2.0.1-1]

### Added
- Interactive examples page with boolean operations, offsetting, triangulation, and Z-callback demos

### Changed
- Performance: closed-path-only fast paths, reduced object allocation in hot loops

## [2.0.1] - 2025-12-18

Current as of Clipper2 v2.0.1 ([21ebba0](https://github.com/AngusJohnson/Clipper2/commit/21ebba0))

### Changed
- Updated to track Clipper2 v2.0.1 (C++ DLL export updates only; no C# library changes)

## [2.0.0] - 2025-12-18

Current as of Clipper2 v2.0.0 ([f39457d](https://github.com/AngusJohnson/Clipper2/commit/f39457d))

### Fixed
- Fixed `triangulateD` to properly return error status when triangulation fails instead of always returning success

### Changed
- Updated `TriangulateResult` enum naming to use camelCase: `no_polygons` → `noPolygons`, `paths_intersect` → `pathsIntersect`
- Removed redundant `findLocMinIdx` call in triangulation path processing

## [1.5.4-8.578ca4d] - 2025-12-15

Current as of [578ca4d](https://github.com/AngusJohnson/Clipper2/commit/578ca4d)

### Added
- Z-coordinate support: `Point64` and `PointD` now support optional `z` property
- `ZCallback64` and `ZCallbackD` callback types for Z interpolation at intersections
- `zCallback` property on `Clipper64`, `ClipperD`, and `ClipperOffset` classes
- Triangulation support: constrained Delaunay triangulation (beta)
  - `triangulate(paths, useDelaunay)` for integer coordinates
  - `triangulateD(paths, decPlaces, useDelaunay)` for floating-point coordinates
  - `TriangulateResult` enum for result status
  - `Delaunay` class for advanced triangulation control
- Glyph benchmark: `benchmarks/glyph-e.bench.ts` to measure union performance on a flattened outline typical of font contours

### Changed
- `ClipperBase` scanline handling: added an adaptive array-backed scanline mode for small `minimaList` workloads, with automatic upgrade to the heap+set path when scanline count grows. This reduces overhead for small glyph-like unions while preserving existing behavior on larger inputs

## [1.5.4-6.9a869ba] - 2025-12-02

### Fixed
- Corrected 64-bit integer handling in `multiplyUInt64` by replacing unsafe `>>> 0` truncation with `BigInt` arithmetic. This fixes incorrect results for coordinates larger than 2^32

### Changed
- Optimized `productsAreEqual` and `crossProductSign` with fast paths for safe integer ranges (approx +/- 9e7), avoiding `BigInt` overhead for typical use cases
- Unrolled hot loops in `addPathsToVertexList` to standard `for` loops for improved V8 performance

## [1.5.4-5.9a869ba] - 2025-11-18

### Changed
- Modernized build to ES modules with NodeNext module resolution
- Updated to ES2022 target

## [1.5.4-4.9a869ba] - 2025-11-17

### Changed
- Package renamed from `@countertype/clipper2-ts` to `clipper2-ts` (no scope)

## [1.5.4-3.9a869ba] - 2025-11-17

### Changed
- Replaced the sorted scanline array in `ClipperBase` with a binary max-heap

## [1.5.4-2.9a869ba] - 2025-11-15

### Added
- Bounding box fast exit before expensive segment intersection checks

## [1.5.4-1.9a869ba] - 2025-11-14

### Added 
- Fast path in `productsAreEqual` for collinearity checks when coordinate values < 46341 (avoids BigInt overhead for typical cases while maintaining accuracy for larger values)

### Changed
- Inlined point equality checks in hot paths for performance

### Deprecated
- `createLocalMinima()` function (use `new LocalMinima()` constructor directly for better performance)

## [1.5.4] - 2025-11-08

Current as of [9a869ba](https://github.com/AngusJohnson/Clipper2/commit/9a869ba62a3a4f1eff52f4a19ae64da5d65ac939)

### Fixed
- Fixed iterator bug in `checkSplitOwner` that could cause crashes when splits array is modified during recursive iteration (#1029)

## [1.5.4] - 2025-10-25

Current as of [618c05c](https://github.com/AngusJohnson/Clipper2/commit/618c05cb1e610adedda52889d08903a753c5bf95)

### Changed
- Upgraded to Clipper2 1.5.4+ algorithm improvements
- Implemented `CrossProductSign` for better numerical stability with large coordinates
- Rewrote `SegmentsIntersect` using parametric approach for improved accuracy
- Fixed critical `TriSign` bug (changed `x > 1` to `x > 0`)
- Updated `PointInPolygon` to use `CrossProductSign` for better precision
- Added `GetLineIntersectPt` overload for PointD coordinates
- Renamed `getSegmentIntersectPt` to `getLineIntersectPt` for consistency

### Fixed
- 128-bit overflow protection in cross product calculations
- Improved handling of near-collinear points
- Better precision in edge cases with very large coordinate values

## [1.5.4] - 2025-09-19

Current as of [9741103](https://github.com/AngusJohnson/Clipper2/commit/97411032113572f620b513b9c23a455e7261583d)

### Added
- Initial TypeScript port of Clipper2 library
- Includes test suite with test data from original Clipper2

## Notes

This port is based on the C# version of Clipper2 by Angus Johnson. Original library: https://github.com/AngusJohnson/Clipper2
