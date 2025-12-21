# Changelog

All changes to this project will be documented in this file

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
