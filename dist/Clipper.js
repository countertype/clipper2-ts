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
export var Clipper;
(function (Clipper) {
    // Constants
    Clipper.invalidRect64 = InvalidRect64;
    Clipper.invalidRectD = InvalidRectD;
    // Boolean operations
    function intersect(subject, clip, fillRule) {
        return booleanOp(ClipType.Intersection, subject, clip, fillRule);
    }
    Clipper.intersect = intersect;
    function intersectD(subject, clip, fillRule, precision = 2) {
        return booleanOpD(ClipType.Intersection, subject, clip, fillRule, precision);
    }
    Clipper.intersectD = intersectD;
    function union(subject, clipOrFillRule, fillRule) {
        if (typeof clipOrFillRule === 'number') {
            // First overload: union(subject, fillRule)
            return booleanOp(ClipType.Union, subject, null, clipOrFillRule);
        }
        else {
            // Second overload: union(subject, clip, fillRule)
            return booleanOp(ClipType.Union, subject, clipOrFillRule, fillRule);
        }
    }
    Clipper.union = union;
    function unionD(subject, clipOrFillRule, fillRuleOrPrecision, precision) {
        if (typeof clipOrFillRule === 'number') {
            // First overload: unionD(subject, fillRule)
            return booleanOpD(ClipType.Union, subject, null, clipOrFillRule);
        }
        else {
            // Second overload: unionD(subject, clip, fillRule, precision)
            return booleanOpD(ClipType.Union, subject, clipOrFillRule, fillRuleOrPrecision, precision || 2);
        }
    }
    Clipper.unionD = unionD;
    function difference(subject, clip, fillRule) {
        return booleanOp(ClipType.Difference, subject, clip, fillRule);
    }
    Clipper.difference = difference;
    function differenceD(subject, clip, fillRule, precision = 2) {
        return booleanOpD(ClipType.Difference, subject, clip, fillRule, precision);
    }
    Clipper.differenceD = differenceD;
    function xor(subject, clip, fillRule) {
        return booleanOp(ClipType.Xor, subject, clip, fillRule);
    }
    Clipper.xor = xor;
    function xorD(subject, clip, fillRule, precision = 2) {
        return booleanOpD(ClipType.Xor, subject, clip, fillRule, precision);
    }
    Clipper.xorD = xorD;
    function booleanOp(clipType, subject, clip, fillRule) {
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
    Clipper.booleanOp = booleanOp;
    function booleanOpWithPolyTree(clipType, subject, clip, polytree, fillRule) {
        if (subject === null)
            return;
        const c = new Clipper64();
        c.addPaths(subject, PathType.Subject);
        if (clip !== null) {
            c.addPaths(clip, PathType.Clip);
        }
        c.execute(clipType, fillRule, polytree);
    }
    Clipper.booleanOpWithPolyTree = booleanOpWithPolyTree;
    function booleanOpD(clipType, subject, clip, fillRule, precision = 2) {
        const solution = [];
        const c = new ClipperD(precision);
        c.addSubjectPaths(subject);
        if (clip !== null) {
            c.addClipPaths(clip);
        }
        c.execute(clipType, fillRule, solution);
        return solution;
    }
    Clipper.booleanOpD = booleanOpD;
    function booleanOpDWithPolyTree(clipType, subject, clip, polytree, fillRule, precision = 2) {
        if (subject === null)
            return;
        const c = new ClipperD(precision);
        c.addSubjectPaths(subject);
        if (clip !== null) {
            c.addClipPaths(clip);
        }
        c.execute(clipType, fillRule, polytree);
    }
    Clipper.booleanOpDWithPolyTree = booleanOpDWithPolyTree;
    function inflatePaths(paths, delta, joinType, endType, miterLimit = 2.0, arcTolerance = 0.0) {
        const co = new ClipperOffset(miterLimit, arcTolerance);
        co.addPaths(paths, joinType, endType);
        const solution = [];
        co.execute(delta, solution);
        return solution;
    }
    Clipper.inflatePaths = inflatePaths;
    function inflatePathsD(paths, delta, joinType, endType, miterLimit = 2.0, precision = 2, arcTolerance = 0.0) {
        InternalClipper.checkPrecision(precision);
        const scale = Math.pow(10, precision);
        const tmp = scalePaths64(paths, scale);
        const co = new ClipperOffset(miterLimit, scale * arcTolerance);
        co.addPaths(tmp, joinType, endType);
        const solution = [];
        co.execute(delta * scale, solution); // reuse solution to receive (scaled) solution
        return scalePathsD(solution, 1 / scale);
    }
    Clipper.inflatePathsD = inflatePathsD;
    function rectClip(rect, pathsOrPath, precision) {
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
    Clipper.rectClip = rectClip;
    function rectClipLines(rect, pathsOrPath, precision) {
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
    Clipper.rectClipLines = rectClipLines;
    function minkowskiSum(pattern, path, isClosed) {
        return Minkowski.sum(pattern, path, isClosed);
    }
    Clipper.minkowskiSum = minkowskiSum;
    function minkowskiSumD(pattern, path, isClosed) {
        return Minkowski.sumD(pattern, path, isClosed);
    }
    Clipper.minkowskiSumD = minkowskiSumD;
    function minkowskiDiff(pattern, path, isClosed) {
        return Minkowski.diff(pattern, path, isClosed);
    }
    Clipper.minkowskiDiff = minkowskiDiff;
    function minkowskiDiffD(pattern, path, isClosed) {
        return Minkowski.diffD(pattern, path, isClosed);
    }
    Clipper.minkowskiDiffD = minkowskiDiffD;
    function area(path) {
        // https://en.wikipedia.org/wiki/Shoelace_formula
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
    Clipper.area = area;
    function areaPaths(paths) {
        let a = 0.0;
        for (const path of paths) {
            a += area(path);
        }
        return a;
    }
    Clipper.areaPaths = areaPaths;
    function areaD(path) {
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
    Clipper.areaD = areaD;
    function areaPathsD(paths) {
        let a = 0.0;
        for (const path of paths) {
            a += areaD(path);
        }
        return a;
    }
    Clipper.areaPathsD = areaPathsD;
    function isPositive(poly) {
        return area(poly) >= 0;
    }
    Clipper.isPositive = isPositive;
    function isPositiveD(poly) {
        return areaD(poly) >= 0;
    }
    Clipper.isPositiveD = isPositiveD;
    function path64ToString(path) {
        let result = "";
        for (const pt of path) {
            result += Point64Utils.toString(pt);
        }
        return result + '\n';
    }
    Clipper.path64ToString = path64ToString;
    function paths64ToString(paths) {
        let result = "";
        for (const path of paths) {
            result += path64ToString(path);
        }
        return result;
    }
    Clipper.paths64ToString = paths64ToString;
    function pathDToString(path, precision = 2) {
        let result = "";
        for (const pt of path) {
            result += PointDUtils.toString(pt, precision);
        }
        return result + '\n';
    }
    Clipper.pathDToString = pathDToString;
    function pathsDToString(paths, precision = 2) {
        let result = "";
        for (const path of paths) {
            result += pathDToString(path, precision);
        }
        return result;
    }
    Clipper.pathsDToString = pathsDToString;
    function offsetPath(path, dx, dy) {
        const result = [];
        for (const pt of path) {
            result.push({ x: pt.x + dx, y: pt.y + dy });
        }
        return result;
    }
    Clipper.offsetPath = offsetPath;
    function scalePoint64(pt, scale) {
        return {
            x: Math.round(pt.x * scale),
            y: Math.round(pt.y * scale)
        };
    }
    Clipper.scalePoint64 = scalePoint64;
    function scalePointD(pt, scale) {
        return {
            x: pt.x * scale,
            y: pt.y * scale
        };
    }
    Clipper.scalePointD = scalePointD;
    function scaleRect(rec, scale) {
        return {
            left: Math.round(rec.left * scale),
            top: Math.round(rec.top * scale),
            right: Math.round(rec.right * scale),
            bottom: Math.round(rec.bottom * scale)
        };
    }
    Clipper.scaleRect = scaleRect;
    function scalePath(path, scale) {
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
    Clipper.scalePath = scalePath;
    function scalePaths(paths, scale) {
        if (InternalClipper.isAlmostZero(scale - 1))
            return paths;
        const result = [];
        for (const path of paths) {
            result.push(scalePath(path, scale));
        }
        return result;
    }
    Clipper.scalePaths = scalePaths;
    function scalePathD(path, scale) {
        if (InternalClipper.isAlmostZero(scale - 1))
            return path;
        const result = [];
        for (const pt of path) {
            result.push(PointDUtils.scale(pt, scale));
        }
        return result;
    }
    Clipper.scalePathD = scalePathD;
    function scalePathsD(paths, scale) {
        if (InternalClipper.isAlmostZero(scale - 1))
            return paths;
        const result = [];
        for (const path of paths) {
            result.push(scalePathD(path, scale));
        }
        return result;
    }
    Clipper.scalePathsD = scalePathsD;
    // Unlike ScalePath, both ScalePath64 & ScalePathD also involve type conversion
    function scalePath64(path, scale) {
        const result = [];
        for (const pt of path) {
            result.push({
                x: Math.round(pt.x * scale),
                y: Math.round(pt.y * scale)
            });
        }
        return result;
    }
    Clipper.scalePath64 = scalePath64;
    function scalePaths64(paths, scale) {
        const result = [];
        for (const path of paths) {
            result.push(scalePath64(path, scale));
        }
        return result;
    }
    Clipper.scalePaths64 = scalePaths64;
    function scalePathDFromInt(path, scale) {
        const result = [];
        for (const pt of path) {
            result.push({
                x: pt.x * scale,
                y: pt.y * scale
            });
        }
        return result;
    }
    Clipper.scalePathDFromInt = scalePathDFromInt;
    function scalePathsDFromInt(paths, scale) {
        const result = [];
        for (const path of paths) {
            result.push(scalePathDFromInt(path, scale));
        }
        return result;
    }
    Clipper.scalePathsDFromInt = scalePathsDFromInt;
    // The static functions Path64 and PathD convert path types without scaling
    function path64FromD(path) {
        const result = [];
        for (const pt of path) {
            result.push(Point64Utils.fromPointD(pt));
        }
        return result;
    }
    Clipper.path64FromD = path64FromD;
    function paths64FromD(paths) {
        const result = [];
        for (const path of paths) {
            result.push(path64FromD(path));
        }
        return result;
    }
    Clipper.paths64FromD = paths64FromD;
    function pathsD(paths) {
        const result = [];
        for (const path of paths) {
            result.push(pathD(path));
        }
        return result;
    }
    Clipper.pathsD = pathsD;
    function pathD(path) {
        const result = [];
        for (const pt of path) {
            result.push(PointDUtils.fromPoint64(pt));
        }
        return result;
    }
    Clipper.pathD = pathD;
    function translatePath(path, dx, dy) {
        const result = [];
        for (const pt of path) {
            result.push({ x: pt.x + dx, y: pt.y + dy });
        }
        return result;
    }
    Clipper.translatePath = translatePath;
    function translatePaths(paths, dx, dy) {
        const result = [];
        for (const path of paths) {
            result.push(offsetPath(path, dx, dy));
        }
        return result;
    }
    Clipper.translatePaths = translatePaths;
    function translatePathD(path, dx, dy) {
        const result = [];
        for (const pt of path) {
            result.push({ x: pt.x + dx, y: pt.y + dy });
        }
        return result;
    }
    Clipper.translatePathD = translatePathD;
    function translatePathsD(paths, dx, dy) {
        const result = [];
        for (const path of paths) {
            result.push(translatePathD(path, dx, dy));
        }
        return result;
    }
    Clipper.translatePathsD = translatePathsD;
    function reversePath(path) {
        return [...path].reverse();
    }
    Clipper.reversePath = reversePath;
    function reversePathD(path) {
        return [...path].reverse();
    }
    Clipper.reversePathD = reversePathD;
    function reversePaths(paths) {
        const result = [];
        for (const path of paths) {
            result.push(reversePath(path));
        }
        return result;
    }
    Clipper.reversePaths = reversePaths;
    function reversePathsD(paths) {
        const result = [];
        for (const path of paths) {
            result.push(reversePathD(path));
        }
        return result;
    }
    Clipper.reversePathsD = reversePathsD;
    function getBounds(path) {
        return InternalClipper.getBounds(path);
    }
    Clipper.getBounds = getBounds;
    function getBoundsPaths(paths) {
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
    Clipper.getBoundsPaths = getBoundsPaths;
    function getBoundsD(path) {
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
    Clipper.getBoundsD = getBoundsD;
    function getBoundsPathsD(paths) {
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
    Clipper.getBoundsPathsD = getBoundsPathsD;
    function makePath(arr) {
        const len = Math.floor(arr.length / 2);
        const p = [];
        for (let i = 0; i < len; i++) {
            p.push({ x: arr[i * 2], y: arr[i * 2 + 1], z: 0 });
        }
        return p;
    }
    Clipper.makePath = makePath;
    function makePathD(arr) {
        const len = Math.floor(arr.length / 2);
        const p = [];
        for (let i = 0; i < len; i++) {
            p.push({ x: arr[i * 2], y: arr[i * 2 + 1], z: 0 });
        }
        return p;
    }
    Clipper.makePathD = makePathD;
    function sqr(val) {
        return val * val;
    }
    Clipper.sqr = sqr;
    function distanceSqr(pt1, pt2) {
        return sqr(pt1.x - pt2.x) + sqr(pt1.y - pt2.y);
    }
    Clipper.distanceSqr = distanceSqr;
    function midPoint(pt1, pt2) {
        return { x: Math.round((pt1.x + pt2.x) / 2), y: Math.round((pt1.y + pt2.y) / 2) };
    }
    Clipper.midPoint = midPoint;
    function midPointD(pt1, pt2) {
        return { x: (pt1.x + pt2.x) / 2, y: (pt1.y + pt2.y) / 2 };
    }
    Clipper.midPointD = midPointD;
    function inflateRect(rec, dx, dy) {
        rec.left -= dx;
        rec.right += dx;
        rec.top -= dy;
        rec.bottom += dy;
    }
    Clipper.inflateRect = inflateRect;
    function inflateRectD(rec, dx, dy) {
        rec.left -= dx;
        rec.right += dx;
        rec.top -= dy;
        rec.bottom += dy;
    }
    Clipper.inflateRectD = inflateRectD;
    function pointsNearEqual(pt1, pt2, distanceSqrd) {
        return sqr(pt1.x - pt2.x) + sqr(pt1.y - pt2.y) < distanceSqrd;
    }
    Clipper.pointsNearEqual = pointsNearEqual;
    function stripNearDuplicates(path, minEdgeLenSqrd, isClosedPath) {
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
    Clipper.stripNearDuplicates = stripNearDuplicates;
    function stripDuplicates(path, isClosedPath) {
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
    Clipper.stripDuplicates = stripDuplicates;
    function addPolyNodeToPaths(polyPath, paths) {
        if (polyPath.poly && polyPath.poly.length > 0) {
            paths.push(polyPath.poly);
        }
        for (let i = 0; i < polyPath.count; i++) {
            addPolyNodeToPaths(polyPath.child(i), paths);
        }
    }
    function polyTreeToPaths64(polyTree) {
        const result = [];
        for (let i = 0; i < polyTree.count; i++) {
            addPolyNodeToPaths(polyTree.child(i), result);
        }
        return result;
    }
    Clipper.polyTreeToPaths64 = polyTreeToPaths64;
    function addPolyNodeToPathsD(polyPath, paths) {
        if (polyPath.poly && polyPath.poly.length > 0) {
            paths.push(polyPath.poly);
        }
        for (let i = 0; i < polyPath.count; i++) {
            addPolyNodeToPathsD(polyPath.child(i), paths);
        }
    }
    Clipper.addPolyNodeToPathsD = addPolyNodeToPathsD;
    function polyTreeToPathsD(polyTree) {
        const result = [];
        for (let i = 0; i < polyTree.count; i++) {
            addPolyNodeToPathsD(polyTree.child(i), result);
        }
        return result;
    }
    Clipper.polyTreeToPathsD = polyTreeToPathsD;
    function perpendicDistFromLineSqrd(pt, line1, line2) {
        const a = pt.x - line1.x;
        const b = pt.y - line1.y;
        const c = line2.x - line1.x;
        const d = line2.y - line1.y;
        if (c === 0 && d === 0)
            return 0;
        return sqr(a * d - c * b) / (c * c + d * d);
    }
    Clipper.perpendicDistFromLineSqrd = perpendicDistFromLineSqrd;
    function perpendicDistFromLineSqrd64(pt, line1, line2) {
        const a = pt.x - line1.x;
        const b = pt.y - line1.y;
        const c = line2.x - line1.x;
        const d = line2.y - line1.y;
        if (c === 0 && d === 0)
            return 0;
        return sqr(a * d - c * b) / (c * c + d * d);
    }
    Clipper.perpendicDistFromLineSqrd64 = perpendicDistFromLineSqrd64;
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
    function ramerDouglasPeucker(path, epsilon) {
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
    Clipper.ramerDouglasPeucker = ramerDouglasPeucker;
    function ramerDouglasPeuckerPaths(paths, epsilon) {
        const result = [];
        for (const path of paths) {
            result.push(ramerDouglasPeucker(path, epsilon));
        }
        return result;
    }
    Clipper.ramerDouglasPeuckerPaths = ramerDouglasPeuckerPaths;
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
    function ramerDouglasPeuckerD(path, epsilon) {
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
    Clipper.ramerDouglasPeuckerD = ramerDouglasPeuckerD;
    function ramerDouglasPeuckerPathsD(paths, epsilon) {
        const result = [];
        for (const path of paths) {
            result.push(ramerDouglasPeuckerD(path, epsilon));
        }
        return result;
    }
    Clipper.ramerDouglasPeuckerPathsD = ramerDouglasPeuckerPathsD;
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
    function simplifyPath(path, epsilon, isClosedPath = true) {
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
    Clipper.simplifyPath = simplifyPath;
    function simplifyPaths(paths, epsilon, isClosedPaths = true) {
        const result = [];
        for (const path of paths) {
            result.push(simplifyPath(path, epsilon, isClosedPaths));
        }
        return result;
    }
    Clipper.simplifyPaths = simplifyPaths;
    function simplifyPathD(path, epsilon, isClosedPath = true) {
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
    Clipper.simplifyPathD = simplifyPathD;
    function simplifyPathsD(paths, epsilon, isClosedPath = true) {
        const result = [];
        for (const path of paths) {
            result.push(simplifyPathD(path, epsilon, isClosedPath));
        }
        return result;
    }
    Clipper.simplifyPathsD = simplifyPathsD;
    function trimCollinear(path, isOpen = false) {
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
    Clipper.trimCollinear = trimCollinear;
    function trimCollinearD(path, precision, isOpen = false) {
        InternalClipper.checkPrecision(precision);
        const scale = Math.pow(10, precision);
        let p = scalePath64(path, scale);
        p = trimCollinear(p, isOpen);
        return scalePathDFromInt(p, 1 / scale);
    }
    Clipper.trimCollinearD = trimCollinearD;
    function pointInPolygon(pt, polygon) {
        return InternalClipper.pointInPolygon(pt, polygon);
    }
    Clipper.pointInPolygon = pointInPolygon;
    function pointInPolygonD(pt, polygon, precision = 2) {
        InternalClipper.checkPrecision(precision);
        const scale = Math.pow(10, precision);
        const p = Point64Utils.fromPointD(PointDUtils.scale(pt, scale));
        const pathScaled = scalePath64(polygon, scale);
        return InternalClipper.pointInPolygon(p, pathScaled);
    }
    Clipper.pointInPolygonD = pointInPolygonD;
    function ellipse(center, radiusX, radiusY = 0, steps = 0) {
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
    Clipper.ellipse = ellipse;
    function ellipseD(center, radiusX, radiusY = 0, steps = 0) {
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
    Clipper.ellipseD = ellipseD;
    // Triangulation
    function triangulate(pp, useDelaunay = true) {
        const d = new Delaunay(useDelaunay);
        return d.execute(pp);
    }
    Clipper.triangulate = triangulate;
    function triangulateD(pp, decPlaces, useDelaunay = true) {
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
    Clipper.triangulateD = triangulateD;
})(Clipper || (Clipper = {}));
//# sourceMappingURL=Clipper.js.map