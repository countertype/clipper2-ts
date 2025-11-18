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

import {
  Point64, PointD, Path64, PathD, Paths64, PathsD, Rect64, RectD,
  ClipType, PathType, FillRule, PointInPolygonResult,
  InternalClipper, Point64Utils, PointDUtils, Rect64Utils, RectDUtils,
  InvalidRect64, InvalidRectD
} from './Core.js';
import { Clipper64, ClipperD, PolyTree64, PolyTreeD, PolyPathD } from './Engine.js';
import { ClipperOffset, JoinType, EndType } from './Offset.js';
import { RectClip64, RectClipLines64 } from './RectClip.js';
import { Minkowski } from './Minkowski.js';

export namespace Clipper {
  // Constants
  export const invalidRect64 = InvalidRect64;
  export const invalidRectD = InvalidRectD;

  // Boolean operations
  export function intersect(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64 {
    return booleanOp(ClipType.Intersection, subject, clip, fillRule);
  }

  export function intersectD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision: number = 2): PathsD {
    return booleanOpD(ClipType.Intersection, subject, clip, fillRule, precision);
  }

  export function union(subject: Paths64, fillRule: FillRule): Paths64;
  export function union(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64;
  export function union(subject: Paths64, clipOrFillRule: Paths64 | FillRule, fillRule?: FillRule): Paths64 {
    if (typeof clipOrFillRule === 'number') {
      // First overload: union(subject, fillRule)
      return booleanOp(ClipType.Union, subject, null, clipOrFillRule);
    } else {
      // Second overload: union(subject, clip, fillRule)
      return booleanOp(ClipType.Union, subject, clipOrFillRule, fillRule!);
    }
  }

  export function unionD(subject: PathsD, fillRule: FillRule): PathsD;
  export function unionD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision?: number): PathsD;
  export function unionD(subject: PathsD, clipOrFillRule: PathsD | FillRule, fillRuleOrPrecision?: FillRule | number, precision?: number): PathsD {
    if (typeof clipOrFillRule === 'number') {
      // First overload: unionD(subject, fillRule)
      return booleanOpD(ClipType.Union, subject, null, clipOrFillRule);
    } else {
      // Second overload: unionD(subject, clip, fillRule, precision)
      return booleanOpD(ClipType.Union, subject, clipOrFillRule, fillRuleOrPrecision as FillRule, precision || 2);
    }
  }

  export function difference(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64 {
    return booleanOp(ClipType.Difference, subject, clip, fillRule);
  }

  export function differenceD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision: number = 2): PathsD {
    return booleanOpD(ClipType.Difference, subject, clip, fillRule, precision);
  }

  export function xor(subject: Paths64, clip: Paths64, fillRule: FillRule): Paths64 {
    return booleanOp(ClipType.Xor, subject, clip, fillRule);
  }

  export function xorD(subject: PathsD, clip: PathsD, fillRule: FillRule, precision: number = 2): PathsD {
    return booleanOpD(ClipType.Xor, subject, clip, fillRule, precision);
  }

  export function booleanOp(clipType: ClipType, subject: Paths64 | null, clip: Paths64 | null, fillRule: FillRule): Paths64 {
    const solution: Paths64 = [];
    if (subject === null) return solution;
    const c = new Clipper64();
    c.addPaths(subject, PathType.Subject);
    if (clip !== null) {
      c.addPaths(clip, PathType.Clip);
    }
    c.execute(clipType, fillRule, solution);
    return solution;
  }

  export function booleanOpWithPolyTree(clipType: ClipType, subject: Paths64 | null, clip: Paths64 | null, polytree: PolyTree64, fillRule: FillRule): void {
    if (subject === null) return;
    const c = new Clipper64();
    c.addPaths(subject, PathType.Subject);
    if (clip !== null) {
      c.addPaths(clip, PathType.Clip);
    }
    c.execute(clipType, fillRule, polytree);
  }

  export function booleanOpD(clipType: ClipType, subject: PathsD, clip: PathsD | null, fillRule: FillRule, precision: number = 2): PathsD {
    const solution: PathsD = [];
    const c = new ClipperD(precision);
    c.addSubjectPaths(subject);
    if (clip !== null) {
      c.addClipPaths(clip);
    }
    c.execute(clipType, fillRule, solution);
    return solution;
  }

  export function booleanOpDWithPolyTree(
    clipType: ClipType,
    subject: PathsD | null,
    clip: PathsD | null,
    polytree: PolyTreeD,
    fillRule: FillRule,
    precision: number = 2
  ): void {
    if (subject === null) return;
    const c = new ClipperD(precision);
    c.addSubjectPaths(subject);
    if (clip !== null) {
      c.addClipPaths(clip);
    }
    c.execute(clipType, fillRule, polytree);
  }

