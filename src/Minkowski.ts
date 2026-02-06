/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  10 October 2024                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2024                                         *
* Purpose   :  Minkowski Sum and Difference                                    *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import {
  Path64, PathD, Paths64, PathsD, FillRule, ClipType, PathType,
  Point64Utils, InternalClipper
} from './Core.js';
import { Clipper64 } from './Engine.js';

// Private helpers for Minkowski (module-level, not exported)
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
      if (!minkIsPositive(quad)) {
        result.push(minkReversePath(quad));
      } else {
        result.push(quad);
      }
      h = j;
    }
    g = i;
  }
  return result;
}

function minkIsPositive(path: Path64): boolean {
  return InternalClipper.area(path) >= 0;
}

function minkReversePath(path: Path64): Path64 {
  return [...path].reverse();
}

function minkScalePath64(path: PathD, scale: number): Path64 {
  const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
  const result: Path64 = [];
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

function minkScalePathsD(paths: Paths64, scale: number): PathsD {
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
function minkUnion(paths: Paths64, fillRule: FillRule): Paths64 {
  const solution: Paths64 = [];
  const c = new Clipper64();
  c.addPaths(paths, PathType.Subject);
  c.execute(ClipType.Union, fillRule, solution);
  return solution;
}

// Plain object replaces namespace to avoid IIFE wrapper in tsc output.
export const Minkowski = {
  sum(pattern: Path64, path: Path64, isClosed: boolean): Paths64 {
    return minkUnion(minkowskiInternal(pattern, path, true, isClosed), FillRule.NonZero);
  },

  sumD(pattern: PathD, path: PathD, isClosed: boolean, decimalPlaces: number = 2): PathsD {
    const scale = Math.pow(10, decimalPlaces);
    const tmp = minkUnion(
      minkowskiInternal(
        minkScalePath64(pattern, scale),
        minkScalePath64(path, scale), 
        true, 
        isClosed
      ), 
      FillRule.NonZero
    );
    return minkScalePathsD(tmp, 1 / scale);
  },

  diff(pattern: Path64, path: Path64, isClosed: boolean): Paths64 {
    return minkUnion(minkowskiInternal(pattern, path, false, isClosed), FillRule.NonZero);
  },

  diffD(pattern: PathD, path: PathD, isClosed: boolean, decimalPlaces: number = 2): PathsD {
    const scale = Math.pow(10, decimalPlaces);
    const tmp = minkUnion(
      minkowskiInternal(
        minkScalePath64(pattern, scale),
        minkScalePath64(path, scale), 
        false, 
        isClosed
      ), 
      FillRule.NonZero
    );
    return minkScalePathsD(tmp, 1 / scale);
  },
};
