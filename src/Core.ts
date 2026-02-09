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

// Note: all clipping operations except for Difference are commutative.
export enum ClipType {
  NoClip = 0,
  Intersection = 1,
  Union = 2,
  Difference = 3,
  Xor = 4
}

export enum PathType {
  Subject = 0,
  Clip = 1
}

// By far the most widely used filling rules for polygons are EvenOdd
// and NonZero, sometimes called Alternate and Winding respectively.
// https://en.wikipedia.org/wiki/Nonzero-rule
export enum FillRule {
  EvenOdd = 0,
  NonZero = 1,
  Positive = 2,
  Negative = 3
}

// PointInPolygon
export enum PointInPolygonResult {
  IsOn = 0,
  IsInside = 1,
  IsOutside = 2
}

// Z-coordinate callbacks
// Called at each intersection to allow custom Z value computation
export type ZCallback64 = (
  bot1: Point64,
  top1: Point64,
  bot2: Point64,
  top2: Point64,
  intersectPt: Point64
) => void;

export type ZCallbackD = (
  bot1: PointD,
  top1: PointD,
  bot2: PointD,
  top2: PointD,
  intersectPt: PointD
) => void;

// InternalClipper - converted from namespace to plain const object to avoid
// the IIFE wrapper that tsc emits for namespaces. All functions are defined at
// module level so internal cross-calls (e.g. isCollinear -> productsAreEqual)
// are direct calls without property lookup overhead. The exported object bundles
// them for external callers that use InternalClipper.foo() syntax.

// --- private helpers (module-level, not exported) ---
const maxSafeInteger = Number.MAX_SAFE_INTEGER;
const maxDeltaForSafeProduct = Math.floor(Math.sqrt(maxSafeInteger));

function isSafeProduct(a: number, b: number): boolean {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return false;
  if (a === 0 || b === 0) return true;
  return Math.abs(a) <= maxSafeInteger / Math.abs(b);
}

function isSafeSum(a: number, b: number): boolean {
  return Math.abs(a) + Math.abs(b) <= maxSafeInteger;
}

function safeMultiplyDifference(a: number, b: number, c: number, d: number): number {
  if (isSafeProduct(a, b) && isSafeProduct(c, d)) {
    const prod1 = a * b;
    const prod2 = c * d;
    if (isSafeSum(prod1, prod2)) {
      return prod1 - prod2;
    }
  }

  if (Number.isSafeInteger(a) && Number.isSafeInteger(b) &&
    Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
    return Number((BigInt(a) * BigInt(b)) - (BigInt(c) * BigInt(d)));
  }

  return (a * b) - (c * d);
}

function safeMultiplySum(a: number, b: number, c: number, d: number): number {
  if (isSafeProduct(a, b) && isSafeProduct(c, d)) {
    const prod1 = a * b;
    const prod2 = c * d;
    if (isSafeSum(prod1, prod2)) {
      return prod1 + prod2;
    }
  }

  if (Number.isSafeInteger(a) && Number.isSafeInteger(b) &&
    Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
    return Number((BigInt(a) * BigInt(b)) + (BigInt(c) * BigInt(d)));
  }

  return (a * b) + (c * d);
}

// BigInt constants — avoid BigInt literal syntax (0n, 4n, etc.) to sidestep
// terser BigInt constant-folding issues in some consuming build setups.
const B0 = BigInt(0);
const B2 = BigInt(2);
const B4 = BigInt(4);
const B64 = BigInt(64);
const UINT64_MASK = BigInt("0xFFFFFFFFFFFFFFFF");

// --- public constants (module-level for cross-referencing) ---
const IC_MaxInt64 = BigInt("9223372036854775807");
const IC_MaxCoord = Number(IC_MaxInt64 / B4);
const IC_Invalid64 = Number(IC_MaxInt64);
const IC_floatingPointTolerance = 1E-12;
const IC_defaultMinimumEdgeLength = 0.1;
const IC_maxCoordForSafeAreaProduct = Math.floor(maxDeltaForSafeProduct / 2);
// Bound for |a|,|b|,|c|,|d| so cross^2 and denom stay safe
const IC_maxCoordForSafeCrossSq = Math.floor(Math.sqrt(Math.sqrt(maxSafeInteger / 4)));

