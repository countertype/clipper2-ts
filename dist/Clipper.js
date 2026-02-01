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
import { ClipType, PathType, InternalClipper, Point64Utils, PointDUtils, Rect64Utils, RectDUtils, InvalidRect64, InvalidRectD } from './Core.js';
import { Clipper64, ClipperD } from './Engine.js';
import { ClipperOffset } from './Offset.js';
import { RectClip64, RectClipLines64 } from './RectClip.js';
import { Minkowski } from './Minkowski.js';
import { Delaunay, TriangulateResult } from './Triangulation.js';
// Constants
export const invalidRect64 = InvalidRect64;
export const invalidRectD = InvalidRectD;
// Boolean operations
export function intersect(subject, clip, fillRule) {
    return booleanOp(ClipType.Intersection, subject, clip, fillRule);
}
export function intersectD(subject, clip, fillRule, precision = 2) {
    return booleanOpD(ClipType.Intersection, subject, clip, fillRule, precision);
}
export function union(subject, clipOrFillRule, fillRule) {
    if (typeof clipOrFillRule === 'number') {
        // First overload: union(subject, fillRule)
        return booleanOp(ClipType.Union, subject, null, clipOrFillRule);
    }
    else {
        // Second overload: union(subject, clip, fillRule)
        return booleanOp(ClipType.Union, subject, clipOrFillRule, fillRule);
    }
}
export function unionD(subject, clipOrFillRule, fillRuleOrPrecision, precision) {
    if (typeof clipOrFillRule === 'number') {
        // First overload: unionD(subject, fillRule)
        return booleanOpD(ClipType.Union, subject, null, clipOrFillRule);
    }
    else {
        // Second overload: unionD(subject, clip, fillRule, precision)
        return booleanOpD(ClipType.Union, subject, clipOrFillRule, fillRuleOrPrecision, precision || 2);
    }
}
export function difference(subject, clip, fillRule) {
    return booleanOp(ClipType.Difference, subject, clip, fillRule);
}
export function differenceD(subject, clip, fillRule, precision = 2) {
    return booleanOpD(ClipType.Difference, subject, clip, fillRule, precision);
}
export function xor(subject, clip, fillRule) {
    return booleanOp(ClipType.Xor, subject, clip, fillRule);
}
export function xorD(subject, clip, fillRule, precision = 2) {
    return booleanOpD(ClipType.Xor, subject, clip, fillRule, precision);
}
export function booleanOp(clipType, subject, clip, fillRule) {
    const solution = [];
    if (subject === null)
        return solution;
    const c = new Clipper64();
    c.addPaths(subject, PathType.Subject);
    if (clip !== null) {
        c.addPaths(clip, PathType.Clip);
    }
    c.execute(clipType, fillRule, solution);
    return solution;
}
export function booleanOpWithPolyTree(clipType, subject, clip, polytree, fillRule) {
    if (subject === null)
        return;
    const c = new Clipper64();
    c.addPaths(subject, PathType.Subject);
    if (clip !== null) {
        c.addPaths(clip, PathType.Clip);
    }
    c.execute(clipType, fillRule, polytree);
}
export function booleanOpD(clipType, subject, clip, fillRule, precision = 2) {
    const solution = [];
    const c = new ClipperD(precision);
    c.addSubjectPaths(subject);
    if (clip !== null) {
        c.addClipPaths(clip);
    }
    c.execute(clipType, fillRule, solution);
    return solution;
}
export function booleanOpDWithPolyTree(clipType, subject, clip, polytree, fillRule, precision = 2) {
    if (subject === null)
        return;
    const c = new ClipperD(precision);
    c.addSubjectPaths(subject);
    if (clip !== null) {
        c.addClipPaths(clip);
    }
    c.execute(clipType, fillRule, polytree);
}
export function inflatePaths(paths, delta, joinType, endType, miterLimit = 2.0, arcTolerance = 0.0) {
    const co = new ClipperOffset(miterLimit, arcTolerance);
    co.addPaths(paths, joinType, endType);
    const solution = [];
    co.execute(delta, solution);
    return solution;
}
export function inflatePathsD(paths, delta, joinType, endType, miterLimit = 2.0, precision = 2, arcTolerance = 0.0) {
    InternalClipper.checkPrecision(precision);
    const scale = Math.pow(10, precision);
    const tmp = scalePaths64(paths, scale);
    const co = new ClipperOffset(miterLimit, scale * arcTolerance);
    co.addPaths(tmp, joinType, endType);
    const solution = [];
    co.execute(delta * scale, solution); // reuse solution to receive (scaled) solution
    return scalePathsD(solution, 1 / scale);
}
export function rectClip(rect, pathsOrPath, precision) {
    if ('left' in rect && typeof rect.left === 'number' && Number.isInteger(rect.left)) {
        // Rect64 case
        const rect64 = rect;
        if (Rect64Utils.isEmpty(rect64))
            return [];
        if (Array.isArray(pathsOrPath[0])) {
            // Paths64
            const paths = pathsOrPath;
            if (paths.length === 0)
                return [];
            const rc = new RectClip64(rect64);
            return rc.execute(paths);
        }
        else {
            // Path64
            const path = pathsOrPath;
            if (path.length === 0)
                return [];
            const tmp = [path];
            return rectClip(rect64, tmp);
        }
    }
    else {
        // RectD case
        const rectD = rect;
        const prec = precision || 2;
        InternalClipper.checkPrecision(prec);
        if (RectDUtils.isEmpty(rectD))
            return [];
        const scale = Math.pow(10, prec);
        const r = scaleRect(rectD, scale);
        if (Array.isArray(pathsOrPath[0])) {
            // PathsD
            const paths = pathsOrPath;
            if (paths.length === 0)
                return [];
            const tmpPath = scalePaths64(paths, scale);
            const rc = new RectClip64(r);
            const result = rc.execute(tmpPath);
            return scalePathsD(result, 1 / scale);
        }
        else {
            // PathD
            const path = pathsOrPath;
            if (path.length === 0)
                return [];
            const tmp = [path];
            return rectClip(rectD, tmp, prec);
        }
    }
}
export function rectClipLines(rect, pathsOrPath, precision) {
    if ('left' in rect && typeof rect.left === 'number' && Number.isInteger(rect.left)) {
        // Rect64 case
        const rect64 = rect;
        if (Rect64Utils.isEmpty(rect64))
            return [];
        if (Array.isArray(pathsOrPath[0])) {
            // Paths64
            const paths = pathsOrPath;
            if (paths.length === 0)
                return [];
            const rc = new RectClipLines64(rect64);
            return rc.execute(paths);
        }
        else {
            // Path64
            const path = pathsOrPath;
            if (path.length === 0)
                return [];
            const tmp = [path];
            return rectClipLines(rect64, tmp);
        }
    }
    else {
        // RectD case
        const rectD = rect;
        const prec = precision || 2;
        InternalClipper.checkPrecision(prec);
        if (RectDUtils.isEmpty(rectD))
            return [];
        const scale = Math.pow(10, prec);
        const r = scaleRect(rectD, scale);
        if (Array.isArray(pathsOrPath[0])) {
            // PathsD
            const paths = pathsOrPath;
            if (paths.length === 0)
                return [];
            const tmpPath = scalePaths64(paths, scale);
            const rc = new RectClipLines64(r);
            const result = rc.execute(tmpPath);
            return scalePathsD(result, 1 / scale);
        }
        else {
            // PathD
            const path = pathsOrPath;
            if (path.length === 0)
                return [];
            const tmp = [path];
            return rectClipLines(rectD, tmp, prec);
        }
    }
}
export function minkowskiSum(pattern, path, isClosed) {
    return Minkowski.sum(pattern, path, isClosed);
}
export function minkowskiSumD(pattern, path, isClosed) {
    return Minkowski.sumD(pattern, path, isClosed);
}
export function minkowskiDiff(pattern, path, isClosed) {
    return Minkowski.diff(pattern, path, isClosed);
}
export function minkowskiDiffD(pattern, path, isClosed) {
    return Minkowski.diffD(pattern, path, isClosed);
}
export function area(path) {
    return InternalClipper.area(path);
}
export function areaPaths(paths) {
    let a = 0.0;
    for (const path of paths) {
        a += area(path);
    }
    return a;
}
export function areaD(path) {
    let a = 0.0;
    const cnt = path.length;
    if (cnt < 3)
        return 0.0;
    let prevPt = path[cnt - 1];
    for (const pt of path) {
        a += (prevPt.y + pt.y) * (prevPt.x - pt.x);
        prevPt = pt;
    }
    return a * 0.5;
}
export function areaPathsD(paths) {
    let a = 0.0;
    for (const path of paths) {
        a += areaD(path);
    }
    return a;
}
export function isPositive(poly) {
    return area(poly) >= 0;
}
export function isPositiveD(poly) {
    return areaD(poly) >= 0;
}
export function path64ToString(path) {
    let result = "";
    for (const pt of path) {
        result += Point64Utils.toString(pt);
    }
    return result + '\n';
}
export function paths64ToString(paths) {
    let result = "";
    for (const path of paths) {
        result += path64ToString(path);
    }
    return result;
}
export function pathDToString(path, precision = 2) {
    let result = "";
    for (const pt of path) {
        result += PointDUtils.toString(pt, precision);
    }
    return result + '\n';
}
export function pathsDToString(paths, precision = 2) {
    let result = "";
    for (const path of paths) {
        result += pathDToString(path, precision);
    }
    return result;
}
export function offsetPath(path, dx, dy) {
    const result = [];
    for (const pt of path) {
        result.push({ x: pt.x + dx, y: pt.y + dy });
    }
    return result;
}
export function scalePoint64(pt, scale) {
    return {
        x: Math.round(pt.x * scale),
        y: Math.round(pt.y * scale)
    };
}
export function scalePointD(pt, scale) {
    return {
        x: pt.x * scale,
        y: pt.y * scale
    };
}
export function scaleRect(rec, scale) {
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    InternalClipper.checkSafeScaleValue(rec.left, maxAbs, "scaleRect");
    InternalClipper.checkSafeScaleValue(rec.top, maxAbs, "scaleRect");
    InternalClipper.checkSafeScaleValue(rec.right, maxAbs, "scaleRect");
    InternalClipper.checkSafeScaleValue(rec.bottom, maxAbs, "scaleRect");
    return {
        left: Math.round(rec.left * scale),
        top: Math.round(rec.top * scale),
        right: Math.round(rec.right * scale),
        bottom: Math.round(rec.bottom * scale)
    };
}
export function scalePath(path, scale) {
    if (InternalClipper.isAlmostZero(scale - 1))
        return path;
    const result = [];
    for (const pt of path) {
        result.push({
            x: Math.round(pt.x * scale),
            y: Math.round(pt.y * scale)
        });
    }
    return result;
}
export function scalePaths(paths, scale) {
    if (InternalClipper.isAlmostZero(scale - 1))
        return paths;
    const result = [];
    for (const path of paths) {
        result.push(scalePath(path, scale));
    }
    return result;
}
export function scalePathD(path, scale) {
    if (InternalClipper.isAlmostZero(scale - 1))
        return path;
    const result = [];
    for (const pt of path) {
        result.push(PointDUtils.scale(pt, scale));
    }
    return result;
}
export function scalePathsD(paths, scale) {
    if (InternalClipper.isAlmostZero(scale - 1))
        return paths;
    const result = [];
    for (const path of paths) {
        result.push(scalePathD(path, scale));
    }
    return result;
}
// Unlike ScalePath, both ScalePath64 & ScalePathD also involve type conversion
export function scalePath64(path, scale) {
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    const result = [];
    for (const pt of path) {
        InternalClipper.checkSafeScaleValue(pt.x, maxAbs, "scalePath64");
        InternalClipper.checkSafeScaleValue(pt.y, maxAbs, "scalePath64");
        result.push({
            x: Math.round(pt.x * scale),
            y: Math.round(pt.y * scale)
        });
    }
    return result;
}
export function scalePaths64(paths, scale) {
    const result = [];
    for (const path of paths) {
        result.push(scalePath64(path, scale));
    }
    return result;
}
export function scalePathDFromInt(path, scale) {
    const result = [];
    for (const pt of path) {
        result.push({
            x: pt.x * scale,
            y: pt.y * scale
        });
    }
    return result;
}
export function scalePathsDFromInt(paths, scale) {
    const result = [];
    for (const path of paths) {
        result.push(scalePathDFromInt(path, scale));
    }
    return result;
}
// The static functions Path64 and PathD convert path types without scaling
export function path64FromD(path) {
    const result = [];
    for (const pt of path) {
        result.push(Point64Utils.fromPointD(pt));
    }
    return result;
}
export function paths64FromD(paths) {
    const result = [];
    for (const path of paths) {
        result.push(path64FromD(path));
    }
    return result;
}
export function pathsD(paths) {
    const result = [];
    for (const path of paths) {
        result.push(pathD(path));
    }
    return result;
}
export function pathD(path) {
    const result = [];
    for (const pt of path) {
        result.push(PointDUtils.fromPoint64(pt));
    }
    return result;
}
export function translatePath(path, dx, dy) {
    const result = [];
    for (const pt of path) {
        result.push({ x: pt.x + dx, y: pt.y + dy });
    }
    return result;
}
export function translatePaths(paths, dx, dy) {
    const result = [];
    for (const path of paths) {
        result.push(offsetPath(path, dx, dy));
    }
    return result;
}
export function translatePathD(path, dx, dy) {
    const result = [];
    for (const pt of path) {
        result.push({ x: pt.x + dx, y: pt.y + dy });
    }
    return result;
}
export function translatePathsD(paths, dx, dy) {
    const result = [];
    for (const path of paths) {
        result.push(translatePathD(path, dx, dy));
    }
    return result;
}
export function reversePath(path) {
    return [...path].reverse();
}
export function reversePathD(path) {
    return [...path].reverse();
}
export function reversePaths(paths) {
    const result = [];
    for (const path of paths) {
        result.push(reversePath(path));
    }
    return result;
}
export function reversePathsD(paths) {
    const result = [];
    for (const path of paths) {
        result.push(reversePathD(path));
    }
    return result;
}
export function getBounds(path) {
    return InternalClipper.getBounds(path);
}
export function getBoundsPaths(paths) {
    const result = Rect64Utils.createInvalid();
    for (const path of paths) {
        for (const pt of path) {
            if (pt.x < result.left)
                result.left = pt.x;
            if (pt.x > result.right)
                result.right = pt.x;
            if (pt.y < result.top)
                result.top = pt.y;
            if (pt.y > result.bottom)
                result.bottom = pt.y;
        }
    }
    return result.left === Number.MAX_SAFE_INTEGER ? { left: 0, top: 0, right: 0, bottom: 0 } : result;
}
export function getBoundsD(path) {
    const result = RectDUtils.createInvalid();
    for (const pt of path) {
        if (pt.x < result.left)
            result.left = pt.x;
        if (pt.x > result.right)
            result.right = pt.x;
        if (pt.y < result.top)
            result.top = pt.y;
        if (pt.y > result.bottom)
            result.bottom = pt.y;
    }
    return Math.abs(result.left - Number.MAX_VALUE) < InternalClipper.floatingPointTolerance ?
        { left: 0, top: 0, right: 0, bottom: 0 } : result;
}
export function getBoundsPathsD(paths) {
    const result = RectDUtils.createInvalid();
    for (const path of paths) {
        for (const pt of path) {
            if (pt.x < result.left)
                result.left = pt.x;
            if (pt.x > result.right)
                result.right = pt.x;
            if (pt.y < result.top)
                result.top = pt.y;
            if (pt.y > result.bottom)
                result.bottom = pt.y;
        }
    }
    return Math.abs(result.left - Number.MAX_VALUE) < InternalClipper.floatingPointTolerance ?
        { left: 0, top: 0, right: 0, bottom: 0 } : result;
}
export function makePath(arr) {
    const len = Math.floor(arr.length / 2);
    const p = [];
    for (let i = 0; i < len; i++) {
        p.push({ x: arr[i * 2], y: arr[i * 2 + 1], z: 0 });
    }
    return p;
}
export function makePathD(arr) {
    const len = Math.floor(arr.length / 2);
    const p = [];
    for (let i = 0; i < len; i++) {
        p.push({ x: arr[i * 2], y: arr[i * 2 + 1], z: 0 });
    }
    return p;
}
export function sqr(val) {
    return val * val;
}
export function distanceSqr(pt1, pt2) {
    const dx = pt1.x - pt2.x;
    const dy = pt1.y - pt2.y;
    if (Number.isSafeInteger(dx) && Number.isSafeInteger(dy)) {
        const dxAbs = Math.abs(dx);
        const dyAbs = Math.abs(dy);
        const maxDelta = InternalClipper.maxCoordForSafeAreaProduct * 2; // maxDeltaForSafeProduct
        if (dxAbs <= maxDelta && dyAbs <= maxDelta) {
            const dist = dx * dx + dy * dy;
            if (dist <= Number.MAX_SAFE_INTEGER)
                return dist;
        }
        const dxSq = BigInt(dx) * BigInt(dx);
        const dySq = BigInt(dy) * BigInt(dy);
        return Number(dxSq + dySq);
    }
    return sqr(dx) + sqr(dy);
}
export function midPoint(pt1, pt2) {
    if (Number.isSafeInteger(pt1.x) && Number.isSafeInteger(pt2.x) &&
        Number.isSafeInteger(pt1.y) && Number.isSafeInteger(pt2.y) &&
        (Math.abs(pt1.x) + Math.abs(pt2.x) > Number.MAX_SAFE_INTEGER ||
            Math.abs(pt1.y) + Math.abs(pt2.y) > Number.MAX_SAFE_INTEGER)) {
        return {
            x: Number((BigInt(pt1.x) + BigInt(pt2.x)) / 2n),
            y: Number((BigInt(pt1.y) + BigInt(pt2.y)) / 2n)
        };
    }
    return { x: Math.round((pt1.x + pt2.x) / 2), y: Math.round((pt1.y + pt2.y) / 2) };
}
export function midPointD(pt1, pt2) {
    return { x: (pt1.x + pt2.x) / 2, y: (pt1.y + pt2.y) / 2 };
}
export function inflateRect(rec, dx, dy) {
    rec.left -= dx;
    rec.right += dx;
    rec.top -= dy;
    rec.bottom += dy;
}
export function inflateRectD(rec, dx, dy) {
    rec.left -= dx;
    rec.right += dx;
    rec.top -= dy;
    rec.bottom += dy;
}
export function pointsNearEqual(pt1, pt2, distanceSqrd) {
    return sqr(pt1.x - pt2.x) + sqr(pt1.y - pt2.y) < distanceSqrd;
}
export function stripNearDuplicates(path, minEdgeLenSqrd, isClosedPath) {
    const cnt = path.length;
    const result = [];
    if (cnt === 0)
        return result;
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
export function stripDuplicates(path, isClosedPath) {
    const cnt = path.length;
    const result = [];
    if (cnt === 0)
        return result;
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
function addPolyNodeToPaths(polyPath, paths) {
    if (polyPath.poly && polyPath.poly.length > 0) {
        paths.push(polyPath.poly);
    }
    for (let i = 0; i < polyPath.count; i++) {
        addPolyNodeToPaths(polyPath.child(i), paths);
    }
}
export function polyTreeToPaths64(polyTree) {
    const result = [];
    for (let i = 0; i < polyTree.count; i++) {
        addPolyNodeToPaths(polyTree.child(i), result);
    }
    return result;
}
export function addPolyNodeToPathsD(polyPath, paths) {
    if (polyPath.poly && polyPath.poly.length > 0) {
        paths.push(polyPath.poly);
    }
    for (let i = 0; i < polyPath.count; i++) {
        addPolyNodeToPathsD(polyPath.child(i), paths);
    }
}
export function polyTreeToPathsD(polyTree) {
    const result = [];
    for (let i = 0; i < polyTree.count; i++) {
        addPolyNodeToPathsD(polyTree.child(i), result);
    }
    return result;
}
export function perpendicDistFromLineSqrd(pt, line1, line2) {
    const a = pt.x - line1.x;
    const b = pt.y - line1.y;
    const c = line2.x - line1.x;
    const d = line2.y - line1.y;
    if (c === 0 && d === 0)
        return 0;
    return sqr(a * d - c * b) / (c * c + d * d);
}
export function perpendicDistFromLineSqrd64(pt, line1, line2) {
    const a = pt.x - line1.x;
    const b = pt.y - line1.y;
    const c = line2.x - line1.x;
    const d = line2.y - line1.y;
    if (c === 0 && d === 0)
        return 0;
    if (Number.isSafeInteger(a) && Number.isSafeInteger(b) &&
        Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
        const cross = (BigInt(a) * BigInt(d)) - (BigInt(c) * BigInt(b));
        const crossSq = cross * cross;
        const denom = (BigInt(c) * BigInt(c)) + (BigInt(d) * BigInt(d));
        return Number(crossSq) / Number(denom);
    }
    const cross = InternalClipper.crossProduct(line1, pt, line2);
    return sqr(cross) / (c * c + d * d);
}
function rdp(path, begin, end, epsSqrd, flags) {
    while (true) {
        let idx = 0;
        let maxD = 0;
        while (end > begin && Point64Utils.equals(path[begin], path[end]))
            flags[end--] = false;
        for (let i = begin + 1; i < end; ++i) {
            // PerpendicDistFromLineSqrd - avoids expensive Sqrt()
            const d = perpendicDistFromLineSqrd64(path[i], path[begin], path[end]);
            if (d <= maxD)
                continue;
            maxD = d;
            idx = i;
        }
        if (maxD <= epsSqrd)
            return;
        flags[idx] = true;
        if (idx > begin + 1)
            rdp(path, begin, idx, epsSqrd, flags);
        if (idx < end - 1) {
            begin = idx;
            continue;
        }
        break;
    }
}
export function ramerDouglasPeucker(path, epsilon) {
    const len = path.length;
    if (len < 5)
        return path;
    const flags = new Array(len).fill(false);
    flags[0] = true;
    flags[len - 1] = true;
    rdp(path, 0, len - 1, sqr(epsilon), flags);
    const result = [];
    for (let i = 0; i < len; ++i) {
        if (flags[i])
            result.push(path[i]);
    }
    return result;
}
export function ramerDouglasPeuckerPaths(paths, epsilon) {
    const result = [];
    for (const path of paths) {
        result.push(ramerDouglasPeucker(path, epsilon));
    }
    return result;
}
function rdpD(path, begin, end, epsSqrd, flags) {
    while (true) {
        let idx = 0;
        let maxD = 0;
        while (end > begin && PointDUtils.equals(path[begin], path[end]))
            flags[end--] = false;
        for (let i = begin + 1; i < end; ++i) {
            // PerpendicDistFromLineSqrd - avoids expensive Sqrt()
            const d = perpendicDistFromLineSqrd(path[i], path[begin], path[end]);
            if (d <= maxD)
                continue;
            maxD = d;
            idx = i;
        }
        if (maxD <= epsSqrd)
            return;
        flags[idx] = true;
        if (idx > begin + 1)
            rdpD(path, begin, idx, epsSqrd, flags);
        if (idx < end - 1) {
            begin = idx;
            continue;
        }
        break;
    }
}
export function ramerDouglasPeuckerD(path, epsilon) {
    const len = path.length;
    if (len < 5)
        return path;
    const flags = new Array(len).fill(false);
    flags[0] = true;
    flags[len - 1] = true;
    rdpD(path, 0, len - 1, sqr(epsilon), flags);
    const result = [];
    for (let i = 0; i < len; ++i) {
        if (flags[i])
            result.push(path[i]);
    }
    return result;
}
export function ramerDouglasPeuckerPathsD(paths, epsilon) {
    const result = [];
    for (const path of paths) {
        result.push(ramerDouglasPeuckerD(path, epsilon));
    }
    return result;
}
function getNext(current, high, flags) {
    ++current;
    while (current <= high && flags[current])
        ++current;
    if (current <= high)
        return current;
    current = 0;
    while (flags[current])
        ++current;
    return current;
}
function getPrior(current, high, flags) {
    if (current === 0)
        current = high;
    else
        --current;
    while (current > 0 && flags[current])
        --current;
    if (!flags[current])
        return current;
    current = high;
    while (flags[current])
        --current;
    return current;
}
export function simplifyPath(path, epsilon, isClosedPath = true) {
    const len = path.length;
    const high = len - 1;
    const epsSqr = sqr(epsilon);
    if (len < 4)
        return path;
    const flags = new Array(len).fill(false);
    const dsq = new Array(len).fill(0);
    let curr = 0;
    if (isClosedPath) {
        dsq[0] = perpendicDistFromLineSqrd64(path[0], path[high], path[1]);
        dsq[high] = perpendicDistFromLineSqrd64(path[high], path[0], path[high - 1]);
    }
    else {
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
            if (curr === start)
                break;
        }
        const prev = getPrior(curr, high, flags);
        const next = getNext(curr, high, flags);
        if (next === prev)
            break;
        let prior2;
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
        }
        else {
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
    const result = [];
    for (let i = 0; i < len; i++) {
        if (!flags[i])
            result.push(path[i]);
    }
    return result;
}
export function simplifyPaths(paths, epsilon, isClosedPaths = true) {
    const result = [];
    for (const path of paths) {
        result.push(simplifyPath(path, epsilon, isClosedPaths));
    }
    return result;
}
export function simplifyPathD(path, epsilon, isClosedPath = true) {
    const len = path.length;
    const high = len - 1;
    const epsSqr = sqr(epsilon);
    if (len < 4)
        return path;
    const flags = new Array(len).fill(false);
    const dsq = new Array(len).fill(0);
    let curr = 0;
    if (isClosedPath) {
        dsq[0] = perpendicDistFromLineSqrd(path[0], path[high], path[1]);
        dsq[high] = perpendicDistFromLineSqrd(path[high], path[0], path[high - 1]);
    }
    else {
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
            if (curr === start)
                break;
        }
        const prev = getPrior(curr, high, flags);
        const next = getNext(curr, high, flags);
        if (next === prev)
            break;
        let prior2;
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
        }
        else {
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
    const result = [];
    for (let i = 0; i < len; i++) {
        if (!flags[i])
            result.push(path[i]);
    }
    return result;
}
export function simplifyPathsD(paths, epsilon, isClosedPath = true) {
    const result = [];
    for (const path of paths) {
        result.push(simplifyPathD(path, epsilon, isClosedPath));
    }
    return result;
}
export function trimCollinear(path, isOpen = false) {
    let len = path.length;
    let i = 0;
    if (!isOpen) {
        while (i < len - 1 && InternalClipper.isCollinear(path[len - 1], path[i], path[i + 1]))
            i++;
        while (i < len - 1 && InternalClipper.isCollinear(path[len - 2], path[len - 1], path[i]))
            len--;
    }
    if (len - i < 3) {
        if (!isOpen || len < 2 || Point64Utils.equals(path[0], path[1])) {
            return [];
        }
        return path;
    }
    const result = [];
    let last = path[i];
    result.push(last);
    for (i++; i < len - 1; i++) {
        if (InternalClipper.isCollinear(last, path[i], path[i + 1]))
            continue;
        last = path[i];
        result.push(last);
    }
    if (isOpen) {
        result.push(path[len - 1]);
    }
    else if (!InternalClipper.isCollinear(last, path[len - 1], result[0])) {
        result.push(path[len - 1]);
    }
    else {
        while (result.length > 2 && InternalClipper.isCollinear(result[result.length - 1], result[result.length - 2], result[0])) {
            result.pop();
        }
        if (result.length < 3) {
            result.length = 0;
        }
    }
    return result;
}
export function trimCollinearD(path, precision, isOpen = false) {
    InternalClipper.checkPrecision(precision);
    const scale = Math.pow(10, precision);
    let p = scalePath64(path, scale);
    p = trimCollinear(p, isOpen);
    return scalePathDFromInt(p, 1 / scale);
}
export function pointInPolygon(pt, polygon) {
    return InternalClipper.pointInPolygon(pt, polygon);
}
export function pointInPolygonD(pt, polygon, precision = 2) {
    InternalClipper.checkPrecision(precision);
    const scale = Math.pow(10, precision);
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    InternalClipper.checkSafeScaleValue(pt.x, maxAbs, "pointInPolygonD");
    InternalClipper.checkSafeScaleValue(pt.y, maxAbs, "pointInPolygonD");
    const p = Point64Utils.fromPointD(PointDUtils.scale(pt, scale));
    const pathScaled = scalePath64(polygon, scale);
    return InternalClipper.pointInPolygon(p, pathScaled);
}
export function ellipse(center, radiusX, radiusY = 0, steps = 0) {
    if (radiusX <= 0)
        return [];
    if (radiusY <= 0)
        radiusY = radiusX;
    if (steps <= 2) {
        steps = Math.ceil(Math.PI * Math.sqrt((radiusX + radiusY) / 2));
    }
    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result = [{ x: Math.round(center.x + radiusX), y: center.y }];
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
export function ellipseD(center, radiusX, radiusY = 0, steps = 0) {
    if (radiusX <= 0)
        return [];
    if (radiusY <= 0)
        radiusY = radiusX;
    if (steps <= 2) {
        steps = Math.ceil(Math.PI * Math.sqrt((radiusX + radiusY) / 2));
    }
    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result = [{ x: center.x + radiusX, y: center.y }];
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
// Triangulation
export function triangulate(pp, useDelaunay = true) {
    const d = new Delaunay(useDelaunay);
    return d.execute(pp);
}
export function triangulateD(pp, decPlaces, useDelaunay = true) {
    let scale;
    if (decPlaces <= 0)
        scale = 1.0;
    else if (decPlaces > 8)
        scale = Math.pow(10.0, 8.0);
    else
        scale = Math.pow(10.0, decPlaces);
    const pp64 = scalePaths64(pp, scale);
    const d = new Delaunay(useDelaunay);
    const { result, solution: sol64 } = d.execute(pp64);
    let solution;
    if (result === TriangulateResult.success) {
        solution = scalePathsD(sol64, 1.0 / scale);
    }
    else {
        solution = [];
    }
    return { result, solution };
}
/**
 * @deprecated Use named exports or \`import * as Clipper\` instead
 * Compatibility alias for direct imports from Clipper.js
 */
export const Clipper = {
    invalidRect64,
    invalidRectD,
    intersect,
    intersectD,
    union,
    unionD,
    difference,
    differenceD,
    xor,
    xorD,
    booleanOp,
    booleanOpWithPolyTree,
    booleanOpD,
    booleanOpDWithPolyTree,
    inflatePaths,
    inflatePathsD,
    rectClip,
    rectClipLines,
    minkowskiSum,
    minkowskiSumD,
    minkowskiDiff,
    minkowskiDiffD,
    area,
    areaPaths,
    areaD,
    areaPathsD,
    isPositive,
    isPositiveD,
    path64ToString,
    paths64ToString,
    pathDToString,
    pathsDToString,
    offsetPath,
    scalePoint64,
    scalePointD,
    scaleRect,
    scalePath,
    scalePaths,
    scalePathD,
    scalePathsD,
    scalePath64,
    scalePaths64,
    scalePathDFromInt,
    scalePathsDFromInt,
    path64FromD,
    paths64FromD,
    pathsD,
    pathD,
    translatePath,
    translatePaths,
    translatePathD,
    translatePathsD,
    reversePath,
    reversePathD,
    reversePaths,
    reversePathsD,
    getBounds,
    getBoundsPaths,
    getBoundsD,
    getBoundsPathsD,
    makePath,
    makePathD,
    sqr,
    distanceSqr,
    midPoint,
    midPointD,
    inflateRect,
    inflateRectD,
    pointsNearEqual,
    stripNearDuplicates,
    stripDuplicates,
    polyTreeToPaths64,
    addPolyNodeToPathsD,
    polyTreeToPathsD,
    perpendicDistFromLineSqrd,
    perpendicDistFromLineSqrd64,
    ramerDouglasPeucker,
    ramerDouglasPeuckerPaths,
    ramerDouglasPeuckerD,
    ramerDouglasPeuckerPathsD,
    simplifyPath,
    simplifyPaths,
    simplifyPathD,
    simplifyPathsD,
    trimCollinear,
    trimCollinearD,
    pointInPolygon,
    pointInPolygonD,
    ellipse,
    ellipseD,
    triangulate,
    triangulateD
};
//# sourceMappingURL=Clipper.js.map