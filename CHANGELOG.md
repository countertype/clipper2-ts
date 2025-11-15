# Changelog

All changes to this project will be documented in this file

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

