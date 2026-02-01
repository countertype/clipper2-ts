/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  10 October 2024                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2024                                         *
* Purpose   :  Minkowski Sum and Difference                                    *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { FillRule, ClipType, PathType, Point64Utils, InternalClipper } from './Core.js';
import { Clipper64 } from './Engine.js';
export var Minkowski;
(function (Minkowski) {
    function minkowskiInternal(pattern, path, isSum, isClosed) {
        const delta = isClosed ? 0 : 1;
        const patLen = pattern.length;
        const pathLen = path.length;
        const tmp = [];
        for (const pathPt of path) {
            const path2 = [];
            if (isSum) {
                for (const basePt of pattern) {
                    path2.push(Point64Utils.add(pathPt, basePt));
                }
            }
            else {
                for (const basePt of pattern) {
                    path2.push(Point64Utils.subtract(pathPt, basePt));
                }
            }
            tmp.push(path2);
        }
        const result = [];
        let g = isClosed ? pathLen - 1 : 0;
        let h = patLen - 1;
        for (let i = delta; i < pathLen; i++) {
            for (let j = 0; j < patLen; j++) {
                const quad = [
                    tmp[g][h],
                    tmp[i][h],
                    tmp[i][j],
                    tmp[g][j]
                ];
                if (!isPositive(quad)) {
                    result.push(reversePath(quad));
                }
                else {
                    result.push(quad);
                }
                h = j;
            }
            g = i;
        }
        return result;
    }
    function sum(pattern, path, isClosed) {
        return union(minkowskiInternal(pattern, path, true, isClosed), FillRule.NonZero);
    }
    Minkowski.sum = sum;
    function sumD(pattern, path, isClosed, decimalPlaces = 2) {
        const scale = Math.pow(10, decimalPlaces);
        const tmp = union(minkowskiInternal(scalePath64(pattern, scale), scalePath64(path, scale), true, isClosed), FillRule.NonZero);
        return scalePathsD(tmp, 1 / scale);
    }
    Minkowski.sumD = sumD;
    function diff(pattern, path, isClosed) {
        return union(minkowskiInternal(pattern, path, false, isClosed), FillRule.NonZero);
    }
    Minkowski.diff = diff;
    function diffD(pattern, path, isClosed, decimalPlaces = 2) {
        const scale = Math.pow(10, decimalPlaces);
        const tmp = union(minkowskiInternal(scalePath64(pattern, scale), scalePath64(path, scale), false, isClosed), FillRule.NonZero);
        return scalePathsD(tmp, 1 / scale);
    }
    Minkowski.diffD = diffD;
    // Helper functions (these would typically be imported from the main Clipper class)
    function isPositive(path) {
        return area(path) >= 0;
    }
    function area(path) {
        return InternalClipper.area(path);
    }
    function reversePath(path) {
        return [...path].reverse();
    }
    function scalePath64(path, scale) {
        const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
        const result = [];
        for (const pt of path) {
            InternalClipper.checkSafeScaleValue(pt.x, maxAbs, "Minkowski.scalePath64");
            InternalClipper.checkSafeScaleValue(pt.y, maxAbs, "Minkowski.scalePath64");
            result.push({
                x: InternalClipper.roundToEven(pt.x * scale),
                y: InternalClipper.roundToEven(pt.y * scale)
            });
        }
        return result;
    }
    function scalePathsD(paths, scale) {
        const result = [];
        for (const path of paths) {
            const pathD = [];
            for (const pt of path) {
                pathD.push({
                    x: pt.x * scale,
                    y: pt.y * scale
                });
            }
            result.push(pathD);
        }
        return result;
    }
    // Local union implementation to avoid circular dependency
    function union(paths, fillRule) {
        const solution = [];
        const c = new Clipper64();
        c.addPaths(paths, PathType.Subject);
        c.execute(ClipType.Union, fillRule, solution);
        return solution;
    }
})(Minkowski || (Minkowski = {}));
//# sourceMappingURL=Minkowski.js.map