  export function inflatePaths(paths: Paths64, delta: number, joinType: JoinType, endType: EndType, miterLimit: number = 2.0, arcTolerance: number = 0.0): Paths64 {
    const co = new ClipperOffset(miterLimit, arcTolerance);
    co.addPaths(paths, joinType, endType);
    const solution: Paths64 = [];
    co.execute(delta, solution);
    return solution;
  }

  export function inflatePathsD(paths: PathsD, delta: number, joinType: JoinType, endType: EndType, miterLimit: number = 2.0, precision: number = 2, arcTolerance: number = 0.0): PathsD {
    InternalClipper.checkPrecision(precision);
    const scale = Math.pow(10, precision);
    const tmp = scalePaths64(paths, scale);
    const co = new ClipperOffset(miterLimit, scale * arcTolerance);
    co.addPaths(tmp, joinType, endType);
    const solution: Paths64 = [];
    co.execute(delta * scale, solution); // reuse solution to receive (scaled) solution
    return scalePathsD(solution, 1 / scale);
  }

  export function rectClip(rect: Rect64, paths: Paths64): Paths64;
  export function rectClip(rect: Rect64, path: Path64): Paths64;
  export function rectClip(rect: RectD, paths: PathsD, precision?: number): PathsD;
  export function rectClip(rect: RectD, path: PathD, precision?: number): PathsD;
  export function rectClip(rect: Rect64 | RectD, pathsOrPath: Paths64 | Path64 | PathsD | PathD, precision?: number): Paths64 | PathsD {
    if ('left' in rect && typeof rect.left === 'number' && Number.isInteger(rect.left)) {
      // Rect64 case
      const rect64 = rect as Rect64;
      if (Rect64Utils.isEmpty(rect64)) return [];
      
      if (Array.isArray(pathsOrPath[0])) {
        // Paths64
        const paths = pathsOrPath as Paths64;
        if (paths.length === 0) return [];
        const rc = new RectClip64(rect64);
        return rc.execute(paths);
      } else {
        // Path64
        const path = pathsOrPath as Path64;
        if (path.length === 0) return [];
        const tmp: Paths64 = [path];
        return rectClip(rect64, tmp);
      }
    } else {
      // RectD case
      const rectD = rect as RectD;
      const prec = precision || 2;
      InternalClipper.checkPrecision(prec);
      if (RectDUtils.isEmpty(rectD)) return [];
      
      const scale = Math.pow(10, prec);
      const r = scaleRect(rectD, scale);
      
      if (Array.isArray(pathsOrPath[0])) {
        // PathsD
        const paths = pathsOrPath as PathsD;
        if (paths.length === 0) return [];
        const tmpPath = scalePaths64(paths, scale);
        const rc = new RectClip64(r);
        const result = rc.execute(tmpPath);
        return scalePathsD(result, 1 / scale);
      } else {
        // PathD
        const path = pathsOrPath as PathD;
        if (path.length === 0) return [];
        const tmp: PathsD = [path];
        return rectClip(rectD, tmp, prec);
      }
    }
  }

  export function rectClipLines(rect: Rect64, paths: Paths64): Paths64;
  export function rectClipLines(rect: Rect64, path: Path64): Paths64;
  export function rectClipLines(rect: RectD, paths: PathsD, precision?: number): PathsD;
  export function rectClipLines(rect: RectD, path: PathD, precision?: number): PathsD;
  export function rectClipLines(rect: Rect64 | RectD, pathsOrPath: Paths64 | Path64 | PathsD | PathD, precision?: number): Paths64 | PathsD {
    if ('left' in rect && typeof rect.left === 'number' && Number.isInteger(rect.left)) {
      // Rect64 case
      const rect64 = rect as Rect64;
      if (Rect64Utils.isEmpty(rect64)) return [];
      
      if (Array.isArray(pathsOrPath[0])) {
        // Paths64
        const paths = pathsOrPath as Paths64;
        if (paths.length === 0) return [];
        const rc = new RectClipLines64(rect64);
        return rc.execute(paths);
      } else {
        // Path64
        const path = pathsOrPath as Path64;
        if (path.length === 0) return [];
        const tmp: Paths64 = [path];
        return rectClipLines(rect64, tmp);
      }
    } else {
      // RectD case
      const rectD = rect as RectD;
      const prec = precision || 2;
      InternalClipper.checkPrecision(prec);
      if (RectDUtils.isEmpty(rectD)) return [];
      
      const scale = Math.pow(10, prec);
      const r = scaleRect(rectD, scale);
      
      if (Array.isArray(pathsOrPath[0])) {
        // PathsD
        const paths = pathsOrPath as PathsD;
        if (paths.length === 0) return [];
        const tmpPath = scalePaths64(paths, scale);
        const rc = new RectClipLines64(r);
        const result = rc.execute(tmpPath);
        return scalePathsD(result, 1 / scale);
      } else {
        // PathD
        const path = pathsOrPath as PathD;
        if (path.length === 0) return [];
        const tmp: PathsD = [path];
        return rectClipLines(rectD, tmp, prec);
      }
    }
  }

