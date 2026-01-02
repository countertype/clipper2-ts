/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  5 March 2025                                                    *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  This module contains simple functions that will likely cover    *
*              most polygon boolean and offsetting needs, while also avoiding  *
*              the inherent complexities of the other modules.                 *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { Point64, PointD, Path64, PathD, Paths64, PathsD, Rect64, RectD, ClipType, FillRule, PointInPolygonResult } from './Core.js';
import { PolyTree64, PolyTreeD, PolyPathD } from './Engine.js';
import { JoinType, EndType } from './Offset.js';
import { TriangulateResult } from './Triangulation.js';
export declare namespace Clipper {
    const invalidRect64: Rect64;
    const invalidRectD: RectD;
    function intersect(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64;
    function intersectD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision?: number): PathsD;
    function union(subject: Paths64, fillRule: FillRule): Paths64;
    function union(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64;
    function unionD(subject: PathsD, fillRule: FillRule): PathsD;
    function unionD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision?: number): PathsD;
    function difference(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64;
    function differenceD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision?: number): PathsD;
    function xor(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64;
    function xorD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision?: number): PathsD;
    function booleanOp(clipType: ClipType, subject: Paths64 | null, clip: Paths64 | null, fillRule: FillRule): Paths64;
    function booleanOpWithPolyTree(clipType: ClipType, subject: Paths64 | null, clip: Paths64 | null, polytree: PolyTree64, fillRule: FillRule): void;
    function booleanOpD(clipType: ClipType, subject: PathsD, clip: PathsD | null, fillRule: FillRule, precision?: number): PathsD;
    function booleanOpDWithPolyTree(clipType: ClipType, subject: PathsD | null, clip: PathsD | null, polytree: PolyTreeD, fillRule: FillRule, precision?: number): void;
    function inflatePaths(paths: Paths64, delta: number, joinType: JoinType, endType: EndType, miterLimit?: number, arcTolerance?: number): Paths64;
    function inflatePathsD(paths: PathsD, delta: number, joinType: JoinType, endType: EndType, miterLimit?: number, precision?: number, arcTolerance?: number): PathsD;
    function rectClip(rect: Rect64, paths: Paths64): Paths64;
    function rectClip(rect: Rect64, path: Path64): Paths64;
    function rectClip(rect: RectD, paths: PathsD, precision?: number): PathsD;
    function rectClip(rect: RectD, path: PathD, precision?: number): PathsD;
    function rectClipLines(rect: Rect64, paths: Paths64): Paths64;
    function rectClipLines(rect: Rect64, path: Path64): Paths64;
    function rectClipLines(rect: RectD, paths: PathsD, precision?: number): PathsD;
    function rectClipLines(rect: RectD, path: PathD, precision?: number): PathsD;
    function minkowskiSum(pattern: Path64, path: Path64, isClosed: boolean): Paths64;
    function minkowskiSumD(pattern: PathD, path: PathD, isClosed: boolean): PathsD;
    function minkowskiDiff(pattern: Path64, path: Path64, isClosed: boolean): Paths64;
    function minkowskiDiffD(pattern: PathD, path: PathD, isClosed: boolean): PathsD;
    function area(path: Path64): number;
    function areaPaths(paths: Paths64): number;
    function areaD(path: PathD): number;
    function areaPathsD(paths: PathsD): number;
    function isPositive(poly: Path64): boolean;
    function isPositiveD(poly: PathD): boolean;
    function path64ToString(path: Path64): string;
    function paths64ToString(paths: Paths64): string;
    function pathDToString(path: PathD, precision?: number): string;
    function pathsDToString(paths: PathsD, precision?: number): string;
    function offsetPath(path: Path64, dx: number, dy: number): Path64;
    function scalePoint64(pt: Point64, scale: number): Point64;
    function scalePointD(pt: Point64, scale: number): PointD;
    function scaleRect(rec: RectD, scale: number): Rect64;
    function scalePath(path: Path64, scale: number): Path64;
    function scalePaths(paths: Paths64, scale: number): Paths64;
    function scalePathD(path: PathD, scale: number): PathD;
    function scalePathsD(paths: PathsD, scale: number): PathsD;
    function scalePath64(path: PathD, scale: number): Path64;
    function scalePaths64(paths: PathsD, scale: number): Paths64;
    function scalePathDFromInt(path: Path64, scale: number): PathD;
    function scalePathsDFromInt(paths: Paths64, scale: number): PathsD;
    function path64FromD(path: PathD): Path64;
    function paths64FromD(paths: PathsD): Paths64;
    function pathsD(paths: Paths64): PathsD;
    function pathD(path: Path64): PathD;
    function translatePath(path: Path64, dx: number, dy: number): Path64;
    function translatePaths(paths: Paths64, dx: number, dy: number): Paths64;
    function translatePathD(path: PathD, dx: number, dy: number): PathD;
    function translatePathsD(paths: PathsD, dx: number, dy: number): PathsD;
    function reversePath(path: Path64): Path64;
    function reversePathD(path: PathD): PathD;
    function reversePaths(paths: Paths64): Paths64;
    function reversePathsD(paths: PathsD): PathsD;
    function getBounds(path: Path64): Rect64;
    function getBoundsPaths(paths: Paths64): Rect64;
    function getBoundsD(path: PathD): RectD;
    function getBoundsPathsD(paths: PathsD): RectD;
    function makePath(arr: number[]): Path64;
    function makePathD(arr: number[]): PathD;
    function sqr(val: number): number;
    function distanceSqr(pt1: Point64, pt2: Point64): number;
    function midPoint(pt1: Point64, pt2: Point64): Point64;
    function midPointD(pt1: PointD, pt2: PointD): PointD;
    function inflateRect(rec: Rect64, dx: number, dy: number): void;
    function inflateRectD(rec: RectD, dx: number, dy: number): void;
    function pointsNearEqual(pt1: PointD, pt2: PointD, distanceSqrd: number): boolean;
    function stripNearDuplicates(path: PathD, minEdgeLenSqrd: number, isClosedPath: boolean): PathD;
    function stripDuplicates(path: Path64, isClosedPath: boolean): Path64;
    function polyTreeToPaths64(polyTree: PolyTree64): Paths64;
    function addPolyNodeToPathsD(polyPath: PolyPathD, paths: PathsD): void;
    function polyTreeToPathsD(polyTree: PolyTreeD): PathsD;
    function perpendicDistFromLineSqrd(pt: PointD, line1: PointD, line2: PointD): number;
    function perpendicDistFromLineSqrd64(pt: Point64, line1: Point64, line2: Point64): number;
    function ramerDouglasPeucker(path: Path64, epsilon: number): Path64;
    function ramerDouglasPeuckerPaths(paths: Paths64, epsilon: number): Paths64;
    function ramerDouglasPeuckerD(path: PathD, epsilon: number): PathD;
    function ramerDouglasPeuckerPathsD(paths: PathsD, epsilon: number): PathsD;
    function simplifyPath(path: Path64, epsilon: number, isClosedPath?: boolean): Path64;
    function simplifyPaths(paths: Paths64, epsilon: number, isClosedPaths?: boolean): Paths64;
    function simplifyPathD(path: PathD, epsilon: number, isClosedPath?: boolean): PathD;
    function simplifyPathsD(paths: PathsD, epsilon: number, isClosedPath?: boolean): PathsD;
    function trimCollinear(path: Path64, isOpen?: boolean): Path64;
    function trimCollinearD(path: PathD, precision: number, isOpen?: boolean): PathD;
    function pointInPolygon(pt: Point64, polygon: Path64): PointInPolygonResult;
    function pointInPolygonD(pt: PointD, polygon: PathD, precision?: number): PointInPolygonResult;
    function ellipse(center: Point64, radiusX: number, radiusY?: number, steps?: number): Path64;
    function ellipseD(center: PointD, radiusX: number, radiusY?: number, steps?: number): PathD;
    function triangulate(pp: Paths64, useDelaunay?: boolean): {
        result: TriangulateResult;
        solution: Paths64;
    };
    function triangulateD(pp: PathsD, decPlaces: number, useDelaunay?: boolean): {
        result: TriangulateResult;
        solution: PathsD;
    };
}
//# sourceMappingURL=Clipper.d.ts.map