// --- public functions (module-level for direct internal calls) ---

function maxSafeCoordinateForScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    throw new RangeError("Scale must be a finite number");
  }
  const absScale = Math.abs(scale);
  if (absScale === 0) return Number.POSITIVE_INFINITY;
  return maxSafeInteger / absScale;
}

function checkSafeScaleValue(value: number, maxAbs: number, context: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > maxAbs) {
    throw new RangeError(`Scaled coordinate exceeds Number.MAX_SAFE_INTEGER in ${context}`);
  }
}

function ensureSafeInteger(value: number, context: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > maxSafeInteger) {
    throw new RangeError(`Coordinate exceeds Number.MAX_SAFE_INTEGER in ${context}`);
  }
}

function crossProduct(pt1: Point64, pt2: Point64, pt3: Point64): number {
  const a = pt2.x - pt1.x;
  const b = pt3.y - pt2.y;
  const c = pt2.y - pt1.y;
  const d = pt3.x - pt2.x;

  // Fast path for small coordinates
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct &&
    Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    return (a * b) - (c * d);
  }

  return safeMultiplyDifference(a, b, c, d);
}

function crossProductSign(pt1: Point64, pt2: Point64, pt3: Point64): number {
  const a = pt2.x - pt1.x;
  const b = pt3.y - pt2.y;
  const c = pt2.y - pt1.y;
  const d = pt3.x - pt2.x;

  // Fast check for safe integer range
  // Using Math.abs inline allows short-circuiting
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct &&
    Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    const prod1 = a * b;
    const prod2 = c * d;
    return (prod1 > prod2) ? 1 : (prod1 < prod2) ? -1 : 0;
  }

  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) ||
      !Number.isSafeInteger(c) || !Number.isSafeInteger(d)) {
    const prod1 = a * b;
    const prod2 = c * d;
    return (prod1 > prod2) ? 1 : (prod1 < prod2) ? -1 : 0;
  }

  const bigProd1 = BigInt(a) * BigInt(b);
  const bigProd2 = BigInt(c) * BigInt(d);

  if (bigProd1 === bigProd2) return 0;
  return (bigProd1 > bigProd2) ? 1 : -1;
}

function checkPrecision(precision: number): void {
  if (precision < -8 || precision > 8) {
    throw new Error("Error: Precision is out of range.");
  }
}

function isAlmostZero(value: number): boolean {
  return Math.abs(value) <= IC_floatingPointTolerance;
}

function triSign(x: number): number {
  return (x < 0) ? -1 : (x > 0) ? 1 : 0;
}

export interface UInt128Struct {
  lo64: bigint;
  hi64: bigint;
}

function multiplyUInt64(a: number, b: number): UInt128Struct {
  // Fix: a and b might be larger than 2^32, so don't use >>> 0
  const aBig = BigInt(a);
  const bBig = BigInt(b);
  const res = aBig * bBig;
  
  return {
    lo64: res & UINT64_MASK,
    hi64: res >> B64
  };
}

// returns true if (and only if) a * b == c * d
function productsAreEqual(a: number, b: number, c: number, d: number): boolean {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const absC = Math.abs(c);
  const absD = Math.abs(d);

  // Fast path for safe integer range (covers all typical coordinates)
  if (absA < maxDeltaForSafeProduct && absB < maxDeltaForSafeProduct &&
    absC < maxDeltaForSafeProduct && absD < maxDeltaForSafeProduct) {
    return a * b === c * d;
  }

  const signAb = (a < 0 ? -1 : (a > 0 ? 1 : 0)) * (b < 0 ? -1 : (b > 0 ? 1 : 0));
  const signCd = (c < 0 ? -1 : (c > 0 ? 1 : 0)) * (d < 0 ? -1 : (d > 0 ? 1 : 0));
  
  if (signAb !== signCd) return false;
  if (signAb === 0) return true;
  if (!Number.isSafeInteger(absA) || !Number.isSafeInteger(absB) ||
      !Number.isSafeInteger(absC) || !Number.isSafeInteger(absD)) {
    return a * b === c * d;
  }

  const bigA = BigInt(absA);
  const bigB = BigInt(absB);
  const bigC = BigInt(absC);
  const bigD = BigInt(absD);
  
  return (bigA * bigB) === (bigC * bigD);
}