  export function minkowskiSum(pattern: Path64, path: Path64, isClosed: boolean): Paths64 {
    return Minkowski.sum(pattern, path, isClosed);
  }

  export function minkowskiSumD(pattern: PathD, path: PathD, isClosed: boolean): PathsD {
    return Minkowski.sumD(pattern, path, isClosed);
  }

  export function minkowskiDiff(pattern: Path64, path: Path64, isClosed: boolean): Paths64 {
    return Minkowski.diff(pattern, path, isClosed);
  }

  export function minkowskiDiffD(pattern: PathD, path: PathD, isClosed: boolean): PathsD {
    return Minkowski.diffD(pattern, path, isClosed);
  }

  export function area(path: Path64): number {
    // https://en.wikipedia.org/wiki/Shoelace_formula
    let a = 0.0;
    const cnt = path.length;
    if (cnt < 3) return 0.0;
    let prevPt = path[cnt - 1];
    for (const pt of path) {
      a += (prevPt.y + pt.y) * (prevPt.x - pt.x);
      prevPt = pt;
    }
    return a * 0.5;
  }

  export function areaPaths(paths: Paths64): number {
    let a = 0.0;
    for (const path of paths) {
      a += area(path);
    }
    return a;
  }

  export function areaD(path: PathD): number {
    let a = 0.0;
    const cnt = path.length;
    if (cnt < 3) return 0.0;
    let prevPt = path[cnt - 1];
    for (const pt of path) {
      a += (prevPt.y + pt.y) * (prevPt.x - pt.x);
      prevPt = pt;
    }
    return a * 0.5;
  }

  export function areaPathsD(paths: PathsD): number {
    let a = 0.0;
    for (const path of paths) {
      a += areaD(path);
    }
    return a;
  }

  export function isPositive(poly: Path64): boolean {
    return area(poly) >= 0;
  }

  export function isPositiveD(poly: PathD): boolean {
    return areaD(poly) >= 0;
  }

  export function path64ToString(path: Path64): string {
    let result = "";
    for (const pt of path) {
      result += Point64Utils.toString(pt);
    }
    return result + '\n';
  }

  export function paths64ToString(paths: Paths64): string {
    let result = "";
    for (const path of paths) {
      result += path64ToString(path);
    }
    return result;
  }

  export function pathDToString(path: PathD, precision: number = 2): string {
    let result = "";
    for (const pt of path) {
      result += PointDUtils.toString(pt, precision);
    }
    return result + '\n';
  }

  export function pathsDToString(paths: PathsD, precision: number = 2): string {
    let result = "";
    for (const path of paths) {
      result += pathDToString(path, precision);
    }
    return result;
  }

  export function offsetPath(path: Path64, dx: number, dy: number): Path64 {
    const result: Path64 = [];
    for (const pt of path) {
      result.push({ x: pt.x + dx, y: pt.y + dy });
    }
    return result;
  }

  export function scalePoint64(pt: Point64, scale: number): Point64 {
    return {
      x: Math.round(pt.x * scale),
      y: Math.round(pt.y * scale)
    };
  }

  export function scalePointD(pt: Point64, scale: number): PointD {
    return {
      x: pt.x * scale,
      y: pt.y * scale
    };
  }

  export function scaleRect(rec: RectD, scale: number): Rect64 {
    return {
      left: Math.round(rec.left * scale),
      top: Math.round(rec.top * scale),
      right: Math.round(rec.right * scale),
      bottom: Math.round(rec.bottom * scale)
    };
  }

  export function scalePath(path: Path64, scale: number): Path64 {
    if (InternalClipper.isAlmostZero(scale - 1)) return path;
    const result: Path64 = [];
    for (const pt of path) {
      result.push({
        x: Math.round(pt.x * scale),
        y: Math.round(pt.y * scale)
      });
    }
    return result;
  }

