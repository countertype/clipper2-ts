/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  10 October 2024                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2024                                         *
* Purpose   :  Minkowski Sum and Difference                                    *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import {
  Point64, PointD, Path64, PathD, Paths64, PathsD, FillRule, ClipType, PathType,
  Point64Utils, PointDUtils, InternalClipper
} from './Core.js';
import { Clipper64 } from './Engine.js';

export namespace Minkowski {
  function minkowskiInternal(pattern: Path64, path: Path64, isSum: boolean, isClosed: boolean): Paths64 {
    const delta = isClosed ? 0 : 1;
    const patLen = pattern.length;
    const pathLen = path.length;
    const tmp: Paths64 = [];

    for (const pathPt of path) {
      const path2: Path64 = [];
      if (isSum) {
        for (const basePt of pattern) {
          path2.push(Point64Utils.add(pathPt, basePt));
        }
      } else {
        for (const basePt of pattern) {
          path2.push(Point64Utils.subtract(pathPt, basePt));
        }
      }
      tmp.push(path2);
    }

    const result: Paths64 = [];
    let g = isClosed ? pathLen - 1 : 0;

    let h = patLen - 1;
    for (let i = delta; i < pathLen; i++) {
      for (let j = 0; j < patLen; j++) {
        const quad: Path64 = [
          tmp[g][h],
          tmp[i][h], 
          tmp[i][j], 
          tmp[g][j]
        ];
        if (!isPositive(quad)) {
          result.push(reversePath(quad));
        } else {
          result.push(quad);
        }
        h = j;
      }
      g = i;
    }
    return result;
  }

  export function sum(pattern: Path64, path: Path64, isClosed: boolean): Paths64 {
    return union(minkowskiInternal(pattern, path, true, isClosed), FillRule.NonZero);
  }

  export function sumD(pattern: PathD, path: PathD, isClosed: boolean, decimalPlaces: number = 2): PathsD {
    const scale = Math.pow(10, decimalPlaces);
    const tmp = union(
      minkowskiInternal(
        scalePath64(pattern, scale),
        scalePath64(path, scale), 
        true, 
        isClosed
      ), 
      FillRule.NonZero
    );
    return scalePathsD(tmp, 1 / scale);
  }

  export function diff(pattern: Path64, path: Path64, isClosed: boolean): Paths64 {
    return union(minkowskiInternal(pattern, path, false, isClosed), FillRule.NonZero);
  }

  export function diffD(pattern: PathD, path: PathD, isClosed: boolean, decimalPlaces: number = 2): PathsD {
    const scale = Math.pow(10, decimalPlaces);
    const tmp = union(
      minkowskiInternal(
        scalePath64(pattern, scale),
        scalePath64(path, scale), 
        false, 
        isClosed
      ), 
      FillRule.NonZero
    );
    return scalePathsD(tmp, 1 / scale);
  }

  // Helper functions (these would typically be imported from the main Clipper class)
  function isPositive(path: Path64): boolean {
    return area(path) >= 0;
  }

  function area(path: Path64): number {
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

  function reversePath(path: Path64): Path64 {
    return [...path].reverse();
  }

  function scalePath64(path: PathD, scale: number): Path64 {
    const result: Path64 = [];
    for (const pt of path) {
        result.push({
          x: InternalClipper.roundToEven(pt.x * scale),
          y: InternalClipper.roundToEven(pt.y * scale)
        });
    }
    return result;
  }

  function scalePathsD(paths: Paths64, scale: number): PathsD {
    const result: PathsD = [];
    for (const path of paths) {
      const pathD: PathD = [];
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
  function union(paths: Paths64, fillRule: FillRule): Paths64 {
    const solution: Paths64 = [];
    const c = new Clipper64();
    c.addPaths(paths, PathType.Subject);
    c.execute(ClipType.Union, fillRule, solution);
    return solution;
  }
}
