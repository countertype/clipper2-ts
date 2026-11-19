# Changelog

All changes to this project will be documented in this file

## [2.0.1-20]

### Added

- `Triangulation`: opt-in `preserveCollinear` for `triangulate`, `triangulateD` and `Delaunay`, restoring boundary subdivisions before edge legalization and failing explicitly when exact constraints cannot be retained ([#43](https://github.com/countertype/clipper2-ts/pull/43))

### Fixed

- `Triangulation`: remove the recursive fan-angle cutoff added in 2.0.1-14, which could leave valid regions partially triangulated while reporting success ([#42](https://github.com/countertype/clipper2-ts/pull/42)): a 500 vertex circle came back with 0.3% of its area, a 220 vertex outline with a hole lost 23%, and a cleaned 500 vertex polygon lost 6.6% with triangles outside the input. Triangulation is 1.5-2x slower than 2.0.1-14 to 2.0.1-19 and now covers the input exactly on every tested shape
- `Triangulation`: resolve zero-area sweep triangles that otherwise leave T-junctions along aligned hole boundaries, including when Delaunay optimization is disabled ([#42](https://github.com/countertype/clipper2-ts/pull/42))
- `Triangulation`: `addPath` tracks the vertex before each local minimum as C# and C++ do, so `innerLM` is set correctly after a multi-edge descent. Fixes `fail` results and overlapping triangles on spiky polygons
- `Triangulation`: `segsIntersect` always uses the exact orientation test; the double-precision parametric version misclassified segments touching at a vertex on the other segment and left overlapping triangles in axis-aligned input
- `Triangulation`: a bridge from an inner local minimum that would run exactly through another vertex now ends at that vertex (PolyClipping/Clipper2 [#12](https://github.com/PolyClipping/Clipper2/issues/12), first case). The second case in that report was already correct here
- `Triangulation`: paths with the wrong orientation are added again reversed instead of being fixed up in place by flipping flags and edge kinds. The in-place fix-up left loose horizontals running through collinear vertices on reversed rectilinear input; on 2000 fuzzed reversed rectilinear polygons the C++ reference gets 219 wrong and the port now gets none
- `Triangulation`: `tests/triangulation-coverage.test.ts` adds the upstream [#1120](https://github.com/AngusJohnson/Clipper2/pull/1120) baseline and exact-coverage checks (area sum and both differences empty) on circles, glyph-like outlines, cleaned random polygons and 300+ fuzzed spiky polygons in both windings
- `Offset`: square joins and miter joins past the miter limit compute the corner with `InternalClipper.getLineIntersectPtD` instead of a slope-intercept helper, as C++ does. The crossing is now clamped to the cap segment, so a narrow notch no longer extends past `delta`, and corners far from the origin no longer lose precision ([#44](https://github.com/countertype/clipper2-ts/issues/44))
- `Core`: `getLineIntersectPt` rounds the intersection point instead of truncating it toward zero, and evaluates each segment from its bottom end so a shared edge rounds to the same point whichever way round it is given (PolyClipping/Clipper2 [f774daf1](https://github.com/PolyClipping/Clipper2/commit/f774daf1), [#13](https://github.com/PolyClipping/Clipper2/issues/13)). Truncation could push a point off its segment and reverse a contour: `difference` of two small triangles returned an area of -3.5 where the exact answer is 3.27. This also fixes the self-intersecting ring in upstream [#1083](https://github.com/AngusJohnson/Clipper2/issues/1083), which is no longer a known failure
- `Engine`: `updateEdgeIntoAEL` puts edges leaving a shared vertex in order by direction. Edges within rounding of each other tied on `topX`, their crossing showed up scanbeams later, and the region between them came out reversed (PolyClipping/Clipper2 [ec5f2d4c](https://github.com/PolyClipping/Clipper2/commit/ec5f2d4c), [#13](https://github.com/PolyClipping/Clipper2/issues/13))
- `Engine`: `addNewIntersectNode` moves an intersection that falls outside the scanbeam onto the part of the flatter edge that lies inside the scanbeam, not onto the whole edge (PolyClipping/Clipper2 [4a3bf641](https://github.com/PolyClipping/Clipper2/commit/4a3bf641))
- `Engine`: `topX` rounds the offset along the edge and then adds `bot.x`, as C++ and C# do. It rounded the sum, which resolves an exact half the other way when `bot.x` is odd. This was the largest single cause of output differing from C++ at small coordinates
- `Engine`: local minima are sorted by descending y and then ascending x, as in C++ (upstream [#594](https://github.com/AngusJohnson/Clipper2/issues/594)); they were sorted by y only
- `Engine`: intersections at the same point are processed in the order they were found, as in C++. The port sorted them further by the x of their edges
- `Engine`: `checkJoinRight` joins an edge to its right neighbour within a squared distance of 0.35, as C++ does; the port used 0.25, the C# value. `checkJoinLeft` stays at 0.25 in both
- `Engine`: `doSplitOp` keeps a split-off loop with an area of 1 or more, as in C++; the port required more than 1
- `Core`: `getClosestPtOnSegment` rounds the offset half to even and then adds it, as in C++
- `Engine`: a closed path with only two distinct points is ignored, as in C++. It was swept as a polygon with no area, which left extra vertices on paths it crossed and could add area between other paths
- `Offset`, `Core`, `Clipper`: floating point coordinates are rounded half away from zero when they become integers, as `std::round` does in C++ and `MidpointRounding.AwayFromZero` did in C#. `Math.round` rounds a negative half up, so an offset by a half-integer delta at negative coordinates came out one unit toward the positive: a square from -341 to -231 shrunk by 11.5 ran from -329 to -242 and now runs from -330 to -243. This covers offset vertices, `ellipse`, `Point64Utils` and the scaling used by the `PathsD` functions
- `Engine`: a `zCallback` no longer changes the caller's input points. An output point could be the same object as an input vertex, so the `z` a callback wrote there showed up in the input paths and in the `z` values passed to later callbacks. The point is copied before `z` is set. Z output now matches C++ built with `USINGZ` on every compared case, with and without a callback
- `Engine`: executing into paths after executing into a `PolyTree` on the same `Clipper64` or `ClipperD` no longer runs in PolyTree mode. The flag was set by the PolyTree call and never cleared, which changed the paths returned by the later call (4 of the 195 polygon tests). Found with the reused-clipper test from PolyClipping/Clipper2 [0812644](https://github.com/PolyClipping/Clipper2/commit/0812644)
- `Core`: intersection points and rounded coordinates are no longer `-0`
- `Core`: `path2ContainsPath1`, which decides nesting in a `PolyTree` when a path only touches its candidate parent, follows C++: the path's midpoint must be strictly inside, and it is taken by integer division. The port accepted a midpoint on the edge and rounded it, which nested some touching paths one level too deep or listed a hole as an outer (35 of 20,000 random cases)
- `Clipper`, `Core`: `midPoint` and `Rect64Utils.midPoint` use integer division, as in C++ and as their own large-coordinate branch already did
- `Clipper`, `Offset`: `ellipse` truncates its default number of steps, as in C++, where it rounded them up; a default ellipse has one vertex fewer
- `Offset`: a polygon group without a closed path no longer makes delta positive for the groups after it, which grew them when they should have shrunk (PolyClipping/Clipper2 [6c7d0830](https://github.com/PolyClipping/Clipper2/commit/6c7d0830))
- `Offset`: `deltaCallback` gets the normals of the single point path it is called for, and a round single point gets arc steps for its own delta, not those left by an earlier path (PolyClipping/Clipper2 [6c7d0830](https://github.com/PolyClipping/Clipper2/commit/6c7d0830))
- `Offset`: only a group with a closed path decides the orientation of the solution. An empty group, or one holding only a line, ahead of a clockwise polygon emptied the result (PolyClipping/Clipper2 [ca30bebd](https://github.com/PolyClipping/Clipper2/commit/ca30bebd), [#9](https://github.com/PolyClipping/Clipper2/issues/9)). Empty paths are dropped when a group is created
- `Offset`: a single point in a `Polygon` or `Joined` group is offset to a square or circle, as it is for the other end types and in C++. `stripDuplicates` removed it as a duplicate of itself. A single point is skipped when its delta is below 1, as in C++

### Performance

- `Engine`: `PolyTree` output no longer tests every candidate child against every edge of its parent. A `StripeIndex` buckets a large ring's edges into horizontal stripes, so each point-in-polygon test scans one stripe (PolyClipping/Clipper2 [884ba82](https://github.com/PolyClipping/Clipper2/commit/884ba82)). A union of a 20,000 point ring with 2,000 holes went from 276 ms to 7.5 ms with `PolyTree` output, and a 100,000 point ring with 5,000 holes from 3.2 s to 47 ms. Rings of 64 edges or fewer use the plain test, and the trees are identical either way. `pipIndexThreshold` on the clipper sets that limit

### Changed

- `Offset`: **the solution's outer paths are now wound positively whatever the orientation of the input** (PolyClipping/Clipper2 [64a9ecc](https://github.com/PolyClipping/Clipper2/commit/64a9ecc), [#13](https://github.com/PolyClipping/Clipper2/issues/13)). Offsetting a clockwise polygon used to return a clockwise (negative) path and now returns a positive one; `reverseSolution` gives negative output for any input. Code that relied on "clockwise in, clockwise out" needs to reverse the result or set `reverseSolution`
- `Offset`: which paths are outers and which are holes is worked out from exact path areas and containment instead of from the lowest path. A group's outers take the orientation of its largest closed path, so a small reversed sliver left by a clipping operation no longer flips the whole group, which could return nothing for an inward offset. A group wound against another is treated as that group's holes when it lies inside one of its outers, whatever order the groups were added in. A hole that no outer encloses contributes nothing
- `Offset`: a delta below half a unit, including 0, returns the closed paths with their winding normalized (it returned the input unchanged) and drops open paths, which have no width at that delta. A point or a line in a `Polygon` group is removed by a negative delta
- `Offset`: arc steps are calculated as in C++: `arcTolerance` is used whenever it is above 1e-12 (it was ignored below 0.01), it is capped at delta, and the steps per turn are capped at delta × π. Round joins and round ends with a delta under about 16 get fewer vertices than before, and an `arcTolerance` more than twice delta no longer produces `NaN` steps
- Clipping output can differ from 2.0.1-19 by one unit at intersection points, because they are now rounded, and thin spikes narrower than a unit can be joined away as they are in C++. Checked against PolyClipping/Clipper2 C++ built from source: on 20,000 random clipping cases the share of results that are identical point for point went from 23% to 99.9%. For offsetting it went from 9% of 12,000 random cases to all of 6,000 mixed-orientation, multi-group cases and all of 6,000 half-integer delta cases. The clipping cases still differing are almost all holes kept by the [#35](https://github.com/countertype/clipper2-ts/pull/35) fix, which C++ does not have
- `tests/test-data/Polygons.txt` is synced with upstream, which changed the stored area or count of 19 tests. `tests/polygons.test.ts` now uses the tolerance table of the C++ test suite in place of a looser one; the port's output is identical to C++ on 192 of the 195 tests
- `Offset`: the join type alone decides whether a single point becomes a circle or a square, as in C++. A single point with a round end type and a join type other than round used to be a circle and is now a square
- `Offset`: a closed path whose points are all identical now collapses to a single point and is offset as one; it used to return nothing
- `tests/union-pocket.test.ts`: the two inputs for [#35](https://github.com/countertype/clipper2-ts/pull/35) only formed a hole because of truncation. They now return one outline, as C++ does, and a new three-triangle input covers the kept hole
- `tests/intersection-rounding.test.ts` and `tests/offsets.test.ts` add the upstream regression tests for the commits above

## [2.0.1-19]

### Fixed

- `Engine`: `union` no longer runs out of memory when consecutive horizontal edges reverse direction; the sweep direction is now re-read for each horizontal, as in C++ ([#36](https://github.com/countertype/clipper2-ts/pull/36))
- `Engine`: `doSplitOp` keeps a reversed split loop that lies inside the remaining path instead of discarding it, so `union` no longer fills a hole created by intersection rounding ([#35](https://github.com/countertype/clipper2-ts/pull/35), upstream [#1109](https://github.com/AngusJohnson/Clipper2/pull/1109)). The kept hole is owned by the remaining path, so `PolyTree` output nests it correctly
- `Engine`: `checkSplitOwner` guards against emptied OutRecs whose splits reference each other (PolyClipping/Clipper2 [f97d65db](https://github.com/PolyClipping/Clipper2/commit/f97d65db), upstream [#1084](https://github.com/AngusJohnson/Clipper2/issues/1084))
- `Offset`: empty paths no longer throw, and a 2 point `Joined` path no longer changes the end type of the paths that follow it (PolyClipping/Clipper2 [#9](https://github.com/PolyClipping/Clipper2/issues/9))
- `RectClip`: a path entering the rectangle through a vertex on its edge no longer drops the corner that follows; the location from the second intersection is now carried forward as in C# ([#37](https://github.com/countertype/clipper2-ts/issues/37))
- `RectClip`: intersections with a rectangle side keep the coordinate on that side exact instead of landing one unit inside after rounding (upstream [#1114](https://github.com/AngusJohnson/Clipper2/pull/1114), [#1095](https://github.com/AngusJohnson/Clipper2/issues/1095))
- Package loading: the ES module build is exported under the `default` condition, so `require('clipper2-ts')` works on Node.js 20.19+, 22.12+ and 23+ and in bundlers, including TypeScript CLI tools compiled to CommonJS ([#38](https://github.com/countertype/clipper2-ts/pull/38))

### Changed

- Dev dependencies: `vitest` 4.1.12, `typescript-eslint` 8.72.1, `minimatch` overridden to 11; `npm audit` reports no vulnerabilities

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