  export function scalePaths(paths: Paths64, scale: number): Paths64 {
    if (InternalClipper.isAlmostZero(scale - 1)) return paths;
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(scalePath(path, scale));
    }
    return result;
  }

  export function scalePathD(path: PathD, scale: number): PathD {
    if (InternalClipper.isAlmostZero(scale - 1)) return path;
    const result: PathD = [];
    for (const pt of path) {
      result.push(PointDUtils.scale(pt, scale));
    }
    return result;
  }

  export function scalePathsD(paths: PathsD, scale: number): PathsD {
    if (InternalClipper.isAlmostZero(scale - 1)) return paths;
    const result: PathsD = [];
    for (const path of paths) {
      result.push(scalePathD(path, scale));
    }
    return result;
  }

  // Unlike ScalePath, both ScalePath64 & ScalePathD also involve type conversion
  export function scalePath64(path: PathD, scale: number): Path64 {
    const result: Path64 = [];
    for (const pt of path) {
      result.push({
        x: Math.round(pt.x * scale),
        y: Math.round(pt.y * scale)
      });
    }
    return result;
  }

  export function scalePaths64(paths: PathsD, scale: number): Paths64 {
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(scalePath64(path, scale));
    }
    return result;
  }

  export function scalePathDFromInt(path: Path64, scale: number): PathD {
    const result: PathD = [];
    for (const pt of path) {
      result.push({
        x: pt.x * scale,
        y: pt.y * scale
      });
    }
    return result;
  }

  export function scalePathsDFromInt(paths: Paths64, scale: number): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      result.push(scalePathDFromInt(path, scale));
    }
    return result;
  }

  // The static functions Path64 and PathD convert path types without scaling
  export function path64FromD(path: PathD): Path64 {
    const result: Path64 = [];
    for (const pt of path) {
      result.push(Point64Utils.fromPointD(pt));
    }
    return result;
  }

  export function paths64FromD(paths: PathsD): Paths64 {
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(path64FromD(path));
    }
    return result;
  }

  export function pathsD(paths: Paths64): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      result.push(pathD(path));
    }
    return result;
  }

  export function pathD(path: Path64): PathD {
    const result: PathD = [];
    for (const pt of path) {
      result.push(PointDUtils.fromPoint64(pt));
    }
    return result;
  }

  export function translatePath(path: Path64, dx: number, dy: number): Path64 {
    const result: Path64 = [];
    for (const pt of path) {
      result.push({ x: pt.x + dx, y: pt.y + dy });
    }
    return result;
  }

  export function translatePaths(paths: Paths64, dx: number, dy: number): Paths64 {
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(offsetPath(path, dx, dy));
    }
    return result;
  }

  export function translatePathD(path: PathD, dx: number, dy: number): PathD {
    const result: PathD = [];
    for (const pt of path) {
      result.push({ x: pt.x + dx, y: pt.y + dy });
    }
    return result;
  }

  export function translatePathsD(paths: PathsD, dx: number, dy: number): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      result.push(translatePathD(path, dx, dy));
    }
    return result;
  }

  export function reversePath(path: Path64): Path64 {
    return [...path].reverse();
  }

  export function reversePathD(path: PathD): PathD {
    return [...path].reverse();
  }

  export function reversePaths(paths: Paths64): Paths64 {
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(reversePath(path));
    }
    return result;
  }

  export function reversePathsD(paths: PathsD): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      result.push(reversePathD(path));
    }
    return result;
  }

  export function getBounds(path: Path64): Rect64 {
    return InternalClipper.getBounds(path);
  }

  export function getBoundsPaths(paths: Paths64): Rect64 {
    const result = Rect64Utils.createInvalid();
    for (const path of paths) {
      for (const pt of path) {
        if (pt.x < result.left) result.left = pt.x;
        if (pt.x > result.right) result.right = pt.x;
        if (pt.y < result.top) result.top = pt.y;
        if (pt.y > result.bottom) result.bottom = pt.y;
      }
    }
    return result.left === Number.MAX_SAFE_INTEGER ? { left: 0, top: 0, right: 0, bottom: 0 } : result;
  }

  export function getBoundsD(path: PathD): RectD {
    const result = RectDUtils.createInvalid();
    for (const pt of path) {
      if (pt.x < result.left) result.left = pt.x;
      if (pt.x > result.right) result.right = pt.x;
      if (pt.y < result.top) result.top = pt.y;
      if (pt.y > result.bottom) result.bottom = pt.y;
    }
    return Math.abs(result.left - Number.MAX_VALUE) < InternalClipper.floatingPointTolerance ? 
      { left: 0, top: 0, right: 0, bottom: 0 } : result;
  }

  export function getBoundsPathsD(paths: PathsD): RectD {
    const result = RectDUtils.createInvalid();
    for (const path of paths) {
      for (const pt of path) {
        if (pt.x < result.left) result.left = pt.x;
        if (pt.x > result.right) result.right = pt.x;
        if (pt.y < result.top) result.top = pt.y;
        if (pt.y > result.bottom) result.bottom = pt.y;
      }
    }
    return Math.abs(result.left - Number.MAX_VALUE) < InternalClipper.floatingPointTolerance ? 
      { left: 0, top: 0, right: 0, bottom: 0 } : result;
  }

  export function makePath(arr: number[]): Path64 {
    const len = Math.floor(arr.length / 2);
    const p: Path64 = [];
    for (let i = 0; i < len; i++) {
      p.push({ x: arr[i * 2], y: arr[i * 2 + 1] });
    }
    return p;
  }

  export function makePathD(arr: number[]): PathD {
    const len = Math.floor(arr.length / 2);
    const p: PathD = [];
    for (let i = 0; i < len; i++) {
      p.push({ x: arr[i * 2], y: arr[i * 2 + 1] });
    }
    return p;
  }

  export function sqr(val: number): number {
    return val * val;
  }

  export function distanceSqr(pt1: Point64, pt2: Point64): number {
    return sqr(pt1.x - pt2.x) + sqr(pt1.y - pt2.y);
  }

  export function midPoint(pt1: Point64, pt2: Point64): Point64 {
    return { x: Math.round((pt1.x + pt2.x) / 2), y: Math.round((pt1.y + pt2.y) / 2) };
  }

  export function midPointD(pt1: PointD, pt2: PointD): PointD {
    return { x: (pt1.x + pt2.x) / 2, y: (pt1.y + pt2.y) / 2 };
  }

  export function inflateRect(rec: Rect64, dx: number, dy: number): void {
    rec.left -= dx;
    rec.right += dx;
    rec.top -= dy;
    rec.bottom += dy;
  }

  export function inflateRectD(rec: RectD, dx: number, dy: number): void {
    rec.left -= dx;
    rec.right += dx;
    rec.top -= dy;
    rec.bottom += dy;
  }

  export function pointsNearEqual(pt1: PointD, pt2: PointD, distanceSqrd: number): boolean {
    return sqr(pt1.x - pt2.x) + sqr(pt1.y - pt2.y) < distanceSqrd;
  }

  export function stripNearDuplicates(path: PathD, minEdgeLenSqrd: number, isClosedPath: boolean): PathD {
    const cnt = path.length;
    const result: PathD = [];
    if (cnt === 0) return result;
    
    let lastPt = path[0];
    result.push(lastPt);
    for (let i = 1; i < cnt; i++) {
      if (!pointsNearEqual(lastPt, path[i], minEdgeLenSqrd)) {
        lastPt = path[i];
        result.push(lastPt);
      }
    }

    if (isClosedPath && pointsNearEqual(lastPt, result[0], minEdgeLenSqrd)) {
      result.pop();
    }

    return result;
  }

  export function stripDuplicates(path: Path64, isClosedPath: boolean): Path64 {
    const cnt = path.length;
    const result: Path64 = [];
    if (cnt === 0) return result;
    
    let lastPt = path[0];
    result.push(lastPt);
    for (let i = 1; i < cnt; i++) {
      if (!Point64Utils.equals(lastPt, path[i])) {
        lastPt = path[i];
        result.push(lastPt);
      }
    }
    if (isClosedPath && Point64Utils.equals(lastPt, result[0])) {
      result.pop();
    }
    return result;
  }

  function addPolyNodeToPaths(polyPath: PolyTree64, paths: Paths64): void {
    if (polyPath.poly && polyPath.poly.length > 0) {
      paths.push(polyPath.poly);
    }
    for (let i = 0; i < polyPath.count; i++) {
      addPolyNodeToPaths(polyPath.child(i), paths);
    }
  }

  export function polyTreeToPaths64(polyTree: PolyTree64): Paths64 {
    const result: Paths64 = [];
    for (let i = 0; i < polyTree.count; i++) {
      addPolyNodeToPaths(polyTree.child(i), result);
    }
    return result;
  }

  export function addPolyNodeToPathsD(polyPath: PolyPathD, paths: PathsD): void {
    if (polyPath.poly && polyPath.poly.length > 0) {
      paths.push(polyPath.poly);
    }
    for (let i = 0; i < polyPath.count; i++) {
      addPolyNodeToPathsD(polyPath.child(i), paths);
    }
  }

  export function polyTreeToPathsD(polyTree: PolyTreeD): PathsD {
    const result: PathsD = [];
    for (let i = 0; i < polyTree.count; i++) {
      addPolyNodeToPathsD(polyTree.child(i), result);
    }
    return result;
  }

  export function perpendicDistFromLineSqrd(pt: PointD, line1: PointD, line2: PointD): number {
    const a = pt.x - line1.x;
    const b = pt.y - line1.y;
    const c = line2.x - line1.x;
    const d = line2.y - line1.y;
    if (c === 0 && d === 0) return 0;
    return sqr(a * d - c * b) / (c * c + d * d);
  }

  export function perpendicDistFromLineSqrd64(pt: Point64, line1: Point64, line2: Point64): number {
    const a = pt.x - line1.x;
    const b = pt.y - line1.y;
    const c = line2.x - line1.x;
    const d = line2.y - line1.y;
    if (c === 0 && d === 0) return 0;
    return sqr(a * d - c * b) / (c * c + d * d);
  }

  function rdp(path: Path64, begin: number, end: number, epsSqrd: number, flags: boolean[]): void {
    while (true) {
      let idx = 0;
      let maxD = 0;
      while (end > begin && Point64Utils.equals(path[begin], path[end])) flags[end--] = false;
      for (let i = begin + 1; i < end; ++i) {
        // PerpendicDistFromLineSqrd - avoids expensive Sqrt()
        const d = perpendicDistFromLineSqrd64(path[i], path[begin], path[end]);
        if (d <= maxD) continue;
        maxD = d;
        idx = i;
      }

      if (maxD <= epsSqrd) return;
      flags[idx] = true;
      if (idx > begin + 1) rdp(path, begin, idx, epsSqrd, flags);
      if (idx < end - 1) {
        begin = idx;
        continue;
      }
      break;
    }
  }

  export function ramerDouglasPeucker(path: Path64, epsilon: number): Path64 {
    const len = path.length;
    if (len < 5) return path;
    const flags = new Array(len).fill(false);
    flags[0] = true;
    flags[len - 1] = true;
    rdp(path, 0, len - 1, sqr(epsilon), flags);
    const result: Path64 = [];
    for (let i = 0; i < len; ++i) {
      if (flags[i]) result.push(path[i]);
    }
    return result;
  }

  export function ramerDouglasPeuckerPaths(paths: Paths64, epsilon: number): Paths64 {
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(ramerDouglasPeucker(path, epsilon));
    }
    return result;
  }

  function rdpD(path: PathD, begin: number, end: number, epsSqrd: number, flags: boolean[]): void {
    while (true) {
      let idx = 0;
      let maxD = 0;
      while (end > begin && PointDUtils.equals(path[begin], path[end])) flags[end--] = false;
      for (let i = begin + 1; i < end; ++i) {
        // PerpendicDistFromLineSqrd - avoids expensive Sqrt()
        const d = perpendicDistFromLineSqrd(path[i], path[begin], path[end]);
        if (d <= maxD) continue;
        maxD = d;
        idx = i;
      }

      if (maxD <= epsSqrd) return;
      flags[idx] = true;
      if (idx > begin + 1) rdpD(path, begin, idx, epsSqrd, flags);
      if (idx < end - 1) {
        begin = idx;
        continue;
      }
      break;
    }
  }

  export function ramerDouglasPeuckerD(path: PathD, epsilon: number): PathD {
    const len = path.length;
    if (len < 5) return path;
    const flags = new Array(len).fill(false);
    flags[0] = true;
    flags[len - 1] = true;
    rdpD(path, 0, len - 1, sqr(epsilon), flags);
    const result: PathD = [];
    for (let i = 0; i < len; ++i) {
      if (flags[i]) result.push(path[i]);
    }
    return result;
  }

  export function ramerDouglasPeuckerPathsD(paths: PathsD, epsilon: number): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      result.push(ramerDouglasPeuckerD(path, epsilon));
    }
    return result;
  }

  function getNext(current: number, high: number, flags: boolean[]): number {
    ++current;
    while (current <= high && flags[current]) ++current;
    if (current <= high) return current;
    current = 0;
    while (flags[current]) ++current;
    return current;
  }

  function getPrior(current: number, high: number, flags: boolean[]): number {
    if (current === 0) current = high;
    else --current;
    while (current > 0 && flags[current]) --current;
    if (!flags[current]) return current;
    current = high;
    while (flags[current]) --current;
    return current;
  }

  export function simplifyPath(path: Path64, epsilon: number, isClosedPath: boolean = true): Path64 {
    const len = path.length;
    const high = len - 1;
    const epsSqr = sqr(epsilon);
    if (len < 4) return path;

    const flags = new Array(len).fill(false);
    const dsq = new Array(len).fill(0);
    let curr = 0;

    if (isClosedPath) {
      dsq[0] = perpendicDistFromLineSqrd64(path[0], path[high], path[1]);
      dsq[high] = perpendicDistFromLineSqrd64(path[high], path[0], path[high - 1]);
    } else {
      dsq[0] = Number.MAX_VALUE;
      dsq[high] = Number.MAX_VALUE;
    }

    for (let i = 1; i < high; ++i) {
      dsq[i] = perpendicDistFromLineSqrd64(path[i], path[i - 1], path[i + 1]);
    }

    while (true) {
      if (dsq[curr] > epsSqr) {
        const start = curr;
        do {
          curr = getNext(curr, high, flags);
        } while (curr !== start && dsq[curr] > epsSqr);
        if (curr === start) break;
      }

      const prev = getPrior(curr, high, flags);
      const next = getNext(curr, high, flags);
      if (next === prev) break;

      let prior2: number;
      if (dsq[next] < dsq[curr]) {
        prior2 = prev;
        const newPrev = curr;
        curr = next;
        const newNext = getNext(next, high, flags);
        flags[curr] = true;
        curr = newNext;
        const nextNext = getNext(newNext, high, flags);
        if (isClosedPath || ((curr !== high) && (curr !== 0))) {
          dsq[curr] = perpendicDistFromLineSqrd64(path[curr], path[newPrev], path[nextNext]);
        }
        if (isClosedPath || ((newPrev !== 0) && (newPrev !== high))) {
          dsq[newPrev] = perpendicDistFromLineSqrd64(path[newPrev], path[prior2], path[curr]);
        }
      } else {
        prior2 = getPrior(prev, high, flags);
        flags[curr] = true;
        curr = next;
        const nextNext = getNext(next, high, flags);
        if (isClosedPath || ((curr !== high) && (curr !== 0))) {
          dsq[curr] = perpendicDistFromLineSqrd64(path[curr], path[prev], path[nextNext]);
        }
        if (isClosedPath || ((prev !== 0) && (prev !== high))) {
          dsq[prev] = perpendicDistFromLineSqrd64(path[prev], path[prior2], path[curr]);
        }
      }
    }
    const result: Path64 = [];
    for (let i = 0; i < len; i++) {
      if (!flags[i]) result.push(path[i]);
    }
    return result;
  }

  export function simplifyPaths(paths: Paths64, epsilon: number, isClosedPaths: boolean = true): Paths64 {
    const result: Paths64 = [];
    for (const path of paths) {
      result.push(simplifyPath(path, epsilon, isClosedPaths));
    }
    return result;
  }

  export function simplifyPathD(path: PathD, epsilon: number, isClosedPath: boolean = true): PathD {
    const len = path.length;
    const high = len - 1;
    const epsSqr = sqr(epsilon);
    if (len < 4) return path;

    const flags = new Array(len).fill(false);
    const dsq = new Array(len).fill(0);
    let curr = 0;
    
    if (isClosedPath) {
      dsq[0] = perpendicDistFromLineSqrd(path[0], path[high], path[1]);
      dsq[high] = perpendicDistFromLineSqrd(path[high], path[0], path[high - 1]);
    } else {
      dsq[0] = Number.MAX_VALUE;
      dsq[high] = Number.MAX_VALUE;
    }
    
    for (let i = 1; i < high; ++i) {
      dsq[i] = perpendicDistFromLineSqrd(path[i], path[i - 1], path[i + 1]);
    }

    while (true) {
      if (dsq[curr] > epsSqr) {
        const start = curr;
        do {
          curr = getNext(curr, high, flags);
        } while (curr !== start && dsq[curr] > epsSqr);
        if (curr === start) break;
      }

      const prev = getPrior(curr, high, flags);
      const next = getNext(curr, high, flags);
      if (next === prev) break;

      let prior2: number;
      if (dsq[next] < dsq[curr]) {
        prior2 = prev;
        const newPrev = curr;
        curr = next;
        const newNext = getNext(next, high, flags);
        flags[curr] = true;
        curr = newNext;
        const nextNext = getNext(newNext, high, flags);
        if (isClosedPath || ((curr !== high) && (curr !== 0))) {
          dsq[curr] = perpendicDistFromLineSqrd(path[curr], path[newPrev], path[nextNext]);
        }
        if (isClosedPath || ((newPrev !== 0) && (newPrev !== high))) {
          dsq[newPrev] = perpendicDistFromLineSqrd(path[newPrev], path[prior2], path[curr]);
        }
      } else {
        prior2 = getPrior(prev, high, flags);
        flags[curr] = true;
        curr = next;
        const nextNext = getNext(next, high, flags);
        if (isClosedPath || ((curr !== high) && (curr !== 0))) {
          dsq[curr] = perpendicDistFromLineSqrd(path[curr], path[prev], path[nextNext]);
        }
        if (isClosedPath || ((prev !== 0) && (prev !== high))) {
          dsq[prev] = perpendicDistFromLineSqrd(path[prev], path[prior2], path[curr]);
        }
      }
    }
    const result: PathD = [];
    for (let i = 0; i < len; i++) {
      if (!flags[i]) result.push(path[i]);
    }
    return result;
  }

  export function simplifyPathsD(paths: PathsD, epsilon: number, isClosedPath: boolean = true): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      result.push(simplifyPathD(path, epsilon, isClosedPath));
    }
    return result;
  }

  export function trimCollinear(path: Path64, isOpen: boolean = false): Path64 {
    let len = path.length;
    let i = 0;
    if (!isOpen) {
      while (i < len - 1 && InternalClipper.isCollinear(path[len - 1], path[i], path[i + 1])) i++;
      while (i < len - 1 && InternalClipper.isCollinear(path[len - 2], path[len - 1], path[i])) len--;
    }

    if (len - i < 3) {
      if (!isOpen || len < 2 || Point64Utils.equals(path[0], path[1])) {
        return [];
      }
      return path;
    }

    const result: Path64 = [];
    let last = path[i];
    result.push(last);
    for (i++; i < len - 1; i++) {
      if (InternalClipper.isCollinear(last, path[i], path[i + 1])) continue;
      last = path[i];
      result.push(last);
    }

    if (isOpen) {
      result.push(path[len - 1]);
    } else if (!InternalClipper.isCollinear(last, path[len - 1], result[0])) {
      result.push(path[len - 1]);
    } else {
      while (result.length > 2 && InternalClipper.isCollinear(
        result[result.length - 1], result[result.length - 2], result[0])) {
        result.pop();
      }
      if (result.length < 3) {
        result.length = 0;
      }
    }
    return result;
  }

  export function trimCollinearD(path: PathD, precision: number, isOpen: boolean = false): PathD {
    InternalClipper.checkPrecision(precision);
    const scale = Math.pow(10, precision);
    let p = scalePath64(path, scale);
    p = trimCollinear(p, isOpen);
    return scalePathDFromInt(p, 1 / scale);
  }

  export function pointInPolygon(pt: Point64, polygon: Path64): PointInPolygonResult {
    return InternalClipper.pointInPolygon(pt, polygon);
  }

  export function pointInPolygonD(pt: PointD, polygon: PathD, precision: number = 2): PointInPolygonResult {
    InternalClipper.checkPrecision(precision);
    const scale = Math.pow(10, precision);
    const p = Point64Utils.fromPointD(PointDUtils.scale(pt, scale));
    const pathScaled = scalePath64(polygon, scale);
    return InternalClipper.pointInPolygon(p, pathScaled);
  }

  export function ellipse(center: Point64, radiusX: number, radiusY: number = 0, steps: number = 0): Path64 {
    if (radiusX <= 0) return [];
    if (radiusY <= 0) radiusY = radiusX;
    if (steps <= 2) {
      steps = Math.ceil(Math.PI * Math.sqrt((radiusX + radiusY) / 2));
    }

    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result: Path64 = [{ x: Math.round(center.x + radiusX), y: center.y }];
    
    for (let i = 1; i < steps; ++i) {
      result.push({
        x: Math.round(center.x + radiusX * dx),
        y: Math.round(center.y + radiusY * dy)
      });
      const x = dx * co - dy * si;
      dy = dy * co + dx * si;
      dx = x;
    }
    return result;
  }

  export function ellipseD(center: PointD, radiusX: number, radiusY: number = 0, steps: number = 0): PathD {
    if (radiusX <= 0) return [];
    if (radiusY <= 0) radiusY = radiusX;
    if (steps <= 2) {
      steps = Math.ceil(Math.PI * Math.sqrt((radiusX + radiusY) / 2));
    }

    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result: PathD = [{ x: center.x + radiusX, y: center.y }];
    
    for (let i = 1; i < steps; ++i) {
      result.push({
        x: center.x + radiusX * dx,
        y: center.y + radiusY * dy
      });
      const x = dx * co - dy * si;
      dy = dy * co + dx * si;
      dx = x;
    }
    return result;
  }
}