function isCollinear(pt1: Point64, sharedPt: Point64, pt2: Point64): boolean {
  const a = sharedPt.x - pt1.x;
  const b = pt2.y - sharedPt.y;
  const c = sharedPt.y - pt1.y;
  const d = pt2.x - sharedPt.x;
  // When checking for collinearity with very large coordinate values
  // then ProductsAreEqual is more accurate than using CrossProduct.
  return productsAreEqual(a, b, c, d);
}

function dotProduct(pt1: Point64, pt2: Point64, pt3: Point64): number {
  const a = pt2.x - pt1.x;
  const b = pt3.x - pt2.x;
  const c = pt2.y - pt1.y;
  const d = pt3.y - pt2.y;

  // Fast path for small coordinates
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct &&
    Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    return (a * b) + (c * d);
  }

  return safeMultiplySum(a, b, c, d);
}

function dotProductSign(pt1: Point64, pt2: Point64, pt3: Point64): number {
  const a = pt2.x - pt1.x;
  const b = pt3.x - pt2.x;
  const c = pt2.y - pt1.y;
  const d = pt3.y - pt2.y;

  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct &&
    Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    const sum = (a * b) + (c * d);
    return sum > 0 ? 1 : (sum < 0 ? -1 : 0);
  }

  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) ||
    !Number.isSafeInteger(c) || !Number.isSafeInteger(d)) {
    const sum = (a * b) + (c * d);
    return sum > 0 ? 1 : (sum < 0 ? -1 : 0);
  }

  const bigSum = (BigInt(a) * BigInt(b)) + (BigInt(c) * BigInt(d));
  if (bigSum === B0) return 0;
  return bigSum > B0 ? 1 : -1;
}

function icArea(path: Path64): number {
  // https://en.wikipedia.org/wiki/Shoelace_formula
  const cnt = path.length;
  if (cnt < 3) return 0.0;

  // Fast path when coords are small enough that (y1+y2)*(x1-x2) won't overflow
  // maxCoordForSafeAreaProduct is floor(sqrt(Number.MAX_SAFE_INTEGER) / 2)
  let allSmall = true;
  for (let i = 0; i < cnt && allSmall; i++) {
    const pt = path[i];
    if (Math.abs(pt.x) >= IC_maxCoordForSafeAreaProduct ||
      Math.abs(pt.y) >= IC_maxCoordForSafeAreaProduct) {
      allSmall = false;
    }
  }

  let prevPt = path[cnt - 1];

  if (allSmall) {
    // Fast path - no overflow checks needed
    let total = 0.0;
    for (const pt of path) {
      total += (prevPt.y + pt.y) * (prevPt.x - pt.x);
      prevPt = pt;
    }
    return total * 0.5;
  }

  // Safe path - use BigInt for accumulation
  let totalBig = B0;
  for (const pt of path) {
    const sum = prevPt.y + pt.y;
    const diff = prevPt.x - pt.x;
    if (Number.isSafeInteger(sum) && Number.isSafeInteger(diff)) {
      totalBig += BigInt(sum) * BigInt(diff);
    } else if (Number.isSafeInteger(prevPt.y) && Number.isSafeInteger(pt.y) &&
      Number.isSafeInteger(prevPt.x) && Number.isSafeInteger(pt.x)) {
      const sumBig = BigInt(prevPt.y) + BigInt(pt.y);
      const diffBig = BigInt(prevPt.x) - BigInt(pt.x);
      totalBig += sumBig * diffBig;
    } else {
      // Coordinates not safe integers - fall back to float
      totalBig += BigInt(Math.round(sum * diff));
    }
    prevPt = pt;
  }
  return Number(totalBig) * 0.5;
}

