/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  12 December 2025                                                *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Core structures and functions for the Clipper Library           *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
export interface Point64 {
    x: number;
    y: number;
    z?: number;
}
export interface PointD {
    x: number;
    y: number;
    z?: number;
}
export type Path64 = Point64[];
export type PathD = PointD[];
export type Paths64 = Path64[];
export type PathsD = PathD[];
export interface Rect64 {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export interface RectD {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export declare enum ClipType {
    NoClip = 0,
    Intersection = 1,
    Union = 2,
    Difference = 3,
    Xor = 4
}
export declare enum PathType {
    Subject = 0,
    Clip = 1
}
export declare enum FillRule {
    EvenOdd = 0,
    NonZero = 1,
    Positive = 2,
    Negative = 3
}
export declare enum PointInPolygonResult {
    IsOn = 0,
    IsInside = 1,
    IsOutside = 2
}
export type ZCallback64 = (bot1: Point64, top1: Point64, bot2: Point64, top2: Point64, intersectPt: Point64) => void;
export type ZCallbackD = (bot1: PointD, top1: PointD, bot2: PointD, top2: PointD, intersectPt: PointD) => void;
export declare namespace InternalClipper {
    const MaxInt64 = 9223372036854775807n;
    const MaxCoord: number;
    const max_coord: number;
    const min_coord: number;
    const Invalid64: number;
    const floatingPointTolerance = 1e-12;
    const defaultMinimumEdgeLength = 0.1;
    const maxCoordForSafeAreaProduct: number;
    const maxCoordForSafeCrossSq: number;
    function maxSafeCoordinateForScale(scale: number): number;
    function checkSafeScaleValue(value: number, maxAbs: number, context: string): void;
    function ensureSafeInteger(value: number, context: string): void;
    function crossProduct(pt1: Point64, pt2: Point64, pt3: Point64): number;
    function crossProductSign(pt1: Point64, pt2: Point64, pt3: Point64): number;
    function checkPrecision(precision: number): void;
    function isAlmostZero(value: number): boolean;
    function triSign(x: number): number;
    interface UInt128Struct {
        lo64: bigint;
        hi64: bigint;
    }
    function multiplyUInt64(a: number, b: number): UInt128Struct;
    function productsAreEqual(a: number, b: number, c: number, d: number): boolean;
    function isCollinear(pt1: Point64, sharedPt: Point64, pt2: Point64): boolean;
    function dotProduct(pt1: Point64, pt2: Point64, pt3: Point64): number;
    function dotProductSign(pt1: Point64, pt2: Point64, pt3: Point64): number;
    function area(path: Path64): number;
    function crossProductD(vec1: PointD, vec2: PointD): number;
    function dotProductD(vec1: PointD, vec2: PointD): number;
    function roundToEven(value: number): number;
    function checkCastInt64(val: number): number;
    function getLineIntersectPt(ln1a: Point64, ln1b: Point64, ln2a: Point64, ln2b: Point64): {
        intersects: boolean;
        point: Point64;
    };
    function getLineIntersectPtD(ln1a: PointD, ln1b: PointD, ln2a: PointD, ln2b: PointD): {
        success: boolean;
        ip: PointD;
    };
    function segsIntersect(seg1a: Point64, seg1b: Point64, seg2a: Point64, seg2b: Point64, inclusive?: boolean): boolean;
    function getBounds(path: Path64): Rect64;
    function getClosestPtOnSegment(offPt: Point64, seg1: Point64, seg2: Point64): Point64;
    function pointInPolygon(pt: Point64, polygon: Path64): PointInPolygonResult;
    function path2ContainsPath1(path1: Path64, path2: Path64): boolean;
}
export declare namespace Point64Utils {
    function create(x?: number, y?: number, z?: number): Point64;
    function fromPointD(pt: PointD): Point64;
    function scale(pt: Point64, scale: number): Point64;
    function equals(a: Point64, b: Point64): boolean;
    function add(a: Point64, b: Point64): Point64;
    function subtract(a: Point64, b: Point64): Point64;
    function toString(pt: Point64): string;
}
export declare namespace PointDUtils {
    function create(x?: number, y?: number, z?: number): PointD;
    function fromPoint64(pt: Point64): PointD;
    function scale(pt: PointD, scale: number): PointD;
    function equals(a: PointD, b: PointD): boolean;
    function negate(pt: PointD): void;
    function toString(pt: PointD, precision?: number): string;
}
export declare namespace Rect64Utils {
    function create(l?: number, t?: number, r?: number, b?: number): Rect64;
    function createInvalid(): Rect64;
    function width(rect: Rect64): number;
    function height(rect: Rect64): number;
    function isEmpty(rect: Rect64): boolean;
    function isValid(rect: Rect64): boolean;
    function midPoint(rect: Rect64): Point64;
    function contains(rect: Rect64, pt: Point64): boolean;
    function containsRect(rect: Rect64, rec: Rect64): boolean;
    function intersects(rect: Rect64, rec: Rect64): boolean;
    function asPath(rect: Rect64): Path64;
}
export declare namespace RectDUtils {
    function create(l?: number, t?: number, r?: number, b?: number): RectD;
    function createInvalid(): RectD;
    function width(rect: RectD): number;
    function height(rect: RectD): number;
    function isEmpty(rect: RectD): boolean;
    function midPoint(rect: RectD): PointD;
    function contains(rect: RectD, pt: PointD): boolean;
    function containsRect(rect: RectD, rec: RectD): boolean;
    function intersects(rect: RectD, rec: RectD): boolean;
    function asPath(rect: RectD): PathD;
}
export declare namespace PathUtils {
    function toString64(path: Path64): string;
    function toStringD(path: PathD, precision?: number): string;
    function reverse64(path: Path64): Path64;
    function reverseD(path: PathD): PathD;
}
export declare namespace PathsUtils {
    function toString64(paths: Paths64): string;
    function toStringD(paths: PathsD, precision?: number): string;
    function reverse64(paths: Paths64): Paths64;
    function reverseD(paths: PathsD): PathsD;
}
export declare const InvalidRect64: Rect64;
export declare const InvalidRectD: RectD;
//# sourceMappingURL=Core.d.ts.map