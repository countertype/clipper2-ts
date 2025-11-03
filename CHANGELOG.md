# Changelog

All changes to this project will be documented in this file

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [1.5.4] - 2025-10-25

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

### Added
- Initial TypeScript port of Clipper2 library
- Includes test suite with test data from original Clipper2


## Notes

This port is based on the C# version of Clipper2 by Angus Johnson. Original library: https://github.com/AngusJohnson/Clipper2