function crossProductD(vec1: PointD, vec2: PointD): number {
  return (vec1.y * vec2.x - vec2.y * vec1.x);
}

function dotProductD(vec1: PointD, vec2: PointD): number {
  return (vec1.x * vec2.x + vec1.y * vec2.y);
}

// Banker's rounding (round half to even) to match C# MidpointRounding.ToEven.
function roundToEven(value: number): number {
  const r = Math.round(value);
  if (value === r - 0.5 && (r & 1) !== 0) return r - 1;
  return r;
}

function checkCastInt64(val: number): number {
  if ((val >= IC_MaxCoord) || (val <= -IC_MaxCoord)) return IC_Invalid64;
  return Math.round(val);
}

// GetLineIntersectPt - returns the intersection point if non-parallel, or null.
// The point will be constrained to seg1. However, it's possible that the point
// won't be inside seg2, even when it hasn't been constrained (ie inside seg1).
// Returns Point64 | null to avoid allocating a wrapper object on every call.
function getLineIntersectPt(
  ln1a: Point64, ln1b: Point64, 
  ln2a: Point64, ln2b: Point64
): Point64 | null {
  const dy1 = (ln1b.y - ln1a.y);
  const dx1 = (ln1b.x - ln1a.x);
  const dy2 = (ln2b.y - ln2a.y);
  const dx2 = (ln2b.x - ln2a.x);
  const det = safeMultiplyDifference(dy1, dx2, dy2, dx1);
  
  if (det === 0.0) {
    return null;
  }

  const t = safeMultiplyDifference(
    (ln1a.x - ln2a.x),
    dy2,
    (ln1a.y - ln2a.y),
    dx2
  ) / det;
  
  if (t <= 0.0) {
    // Create a copy to avoid mutating original (struct copy in C# carries Z).
    return { x: ln1a.x, y: ln1a.y, z: (ln1a.z || 0) };
  } else if (t >= 1.0) {
    return { x: ln1b.x, y: ln1b.y, z: (ln1b.z || 0) };
  } else {
    // avoid using constructor (and rounding too) as they affect performance
    // Use Math.trunc to match C# (long) cast behavior which truncates towards zero
    return {
      x: Math.trunc(ln1a.x + t * dx1),
      y: Math.trunc(ln1a.y + t * dy1),
      z: 0
    };
  }
}

function getLineIntersectPtD(
  ln1a: PointD, ln1b: PointD,
  ln2a: PointD, ln2b: PointD
): { success: boolean; ip: PointD } {
  const dy1 = ln1b.y - ln1a.y;
  const dx1 = ln1b.x - ln1a.x;
  const dy2 = ln2b.y - ln2a.y;
  const dx2 = ln2b.x - ln2a.x;
  const det = dy1 * dx2 - dy2 * dx1;
  
  if (det === 0.0) {
    return { success: false, ip: { x: 0, y: 0, z: 0 } };
  }

  const t = ((ln1a.x - ln2a.x) * dy2 - (ln1a.y - ln2a.y) * dx2) / det;
  let ip: PointD;
  
  if (t <= 0.0) {
    ip = { ...ln1a, z: 0 };
  } else if (t >= 1.0) {
    ip = { ...ln1b, z: 0 };
  } else {
    ip = {
      x: ln1a.x + t * dx1,
      y: ln1a.y + t * dy1,
      z: 0
    };
  }
  
  return { success: true, ip };
}

function segsIntersect(
  seg1a: Point64, seg1b: Point64, 
  seg2a: Point64, seg2b: Point64, 
  inclusive: boolean = false
): boolean {
  if (!inclusive) {
    // Match C# fast path - use cross product multiplication
    // This avoids floating point equality checks (safer than === 0)
    const s1 = crossProductSign(seg1a, seg2a, seg2b);
    const s2 = crossProductSign(seg1b, seg2a, seg2b);
    const s3 = crossProductSign(seg2a, seg1a, seg1b);
    const s4 = crossProductSign(seg2b, seg1a, seg1b);
    return (s1 !== 0 && s2 !== 0 && s1 !== s2) &&
           (s3 !== 0 && s4 !== 0 && s3 !== s4);
  }
  
  // Inclusive case - match C# implementation
  const res1 = crossProductSign(seg1a, seg2a, seg2b);
  const res2 = crossProductSign(seg1b, seg2a, seg2b);
  if (res1 !== 0 && res1 === res2) return false;
  const res3 = crossProductSign(seg2a, seg1a, seg1b);
  const res4 = crossProductSign(seg2b, seg1a, seg1b);
  if (res3 !== 0 && res3 === res4) return false;
  // ensure NOT collinear
  return (res1 !== 0 || res2 !== 0 || res3 !== 0 || res4 !== 0);
}

