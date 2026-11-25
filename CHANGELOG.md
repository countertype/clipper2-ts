# Changelog

All changes to this project will be documented in this file

## [2.0.1-20]

### Deprecated

- `Triangulation`: `triangulate`, `triangulateD`, `Delaunay` and `TriangulateResult` are deprecated and will be removed in the next release, since Clipper2 has withdrawn its triangulation module ([#41](https://github.com/countertype/clipper2-ts/issues/41)). A deprecation warning is logged on first use, through `console.warn` under `--throw-deprecation` so that it cannot end the process

### Added

- `Triangulation`: opt-in `preserveCollinear` for `triangulate`, `triangulateD` and `Delaunay`, which keeps every boundary segment or fails ([#43](https://github.com/countertype/clipper2-ts/pull/43))

- `Clipper`: `rectClipD` and `rectClipLinesD`, which always clip decimal paths at a precision; `unionD(subject, fillRule, precision)`; a `decimalPlaces` argument for `minkowskiSumD` and `minkowskiDiffD`

### Fixed

- `Triangulation`: removed the fan-angle cutoff from 2.0.1-14, which could report success with regions left untriangulated; triangulation is 1.5-2x slower and now covers the input exactly ([#42](https://github.com/countertype/clipper2-ts/pull/42))
- `Triangulation`: zero-area sweep triangles no longer leave T-junctions along aligned hole boundaries ([#42](https://github.com/countertype/clipper2-ts/pull/42))
- `Triangulation`: `addPath` tracks the vertex before each local minimum, fixing `fail` results and overlapping triangles on spiky polygons
- `Triangulation`: `segsIntersect` always uses the exact orientation test
- `Triangulation`: a bridge that would run through another vertex ends at that vertex (PolyClipping/Clipper2 [#12](https://github.com/PolyClipping/Clipper2/issues/12))
- `Triangulation`: wrongly oriented paths are added again reversed instead of being fixed up in place
- `Offset`: square joins compute the corner with `getLineIntersectPtD`, clamped to the cap segment, as in C++ ([#44](https://github.com/countertype/clipper2-ts/issues/44))
- `Core`: `getLineIntersectPt` rounds intersection points instead of truncating them (PolyClipping/Clipper2 [f774daf1](https://github.com/PolyClipping/Clipper2/commit/f774daf1), [#13](https://github.com/PolyClipping/Clipper2/issues/13)); this also fixes upstream [#1083](https://github.com/AngusJohnson/Clipper2/issues/1083)
- `Engine`: edges leaving a shared vertex are ordered by direction (PolyClipping/Clipper2 [ec5f2d4c](https://github.com/PolyClipping/Clipper2/commit/ec5f2d4c), [#13](https://github.com/PolyClipping/Clipper2/issues/13))
- `Engine`: an intersection outside the scanbeam is moved onto the part of the flatter edge inside it (PolyClipping/Clipper2 [4a3bf641](https://github.com/PolyClipping/Clipper2/commit/4a3bf641))
- `Engine`: `topX` rounds the offset and then adds `bot.x`, local minima are sorted by y then x, intersections at the same point keep the order found, `checkJoinRight` uses 0.35 and `doSplitOp` keeps loops of half a unit of area or more, all as in C++
- `Engine`: a closed path with only two distinct points is ignored, as in C++, including one given with its closing point repeated
- `Engine`, `Offset`: `execute` into paths after `execute` into a `PolyTree` on the same clipper or `ClipperOffset` no longer runs in PolyTree mode
- `Engine`: a `zCallback` no longer changes the caller's input points
- `Core`: when every vertex of a path is on its parent, `path2ContainsPath1` tests the midpoints of the path's edges, relative to the path's own corner, before the bounds midpoint. A hole touching its owner at every vertex is nested under it and a ring that only shares an edge is not. C++ nests neither and C# both
- `Engine`: the `PolyTree` nesting test cleans an owner ring once, not once per touching hole; 10,000 holes touching a 60,000 point ring went from 10.1 s to 6.3 s
- `Engine`: a clipper run from inside a `zCallback` no longer disturbs the clipper that called it, which with open paths did not return; the open paths flag is held on each clipper
- `Engine`: `execute` returns `true` for `ClipType.NoClip`, and `ClipperD.execute` returns `false` after a failed sweep, both as in C++; nothing is built after a failed sweep
- `Engine`: `getBounds` no longer throws after a path of one point was added
- `Engine`: a horizontal's first output point keeps its z
- `RectClip`: an edge along the top or bottom of the rectangle and through its right corner is crossed at that corner, as in C++
- `Clipper`: a precision of 0 is no longer replaced by 2 in `unionD`, `rectClip` and `rectClipLines`
- `Clipper`: `stripDuplicates` and `stripNearDuplicates` keep the one point of a closed path of repeats, and `stripNearDuplicates` drops every closing point near the first, as in C++
- `Clipper`: `ramerDouglasPeuckerD` compares end points exactly, as in C++
- `Minkowski`: `sumD` and `diffD` round half away from zero when scaling, as everywhere else and as in C++
- `Triangulation`: a path that is entirely collinear, or whose edges keep returning to one vertex, no longer keeps `triangulate` from returning or runs it out of memory
- `Triangulation`: repeated points and spikes of no width are taken out of a path before it is walked. A spike beside a local minimum could give `success` with part of the polygon missing, and with `preserveCollinear` any spike gave `fail`. A path that is nothing but spikes is skipped
- `Triangulation`: an inconsistency met on self-touching rings is returned as `fail` instead of being thrown
- `Offset`: path sizes are compared exactly above 2^53, so two paths of nearly equal area no longer give a result that depends on their order
- `Offset`: square joins round as the other joins do, without throwing near the top of the safe integer range
- `Offset`: the cap of an open path is skipped for a delta of exactly the tolerance, as in C++
- `Core`, `Clipper`, `Offset`: coordinates are rounded half away from zero, as in C++, and are never `-0`; `midPoint` uses integer division; `ellipse` truncates its default steps, down to 3 at the least
- `Offset`: a polygon group without a closed path no longer flips the sign of delta for later groups or decides the solution's orientation (PolyClipping/Clipper2 [6c7d0830](https://github.com/PolyClipping/Clipper2/commit/6c7d0830), [ca30bebd](https://github.com/PolyClipping/Clipper2/commit/ca30bebd), [#9](https://github.com/PolyClipping/Clipper2/issues/9))
- `Offset`: `deltaCallback` gets the normals and arc steps of the single point path it is called for (PolyClipping/Clipper2 [6c7d0830](https://github.com/PolyClipping/Clipper2/commit/6c7d0830))
- `Offset`: a single point in a `Polygon` or `Joined` group is offset instead of being dropped

### Performance

- `Engine`: `PolyTree` nesting uses a `StripeIndex` for rings over 64 edges (PolyClipping/Clipper2 [884ba82](https://github.com/PolyClipping/Clipper2/commit/884ba82)); a 20,000 point ring with 2,000 holes went from 276 ms to 7.5 ms

### Changed

- `Offset`: **output is wound positively whatever the orientation of the input** (PolyClipping/Clipper2 [64a9ecc](https://github.com/PolyClipping/Clipper2/commit/64a9ecc), [#13](https://github.com/PolyClipping/Clipper2/issues/13)). Clockwise input used to give clockwise output; set `reverseSolution` or reverse the result to get that back
- `Engine`: **an exception thrown during `execute` now escapes it**, as in C++, instead of being caught and returned as `false`. The clipper is still cleaned up
- `Offset`: outers and holes are decided by exact area and containment, so a stray reversed sliver no longer flips a group; a hole that no outer encloses contributes nothing
- `Offset`: a delta below half a unit normalizes the winding of closed paths and returns open paths as given; a point or line in a `Polygon` group is removed by a negative delta. The closed paths go through a union, as in C++, so they are no longer returned as given: overlapping paths merge, collinear points go, and a delta of 0 is no longer a cheap pass-through
- `Offset`: a coordinate that is not a finite number throws a `RangeError` for every join and end type; it used to throw for some and return an empty result for others
- `Clipper`: **`rectClip` and `rectClipLines` take the decimal form only when a precision is given or the rect itself has a fraction**. They used to look only at the rect's left side, so a decimal rect starting on a whole number clipped decimal paths as integers. Decimal paths in a rect of whole numbers need `rectClipD` / `rectClipLinesD` or an explicit precision
- `Clipper`: `ellipse`, `stripDuplicates` and the scaling of decimal paths live in `Core`, so importing `ellipse` alone no longer pulls in the offsetter and the engine
- `Engine`, `Offset`: one threshold, `StripeIndex.defaultThreshold`, decides when a ring is indexed
- Dev dependencies: `vitest` 4.1.12, `typescript-eslint` 8.72.1, `minimatch` overridden to 11; `npm audit` reports no vulnerabilities
- Tests: the package loading tests rebuild `dist/` before each run
- `Offset`: removed the unused static `ClipperOffset.getLowestPathInfo` and `ClipperOffset.area`; `Clipper.area` gives the same area
- `Offset`: arc steps follow C++, so round joins with a delta under about 16 get fewer vertices; a single point is a circle only for a round join type; a closed path of identical points is offset as a point
- Clipping output can differ from 2.0.1-19 by one unit at intersection points. Compared with PolyClipping/Clipper2 C++ on random inputs, results are now identical in 99.9% of clipping cases (was 23%) and in all offset cases compared; the rest are holes kept by [#35](https://github.com/countertype/clipper2-ts/pull/35)
- Tests: `Polygons.txt` and its tolerance table are synced with upstream, and upstream's tests are ported from every file of its test suite that applies here

## [2.0.1-19]

### Fixed

- `Engine`: `union` no longer runs out of memory when consecutive horizontal edges reverse direction; the sweep direction is now re-read for each horizontal, as in C++ ([#36](https://github.com/countertype/clipper2-ts/pull/36))
- `Engine`: `doSplitOp` keeps a reversed split loop that lies inside the remaining path instead of discarding it, so `union` no longer fills a hole created by intersection rounding ([#35](https://github.com/countertype/clipper2-ts/pull/35), upstream [#1109](https://github.com/AngusJohnson/Clipper2/pull/1109)). The kept hole is owned by the remaining path, so `PolyTree` output nests it correctly
- `Engine`: `checkSplitOwner` guards against emptied OutRecs whose splits reference each other (PolyClipping/Clipper2 [f97d65db](https://github.com/PolyClipping/Clipper2/commit/f97d65db), upstream [#1084](https://github.com/AngusJohnson/Clipper2/issues/1084))
- `Offset`: empty paths no longer throw, and a 2 point `Joined` path no longer changes the end type of the paths that follow it (PolyClipping/Clipper2 [#9](https://github.com/PolyClipping/Clipper2/issues/9))
- `RectClip`: a path entering the rectangle through a vertex on its edge no longer drops the corner that follows; the location from the second intersection is now carried forward as in C# ([#37](https://github.com/countertype/clipper2-ts/issues/37))
- `RectClip`: intersections with a rectangle side keep the coordinate on that side exact instead of landing one unit inside after rounding (upstream [#1114](https://github.com/AngusJohnson/Clipper2/pull/1114), [#1095](https://github.com/AngusJohnson/Clipper2/issues/1095))
- Package loading: the ES module build is exported under the `default` condition, so `require('clipper2-ts')` works on Node.js 20.19+, 22.12+ and 23+ and in bundlers, including TypeScript CLI tools compiled to CommonJS ([#38](https://github.com/countertype/clipper2-ts/pull/38))

### Performance

- `Engine`: `resetHorzDirection` writes the horizontal's X bounds to fields instead of allocating a result object per call
- `Engine`: local minima are no longer queued as scanlines up front; `popScanline` merges the next minimum's y with the scanline list, and duplicate scanlines are popped together instead of being tracked in a `Set` (PolyClipping/Clipper2 [#2](https://github.com/PolyClipping/Clipper2/issues/2), upstream [#1115](https://github.com/AngusJohnson/Clipper2/pull/1115)). Offsets 5-9% faster, complex polygon unions 3-6% faster

## [2.0.1-18]

### Performance

- `Engine`: skip the intersection merge sort on scanbeams where the active edge list is already sorted (no intersections possible), and reuse the edge positions computed during that scan in `doTopOfScanbeam`
- `Engine`: cheaper hot-path predicates (`isHorizontal` via `dx`, reordered `checkJoinLeft`/`checkJoinRight` early-outs, early-exit bounding-box overlap test), head-only vertex list, and horizontal-segment compaction before sorting — benchmark suite ~11% faster overall, intersection/difference/xor operations up to 45% faster

## [2.0.1-17]

### Performance

- `Engine`: split polymorphic `isMaxima` dispatch into monomorphic `isMaximaVertex`/`isMaximaEdge` — eliminates `'flags' in` runtime type check in hot sweep paths (`doTopOfScanbeam`, `trimHorz`, `isValidAelOrder`)
- `Engine`: reduced small allocations in sweep hot paths around intersection sorting and active-edge swaps

## [2.0.1-16]

### Fixed

- `Engine`: invoke `zCallback` in `doSplitOp` after `getLineIntersectPt` ([#31](https://github.com/countertype/clipper2-ts/issues/31))

### Changed

- Bumped `brace-expansion`, `postcss`, and `vite` versions

## [2.0.1-15]

### Fixed

- `ClipperD`: `addPath` no longer applies scaling twice ([#27](https://github.com/countertype/clipper2-ts/issues/27), [#28](https://github.com/countertype/clipper2-ts/pull/28))

## [2.0.1-14]

### Fixed

- `Triangulation`: fixed failure on polygons with collinear vertex at local minimum (upstream [#1075](https://github.com/AngusJohnson/Clipper2/issues/1075)) — moved `locMinStack` push after the collinear skip check to prevent duplicate pushes that double-flip `innerLM`

### Performance

- `Triangulation`: 2.4–2.8x faster for 500+ vertex polygons via angle heuristic (Domiter & Zalik 2008 §3.2) that limits triangle fan extension, reducing unnecessary Lawson legalizations
- `Triangulation`: replaced BigInt in `segsIntersect` with exact Shewchuk orient2d predicates
- `Triangulation`: pre-allocated `forceLegal` edge arrays and inlined `areSafeDeltas` checks to reduce per-call allocation overhead

## [2.0.1-13]

### Fixed

- `Engine`: fixed sliver triangle union bug ([#21](https://github.com/countertype/clipper2-ts/issues/21), upstream [#1067](https://github.com/AngusJohnson/Clipper2/issues/1067)) — `cleanCollinear` now always calls `fixSelfIntersects`, and removed faulty micro self-intersection shortcut
- `Engine`/`RectClip`: fixed dead assignments flagged by `no-useless-assignment`

### Changed

- Upgraded eslint to v10, typescript-eslint to 8.56.1-alpha.3 (resolves minimatch ReDoS advisory)

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