function icGetBounds(path: Path64): Rect64 {
  if (path.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  
  const result: Rect64 = {
    left: Number.MAX_SAFE_INTEGER,
    top: Number.MAX_SAFE_INTEGER,
    right: Number.MIN_SAFE_INTEGER,
    bottom: Number.MIN_SAFE_INTEGER
  };
  
  for (const pt of path) {
    if (pt.x < result.left) result.left = pt.x;
    if (pt.x > result.right) result.right = pt.x;
    if (pt.y < result.top) result.top = pt.y;
    if (pt.y > result.bottom) result.bottom = pt.y;
  }
  
  return result.left === Number.MAX_SAFE_INTEGER ? 
    { left: 0, top: 0, right: 0, bottom: 0 } : result;
}

function getClosestPtOnSegment(offPt: Point64, seg1: Point64, seg2: Point64): Point64 {
  if (seg1.x === seg2.x && seg1.y === seg2.y) return { x: seg1.x, y: seg1.y, z: 0 };  // Return copy, not reference
  
  const dx = (seg2.x - seg1.x);
  const dy = (seg2.y - seg1.y);
  const q = safeMultiplySum((offPt.x - seg1.x), dx, (offPt.y - seg1.y), dy) /
    safeMultiplySum(dx, dx, dy, dy);
  const qClamped = q < 0 ? 0 : (q > 1 ? 1 : q);
  
  return {
    // use Math.round to match the C# MidpointRounding.ToEven behavior
    x: Math.round(seg1.x + qClamped * dx),
    y: Math.round(seg1.y + qClamped * dy),
    z: 0
  };
}

function icPointInPolygon(pt: Point64, polygon: Path64): PointInPolygonResult {
  const len = polygon.length;
  let start = 0;
  if (len < 3) return PointInPolygonResult.IsOutside;

  while (start < len && polygon[start].y === pt.y) start++;
  if (start === len) return PointInPolygonResult.IsOutside;

  let isAbove = polygon[start].y < pt.y;
  const startingAbove = isAbove;
  let val = 0;
  let i = start + 1;
  let end = len;
  
  while (true) {
    if (i === end) {
      if (end === 0 || start === 0) break;
      end = start;
      i = 0;
    }

    if (isAbove) {
      while (i < end && polygon[i].y < pt.y) i++;
    } else {
      while (i < end && polygon[i].y > pt.y) i++;
    }

    if (i === end) continue;

    const curr = polygon[i];
    const prev = i > 0 ? polygon[i - 1] : polygon[len - 1];

    if (curr.y === pt.y) {
      if (curr.x === pt.x || (curr.y === prev.y &&
        ((pt.x < prev.x) !== (pt.x < curr.x)))) {
        return PointInPolygonResult.IsOn;
      }
      i++;
      if (i === start) break;
      continue;
    }

    if (pt.x < curr.x && pt.x < prev.x) {
      // we're only interested in edges crossing on the left
    } else if (pt.x > prev.x && pt.x > curr.x) {
      val = 1 - val; // toggle val
    } else {
      const cps = crossProductSign(prev, curr, pt);
      if (cps === 0) return PointInPolygonResult.IsOn;
      if ((cps < 0) === isAbove) val = 1 - val;
    }
    isAbove = !isAbove;
    i++;
  }

  if (isAbove === startingAbove) {
    return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
  }
  
  if (i === len) i = 0;
  const cps = i === 0 ? 
    crossProductSign(polygon[len - 1], polygon[0], pt) : 
    crossProductSign(polygon[i - 1], polygon[i], pt);
  if (cps === 0) return PointInPolygonResult.IsOn;
  if ((cps < 0) === isAbove) val = 1 - val;

  return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
}

function path2ContainsPath1(path1: Path64, path2: Path64): boolean {
  // we need to make some accommodation for rounding errors
  // so we won't jump if the first vertex is found outside
  let pip = PointInPolygonResult.IsOn;
  for (const pt of path1) {
    switch (icPointInPolygon(pt, path2)) {
      case PointInPolygonResult.IsOutside:
        if (pip === PointInPolygonResult.IsOutside) return false;
        pip = PointInPolygonResult.IsOutside;
        break;
      case PointInPolygonResult.IsInside:
        if (pip === PointInPolygonResult.IsInside) return true;
        pip = PointInPolygonResult.IsInside;
        break;
      default:
        break;
    }
  }
  // since path1's location is still equivocal, check its midpoint
  const mp = icGetBounds(path1);
  let midX: number, midY: number;
  if (Number.isSafeInteger(mp.left) && Number.isSafeInteger(mp.right) &&
      Math.abs(mp.left) + Math.abs(mp.right) > Number.MAX_SAFE_INTEGER) {
    midX = Number((BigInt(mp.left) + BigInt(mp.right)) / B2);
    midY = Number((BigInt(mp.top) + BigInt(mp.bottom)) / B2);
  } else {
    midX = Math.round((mp.left + mp.right) / 2);
    midY = Math.round((mp.top + mp.bottom) / 2);
  }
  const midPt: Point64 = { x: midX, y: midY };
  return icPointInPolygon(midPt, path2) !== PointInPolygonResult.IsOutside;
}

// Plain const object replaces the namespace. External callers use InternalClipper.foo()
// unchanged; tsc emits a simple object literal instead of an IIFE.
export const InternalClipper = {
  MaxInt64: IC_MaxInt64,
  MaxCoord: IC_MaxCoord,
  max_coord: IC_MaxCoord,
  min_coord: -IC_MaxCoord,
  Invalid64: IC_Invalid64,
  floatingPointTolerance: IC_floatingPointTolerance,
  defaultMinimumEdgeLength: IC_defaultMinimumEdgeLength,
  maxCoordForSafeAreaProduct: IC_maxCoordForSafeAreaProduct,
  maxCoordForSafeCrossSq: IC_maxCoordForSafeCrossSq,
  maxSafeCoordinateForScale,
  checkSafeScaleValue,
  ensureSafeInteger,
  crossProduct,
  crossProductSign,
  checkPrecision,
  isAlmostZero,
  triSign,
  multiplyUInt64,
  productsAreEqual,
  isCollinear,
  dotProduct,
  dotProductSign,
  area: icArea,
  crossProductD,
  dotProductD,
  roundToEven,
  checkCastInt64,
  getLineIntersectPt,
  getLineIntersectPtD,
  segsIntersect,
  getBounds: icGetBounds,
  getClosestPtOnSegment,
  pointInPolygon: icPointInPolygon,
  path2ContainsPath1,
}

// Backward-compatible type namespace for consumers who used InternalClipper.UInt128Struct as a type.
/** @deprecated Import UInt128Struct directly instead of using InternalClipper.UInt128Struct */
export namespace InternalClipper {
  /** @deprecated Import UInt128Struct directly */
  export type UInt128Struct = import('./Core.js').UInt128Struct;
}

// Point64 utility functions (plain object, avoids namespace IIFE)
export const Point64Utils = {
  create(x: number = 0, y: number = 0, z: number = 0): Point64 {
    return { x: Math.round(x), y: Math.round(y), z };
  },

  fromPointD(pt: PointD): Point64 {
    InternalClipper.ensureSafeInteger(pt.x, "Point64Utils.fromPointD");
    InternalClipper.ensureSafeInteger(pt.y, "Point64Utils.fromPointD");
    return { x: Math.round(pt.x), y: Math.round(pt.y), z: pt.z || 0 };
  },

  scale(pt: Point64, scale: number): Point64 {
    return {
      x: Math.round(pt.x * scale),
      y: Math.round(pt.y * scale),
      z: pt.z || 0
    };
  },

  equals(a: Point64, b: Point64): boolean {
    return a.x === b.x && a.y === b.y;
  },

  add(a: Point64, b: Point64): Point64 {
    if (Number.isSafeInteger(a.x) && Number.isSafeInteger(b.x) &&
        Number.isSafeInteger(a.y) && Number.isSafeInteger(b.y)) {
      const sumX = a.x + b.x;
      const sumY = a.y + b.y;
      if (Number.isSafeInteger(sumX) && Number.isSafeInteger(sumY)) {
        return { x: sumX, y: sumY, z: 0 };
      }
      return { 
        x: Number(BigInt(a.x) + BigInt(b.x)), 
        y: Number(BigInt(a.y) + BigInt(b.y)), 
        z: 0 
      };
    }
    return { x: a.x + b.x, y: a.y + b.y, z: 0 };
  },

  subtract(a: Point64, b: Point64): Point64 {
    return { x: a.x - b.x, y: a.y - b.y, z: 0 };
  },

  toString(pt: Point64): string {
    if (pt.z !== undefined && pt.z !== 0) {
      return `${pt.x},${pt.y},${pt.z} `;
    }
    return `${pt.x},${pt.y} `;
  },
};

// PointD utility functions (plain object, avoids namespace IIFE)
export const PointDUtils = {
  create(x: number = 0, y: number = 0, z: number = 0): PointD {
    return { x, y, z };
  },

  fromPoint64(pt: Point64): PointD {
    return { x: pt.x, y: pt.y, z: pt.z || 0 };
  },

  scale(pt: PointD, scale: number): PointD {
    return { x: pt.x * scale, y: pt.y * scale, z: pt.z || 0 };
  },

  equals(a: PointD, b: PointD): boolean {
    return InternalClipper.isAlmostZero(a.x - b.x) && 
           InternalClipper.isAlmostZero(a.y - b.y);
  },

  negate(pt: PointD): void {
    pt.x = -pt.x;
    pt.y = -pt.y;
  },

  toString(pt: PointD, precision: number = 2): string {
    if (pt.z !== undefined && pt.z !== 0) {
      return `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)},${pt.z}`;
    }
    return `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)}`;
  },
};

// Rect64 utility functions (plain object, avoids namespace IIFE)
export const Rect64Utils = {
  create(l: number = 0, t: number = 0, r: number = 0, b: number = 0): Rect64 {
    return { left: l, top: t, right: r, bottom: b };
  },

  createInvalid(): Rect64 {
    return {
      left: Number.MAX_SAFE_INTEGER,
      top: Number.MAX_SAFE_INTEGER,
      right: Number.MIN_SAFE_INTEGER,
      bottom: Number.MIN_SAFE_INTEGER
    };
  },

  width(rect: Rect64): number {
    return rect.right - rect.left;
  },

  height(rect: Rect64): number {
    return rect.bottom - rect.top;
  },

  isEmpty(rect: Rect64): boolean {
    return rect.bottom <= rect.top || rect.right <= rect.left;
  },

  isValid(rect: Rect64): boolean {
    return rect.left < Number.MAX_SAFE_INTEGER;
  },

  midPoint(rect: Rect64): Point64 {
    if (Number.isSafeInteger(rect.left) && Number.isSafeInteger(rect.right) &&
        Math.abs(rect.left) + Math.abs(rect.right) > Number.MAX_SAFE_INTEGER) {
      const midX = Number((BigInt(rect.left) + BigInt(rect.right)) / B2);
      const midY = Number((BigInt(rect.top) + BigInt(rect.bottom)) / B2);
      return { x: midX, y: midY };
    }
    return {
      x: Math.round((rect.left + rect.right) / 2),
      y: Math.round((rect.top + rect.bottom) / 2)
    };
  },

  contains(rect: Rect64, pt: Point64): boolean {
    return pt.x > rect.left && pt.x < rect.right &&
           pt.y > rect.top && pt.y < rect.bottom;
  },

  containsRect(rect: Rect64, rec: Rect64): boolean {
    return rec.left >= rect.left && rec.right <= rect.right &&
           rec.top >= rect.top && rec.bottom <= rect.bottom;
  },

  intersects(rect: Rect64, rec: Rect64): boolean {
    return (Math.max(rect.left, rec.left) <= Math.min(rect.right, rec.right)) &&
           (Math.max(rect.top, rec.top) <= Math.min(rect.bottom, rec.bottom));
  },

  asPath(rect: Rect64): Path64 {
    return [
      { x: rect.left, y: rect.top, z: 0 },
      { x: rect.right, y: rect.top, z: 0 },
      { x: rect.right, y: rect.bottom, z: 0 },
      { x: rect.left, y: rect.bottom, z: 0 }
    ];
  },
};

// RectD utility functions (plain object, avoids namespace IIFE)
export const RectDUtils = {
  create(l: number = 0, t: number = 0, r: number = 0, b: number = 0): RectD {
    return { left: l, top: t, right: r, bottom: b };
  },

  createInvalid(): RectD {
    return {
      left: Number.MAX_VALUE,
      top: Number.MAX_VALUE,
      right: -Number.MAX_VALUE,
      bottom: -Number.MAX_VALUE
    };
  },

  width(rect: RectD): number {
    return rect.right - rect.left;
  },

  height(rect: RectD): number {
    return rect.bottom - rect.top;
  },

  isEmpty(rect: RectD): boolean {
    return rect.bottom <= rect.top || rect.right <= rect.left;
  },

  midPoint(rect: RectD): PointD {
    return {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    };
  },

  contains(rect: RectD, pt: PointD): boolean {
    return pt.x > rect.left && pt.x < rect.right &&
           pt.y > rect.top && pt.y < rect.bottom;
  },

  containsRect(rect: RectD, rec: RectD): boolean {
    return rec.left >= rect.left && rec.right <= rect.right &&
           rec.top >= rect.top && rec.bottom <= rect.bottom;
  },

  intersects(rect: RectD, rec: RectD): boolean {
    return (Math.max(rect.left, rec.left) < Math.min(rect.right, rec.right)) &&
           (Math.max(rect.top, rec.top) < Math.min(rect.bottom, rec.bottom));
  },

  asPath(rect: RectD): PathD {
    return [
      { x: rect.left, y: rect.top, z: 0 },
      { x: rect.right, y: rect.top, z: 0 },
      { x: rect.right, y: rect.bottom, z: 0 },
      { x: rect.left, y: rect.bottom, z: 0 }
    ];
  },
};

// Path utility functions (plain object, avoids namespace IIFE)
export const PathUtils = {
  toString64(path: Path64): string {
    let result = "";
    for (const pt of path) {
      result += Point64Utils.toString(pt);
    }
    return result + '\n';
  },

  toStringD(path: PathD, precision: number = 2): string {
    let result = "";
    for (const pt of path) {
      result += PointDUtils.toString(pt, precision) + ", ";
    }
    if (result !== "") result = result.slice(0, -2);
    return result;
  },

  reverse64(path: Path64): Path64 {
    return [...path].reverse();
  },

  reverseD(path: PathD): PathD {
    return [...path].reverse();
  },
};

export const PathsUtils = {
  toString64(paths: Paths64): string {
    let result = "";
    for (const path of paths) {
      result += PathUtils.toString64(path);
    }
    return result;
  },

  toStringD(paths: PathsD, precision: number = 2): string {
    let result = "";
    for (const path of paths) {
      result += PathUtils.toStringD(path, precision) + "\n";
    }
    return result;
  },

  reverse64(paths: Paths64): Paths64 {
    return paths.map(path => PathUtils.reverse64(path));
  },

  reverseD(paths: PathsD): PathsD {
    return paths.map(path => PathUtils.reverseD(path));
  },
};

// Constants (frozen to prevent accidental mutation of shared singletons)
export const InvalidRect64: Rect64 = Object.freeze(Rect64Utils.createInvalid());
export const InvalidRectD: RectD = Object.freeze(RectDUtils.createInvalid());
