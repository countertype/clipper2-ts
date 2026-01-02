/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  12 December 2025                                                *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Core structures and functions for the Clipper Library           *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
// Note: all clipping operations except for Difference are commutative.
export var ClipType;
(function (ClipType) {
    ClipType[ClipType["NoClip"] = 0] = "NoClip";
    ClipType[ClipType["Intersection"] = 1] = "Intersection";
    ClipType[ClipType["Union"] = 2] = "Union";
    ClipType[ClipType["Difference"] = 3] = "Difference";
    ClipType[ClipType["Xor"] = 4] = "Xor";
})(ClipType || (ClipType = {}));
export var PathType;
(function (PathType) {
    PathType[PathType["Subject"] = 0] = "Subject";
    PathType[PathType["Clip"] = 1] = "Clip";
})(PathType || (PathType = {}));
// By far the most widely used filling rules for polygons are EvenOdd
// and NonZero, sometimes called Alternate and Winding respectively.
// https://en.wikipedia.org/wiki/Nonzero-rule
export var FillRule;
(function (FillRule) {
    FillRule[FillRule["EvenOdd"] = 0] = "EvenOdd";
    FillRule[FillRule["NonZero"] = 1] = "NonZero";
    FillRule[FillRule["Positive"] = 2] = "Positive";
    FillRule[FillRule["Negative"] = 3] = "Negative";
})(FillRule || (FillRule = {}));
// PointInPolygon
export var PointInPolygonResult;
(function (PointInPolygonResult) {
    PointInPolygonResult[PointInPolygonResult["IsOn"] = 0] = "IsOn";
    PointInPolygonResult[PointInPolygonResult["IsInside"] = 1] = "IsInside";
    PointInPolygonResult[PointInPolygonResult["IsOutside"] = 2] = "IsOutside";
})(PointInPolygonResult || (PointInPolygonResult = {}));
export var InternalClipper;
(function (InternalClipper) {
    InternalClipper.MaxInt64 = 9223372036854775807n;
    InternalClipper.MaxCoord = Number(InternalClipper.MaxInt64 / 4n);
    InternalClipper.max_coord = InternalClipper.MaxCoord;
    InternalClipper.min_coord = -InternalClipper.MaxCoord;
    InternalClipper.Invalid64 = Number(InternalClipper.MaxInt64);
    InternalClipper.floatingPointTolerance = 1E-12;
    InternalClipper.defaultMinimumEdgeLength = 0.1;
    function crossProduct(pt1, pt2, pt3) {
        // typecast to avoid potential int overflow
        return ((pt2.x - pt1.x) * (pt3.y - pt2.y) -
            (pt2.y - pt1.y) * (pt3.x - pt2.x));
    }
    InternalClipper.crossProduct = crossProduct;
    function crossProductSign(pt1, pt2, pt3) {
        const a = pt2.x - pt1.x;
        const b = pt3.y - pt2.y;
        const c = pt2.y - pt1.y;
        const d = pt3.x - pt2.x;
        // Fast check for safe integer range (approx 9.4e7)
        // Using Math.abs inline allows short-circuiting
        if (Math.abs(a) < 9e7 && Math.abs(b) < 9e7 && Math.abs(c) < 9e7 && Math.abs(d) < 9e7) {
            const prod1 = a * b;
            const prod2 = c * d;
            return (prod1 > prod2) ? 1 : (prod1 < prod2) ? -1 : 0;
        }
        // Optimization: Check signs first!
        // This often avoids large number multiplication entirely.
        const signA = (a < 0 ? -1 : (a > 0 ? 1 : 0));
        const signB = (b < 0 ? -1 : (b > 0 ? 1 : 0));
        const signC = (c < 0 ? -1 : (c > 0 ? 1 : 0));
        const signD = (d < 0 ? -1 : (d > 0 ? 1 : 0));
        const signAB = signA * signB;
        const signCD = signC * signD;
        if (signAB !== signCD) {
            return signAB > signCD ? 1 : -1;
        }
        if (signAB === 0)
            return 0; // both 0 because signs equal
        const bigA = BigInt(a);
        const bigB = BigInt(b);
        const bigC = BigInt(c);
        const bigD = BigInt(d);
        const prod1 = bigA * bigB;
        const prod2 = bigC * bigD;
        if (prod1 === prod2)
            return 0;
        return (prod1 > prod2) ? 1 : -1;
    }
    InternalClipper.crossProductSign = crossProductSign;
    function checkPrecision(precision) {
        if (precision < -8 || precision > 8) {
            throw new Error("Error: Precision is out of range.");
        }
    }
    InternalClipper.checkPrecision = checkPrecision;
    function isAlmostZero(value) {
        return Math.abs(value) <= InternalClipper.floatingPointTolerance;
    }
    InternalClipper.isAlmostZero = isAlmostZero;
    function triSign(x) {
        return (x < 0) ? -1 : (x > 0) ? 1 : 0;
    }
    InternalClipper.triSign = triSign;
    function multiplyUInt64(a, b) {
        // Fix: a and b might be larger than 2^32, so don't use >>> 0
        const aBig = BigInt(a);
        const bBig = BigInt(b);
        const res = aBig * bBig;
        return {
            lo64: Number(res & 0xffffffffffffffffn),
            hi64: Number(res >> 64n)
        };
    }
    InternalClipper.multiplyUInt64 = multiplyUInt64;
    // returns true if (and only if) a * b == c * d
    function productsAreEqual(a, b, c, d) {
        const absA = Math.abs(a);
        const absB = Math.abs(b);
        const absC = Math.abs(c);
        const absD = Math.abs(d);
        // Fast path for typical coordinates
        if (absA < 46341 && absB < 46341 && absC < 46341 && absD < 46341) {
            return a * b === c * d;
        }
        // Extended fast path for safe integer range (approx 9.4e7)
        if (absA < 9e7 && absB < 9e7 && absC < 9e7 && absD < 9e7) {
            return a * b === c * d;
        }
        const signAb = (a < 0 ? -1 : (a > 0 ? 1 : 0)) * (b < 0 ? -1 : (b > 0 ? 1 : 0));
        const signCd = (c < 0 ? -1 : (c > 0 ? 1 : 0)) * (d < 0 ? -1 : (d > 0 ? 1 : 0));
        if (signAb !== signCd)
            return false;
        if (signAb === 0)
            return true;
        const bigA = BigInt(absA);
        const bigB = BigInt(absB);
        const bigC = BigInt(absC);
        const bigD = BigInt(absD);
        return (bigA * bigB) === (bigC * bigD);
    }
    InternalClipper.productsAreEqual = productsAreEqual;
    function isCollinear(pt1, sharedPt, pt2) {
        const a = sharedPt.x - pt1.x;
        const b = pt2.y - sharedPt.y;
        const c = sharedPt.y - pt1.y;
        const d = pt2.x - sharedPt.x;
        // When checking for collinearity with very large coordinate values
        // then ProductsAreEqual is more accurate than using CrossProduct.
        return productsAreEqual(a, b, c, d);
    }
    InternalClipper.isCollinear = isCollinear;
    function dotProduct(pt1, pt2, pt3) {
        // typecast to avoid potential int overflow
        return ((pt2.x - pt1.x) * (pt3.x - pt2.x) +
            (pt2.y - pt1.y) * (pt3.y - pt2.y));
    }
    InternalClipper.dotProduct = dotProduct;
    function crossProductD(vec1, vec2) {
        return (vec1.y * vec2.x - vec2.y * vec1.x);
    }
    InternalClipper.crossProductD = crossProductD;
    function dotProductD(vec1, vec2) {
        return (vec1.x * vec2.x + vec1.y * vec2.y);
    }
    InternalClipper.dotProductD = dotProductD;
    // Banker's rounding (round half to even) to match C# MidpointRounding.ToEven
    function roundToEven(value) {
        // Use the built-in behavior that's closer to C# MidpointRounding.ToEven
        // JavaScript's Math.round actually implements "round half away from zero"
        // but for most practical cases, the difference is minimal
        const floor = Math.floor(value);
        const diff = value - floor;
        if (Math.abs(diff - 0.5) < 1e-10) {
            // Exactly halfway - round to even
            return floor % 2 === 0 ? floor : floor + 1;
        }
        return Math.round(value);
    }
    InternalClipper.roundToEven = roundToEven;
    function checkCastInt64(val) {
        if ((val >= InternalClipper.max_coord) || (val <= InternalClipper.min_coord))
            return InternalClipper.Invalid64;
        return Math.round(val);
    }
    InternalClipper.checkCastInt64 = checkCastInt64;
    // GetLineIntersectPt - a 'true' result is non-parallel. The 'ip' will also
    // be constrained to seg1. However, it's possible that 'ip' won't be inside
    // seg2, even when 'ip' hasn't been constrained (ie 'ip' is inside seg1).
    function getLineIntersectPt(ln1a, ln1b, ln2a, ln2b) {
        const dy1 = (ln1b.y - ln1a.y);
        const dx1 = (ln1b.x - ln1a.x);
        const dy2 = (ln2b.y - ln2a.y);
        const dx2 = (ln2b.x - ln2a.x);
        const det = dy1 * dx2 - dy2 * dx1;
        if (det === 0.0) {
            return { intersects: false, point: { x: 0, y: 0 } };
        }
        const t = ((ln1a.x - ln2a.x) * dy2 - (ln1a.y - ln2a.y) * dx2) / det;
        let ip;
        if (t <= 0.0) {
            // Create a copy to avoid mutating original.
            ip = { x: ln1a.x, y: ln1a.y };
        }
        else if (t >= 1.0) {
            ip = { x: ln1b.x, y: ln1b.y };
        }
        else {
            // avoid using constructor (and rounding too) as they affect performance
            // Use Math.trunc to match C# (long) cast behavior which truncates towards zero
            const rawX = ln1a.x + t * dx1;
            const rawY = ln1a.y + t * dy1;
            ip = {
                x: Math.trunc(rawX),
                y: Math.trunc(rawY)
            };
        }
        return { intersects: true, point: ip };
    }
    InternalClipper.getLineIntersectPt = getLineIntersectPt;
    function getLineIntersectPtD(ln1a, ln1b, ln2a, ln2b) {
        const dy1 = ln1b.y - ln1a.y;
        const dx1 = ln1b.x - ln1a.x;
        const dy2 = ln2b.y - ln2a.y;
        const dx2 = ln2b.x - ln2a.x;
        const det = dy1 * dx2 - dy2 * dx1;
        if (det === 0.0) {
            return { success: false, ip: { x: 0, y: 0, z: 0 } };
        }
        const t = ((ln1a.x - ln2a.x) * dy2 - (ln1a.y - ln2a.y) * dx2) / det;
        let ip;
        if (t <= 0.0) {
            ip = { ...ln1a, z: 0 };
        }
        else if (t >= 1.0) {
            ip = { ...ln1b, z: 0 };
        }
        else {
            ip = {
                x: ln1a.x + t * dx1,
                y: ln1a.y + t * dy1,
                z: 0
            };
        }
        return { success: true, ip };
    }
    InternalClipper.getLineIntersectPtD = getLineIntersectPtD;
    function segsIntersect(seg1a, seg1b, seg2a, seg2b, inclusive = false) {
        if (!inclusive) {
            // Match C# fast path - use cross product multiplication
            // This avoids floating point equality checks (safer than === 0)
            return (crossProduct(seg1a, seg2a, seg2b) *
                crossProduct(seg1b, seg2a, seg2b) < 0) &&
                (crossProduct(seg2a, seg1a, seg1b) *
                    crossProduct(seg2b, seg1a, seg1b) < 0);
        }
        // Inclusive case - match C# implementation
        const res1 = crossProduct(seg1a, seg2a, seg2b);
        const res2 = crossProduct(seg1b, seg2a, seg2b);
        if (res1 * res2 > 0)
            return false;
        const res3 = crossProduct(seg2a, seg1a, seg1b);
        const res4 = crossProduct(seg2b, seg1a, seg1b);
        if (res3 * res4 > 0)
            return false;
        // ensure NOT collinear
        return (res1 !== 0 || res2 !== 0 || res3 !== 0 || res4 !== 0);
    }
    InternalClipper.segsIntersect = segsIntersect;
    function getBounds(path) {
        if (path.length === 0)
            return { left: 0, top: 0, right: 0, bottom: 0 };
        const result = {
            left: Number.MAX_SAFE_INTEGER,
            top: Number.MAX_SAFE_INTEGER,
            right: Number.MIN_SAFE_INTEGER,
            bottom: Number.MIN_SAFE_INTEGER
        };
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
        return result.left === Number.MAX_SAFE_INTEGER ?
            { left: 0, top: 0, right: 0, bottom: 0 } : result;
    }
    InternalClipper.getBounds = getBounds;
    function getClosestPtOnSegment(offPt, seg1, seg2) {
        if (seg1.x === seg2.x && seg1.y === seg2.y)
            return { x: seg1.x, y: seg1.y, z: 0 }; // Return copy, not reference
        const dx = (seg2.x - seg1.x);
        const dy = (seg2.y - seg1.y);
        const q = ((offPt.x - seg1.x) * dx + (offPt.y - seg1.y) * dy) / ((dx * dx) + (dy * dy));
        const qClamped = q < 0 ? 0 : (q > 1 ? 1 : q);
        return {
            // use Math.round to match the C# MidpointRounding.ToEven behavior
            x: Math.round(seg1.x + qClamped * dx),
            y: Math.round(seg1.y + qClamped * dy),
            z: 0
        };
    }
    InternalClipper.getClosestPtOnSegment = getClosestPtOnSegment;
    function pointInPolygon(pt, polygon) {
        const len = polygon.length;
        let start = 0;
        if (len < 3)
            return PointInPolygonResult.IsOutside;
        while (start < len && polygon[start].y === pt.y)
            start++;
        if (start === len)
            return PointInPolygonResult.IsOutside;
        let isAbove = polygon[start].y < pt.y;
        const startingAbove = isAbove;
        let val = 0;
        let i = start + 1;
        let end = len;
        while (true) {
            if (i === end) {
                if (end === 0 || start === 0)
                    break;
                end = start;
                i = 0;
            }
            if (isAbove) {
                while (i < end && polygon[i].y < pt.y)
                    i++;
            }
            else {
                while (i < end && polygon[i].y > pt.y)
                    i++;
            }
            if (i === end)
                continue;
            const curr = polygon[i];
            const prev = i > 0 ? polygon[i - 1] : polygon[len - 1];
            if (curr.y === pt.y) {
                if (curr.x === pt.x || (curr.y === prev.y &&
                    ((pt.x < prev.x) !== (pt.x < curr.x)))) {
                    return PointInPolygonResult.IsOn;
                }
                i++;
                if (i === start)
                    break;
                continue;
            }
            if (pt.x < curr.x && pt.x < prev.x) {
                // we're only interested in edges crossing on the left
            }
            else if (pt.x > prev.x && pt.x > curr.x) {
                val = 1 - val; // toggle val
            }
            else {
                const cps = crossProductSign(prev, curr, pt);
                if (cps === 0)
                    return PointInPolygonResult.IsOn;
                if ((cps < 0) === isAbove)
                    val = 1 - val;
            }
            isAbove = !isAbove;
            i++;
        }
        if (isAbove === startingAbove) {
            return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
        }
        if (i === len)
            i = 0;
        const cps = i === 0 ?
            crossProductSign(polygon[len - 1], polygon[0], pt) :
            crossProductSign(polygon[i - 1], polygon[i], pt);
        if (cps === 0)
            return PointInPolygonResult.IsOn;
        if ((cps < 0) === isAbove)
            val = 1 - val;
        return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
    }
    InternalClipper.pointInPolygon = pointInPolygon;
    function path2ContainsPath1(path1, path2) {
        // we need to make some accommodation for rounding errors
        // so we won't jump if the first vertex is found outside
        let pip = PointInPolygonResult.IsOn;
        for (const pt of path1) {
            switch (pointInPolygon(pt, path2)) {
                case PointInPolygonResult.IsOutside:
                    if (pip === PointInPolygonResult.IsOutside)
                        return false;
                    pip = PointInPolygonResult.IsOutside;
                    break;
                case PointInPolygonResult.IsInside:
                    if (pip === PointInPolygonResult.IsInside)
                        return true;
                    pip = PointInPolygonResult.IsInside;
                    break;
                default:
                    break;
            }
        }
        // since path1's location is still equivocal, check its midpoint
        const mp = getBounds(path1);
        const midPt = {
            x: Math.round((mp.left + mp.right) / 2),
            y: Math.round((mp.top + mp.bottom) / 2)
        };
        return pointInPolygon(midPt, path2) !== PointInPolygonResult.IsOutside;
    }
    InternalClipper.path2ContainsPath1 = path2ContainsPath1;
})(InternalClipper || (InternalClipper = {}));
// Point64 utility functions
export var Point64Utils;
(function (Point64Utils) {
    function create(x = 0, y = 0, z = 0) {
        return { x: Math.round(x), y: Math.round(y), z };
    }
    Point64Utils.create = create;
    function fromPointD(pt) {
        return { x: Math.round(pt.x), y: Math.round(pt.y), z: pt.z || 0 };
    }
    Point64Utils.fromPointD = fromPointD;
    function scale(pt, scale) {
        return {
            x: Math.round(pt.x * scale),
            y: Math.round(pt.y * scale),
            z: pt.z || 0
        };
    }
    Point64Utils.scale = scale;
    function equals(a, b) {
        return a.x === b.x && a.y === b.y;
    }
    Point64Utils.equals = equals;
    function add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: 0 };
    }
    Point64Utils.add = add;
    function subtract(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: 0 };
    }
    Point64Utils.subtract = subtract;
    function toString(pt) {
        if (pt.z !== undefined && pt.z !== 0) {
            return `${pt.x},${pt.y},${pt.z} `;
        }
        return `${pt.x},${pt.y} `;
    }
    Point64Utils.toString = toString;
})(Point64Utils || (Point64Utils = {}));
// PointD utility functions
export var PointDUtils;
(function (PointDUtils) {
    function create(x = 0, y = 0, z = 0) {
        return { x, y, z };
    }
    PointDUtils.create = create;
    function fromPoint64(pt) {
        return { x: pt.x, y: pt.y, z: pt.z || 0 };
    }
    PointDUtils.fromPoint64 = fromPoint64;
    function scale(pt, scale) {
        return { x: pt.x * scale, y: pt.y * scale, z: pt.z || 0 };
    }
    PointDUtils.scale = scale;
    function equals(a, b) {
        return InternalClipper.isAlmostZero(a.x - b.x) &&
            InternalClipper.isAlmostZero(a.y - b.y);
    }
    PointDUtils.equals = equals;
    function negate(pt) {
        pt.x = -pt.x;
        pt.y = -pt.y;
    }
    PointDUtils.negate = negate;
    function toString(pt, precision = 2) {
        if (pt.z !== undefined && pt.z !== 0) {
            return `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)},${pt.z}`;
        }
        return `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)}`;
    }
    PointDUtils.toString = toString;
})(PointDUtils || (PointDUtils = {}));
// Rect64 utility functions
export var Rect64Utils;
(function (Rect64Utils) {
    function create(l = 0, t = 0, r = 0, b = 0) {
        return { left: l, top: t, right: r, bottom: b };
    }
    Rect64Utils.create = create;
    function createInvalid() {
        return {
            left: Number.MAX_SAFE_INTEGER,
            top: Number.MAX_SAFE_INTEGER,
            right: Number.MIN_SAFE_INTEGER,
            bottom: Number.MIN_SAFE_INTEGER
        };
    }
    Rect64Utils.createInvalid = createInvalid;
    function width(rect) {
        return rect.right - rect.left;
    }
    Rect64Utils.width = width;
    function height(rect) {
        return rect.bottom - rect.top;
    }
    Rect64Utils.height = height;
    function isEmpty(rect) {
        return rect.bottom <= rect.top || rect.right <= rect.left;
    }
    Rect64Utils.isEmpty = isEmpty;
    function isValid(rect) {
        return rect.left < Number.MAX_SAFE_INTEGER;
    }
    Rect64Utils.isValid = isValid;
    function midPoint(rect) {
        return {
            x: Math.round((rect.left + rect.right) / 2),
            y: Math.round((rect.top + rect.bottom) / 2)
        };
    }
    Rect64Utils.midPoint = midPoint;
    function contains(rect, pt) {
        return pt.x > rect.left && pt.x < rect.right &&
            pt.y > rect.top && pt.y < rect.bottom;
    }
    Rect64Utils.contains = contains;
    function containsRect(rect, rec) {
        return rec.left >= rect.left && rec.right <= rect.right &&
            rec.top >= rect.top && rec.bottom <= rect.bottom;
    }
    Rect64Utils.containsRect = containsRect;
    function intersects(rect, rec) {
        return (Math.max(rect.left, rec.left) <= Math.min(rect.right, rec.right)) &&
            (Math.max(rect.top, rec.top) <= Math.min(rect.bottom, rec.bottom));
    }
    Rect64Utils.intersects = intersects;
    function asPath(rect) {
        return [
            { x: rect.left, y: rect.top, z: 0 },
            { x: rect.right, y: rect.top, z: 0 },
            { x: rect.right, y: rect.bottom, z: 0 },
            { x: rect.left, y: rect.bottom, z: 0 }
        ];
    }
    Rect64Utils.asPath = asPath;
})(Rect64Utils || (Rect64Utils = {}));
// RectD utility functions
export var RectDUtils;
(function (RectDUtils) {
    function create(l = 0, t = 0, r = 0, b = 0) {
        return { left: l, top: t, right: r, bottom: b };
    }
    RectDUtils.create = create;
    function createInvalid() {
        return {
            left: Number.MAX_VALUE,
            top: Number.MAX_VALUE,
            right: -Number.MAX_VALUE,
            bottom: -Number.MAX_VALUE
        };
    }
    RectDUtils.createInvalid = createInvalid;
    function width(rect) {
        return rect.right - rect.left;
    }
    RectDUtils.width = width;
    function height(rect) {
        return rect.bottom - rect.top;
    }
    RectDUtils.height = height;
    function isEmpty(rect) {
        return rect.bottom <= rect.top || rect.right <= rect.left;
    }
    RectDUtils.isEmpty = isEmpty;
    function midPoint(rect) {
        return {
            x: (rect.left + rect.right) / 2,
            y: (rect.top + rect.bottom) / 2
        };
    }
    RectDUtils.midPoint = midPoint;
    function contains(rect, pt) {
        return pt.x > rect.left && pt.x < rect.right &&
            pt.y > rect.top && pt.y < rect.bottom;
    }
    RectDUtils.contains = contains;
    function containsRect(rect, rec) {
        return rec.left >= rect.left && rec.right <= rect.right &&
            rec.top >= rect.top && rec.bottom <= rect.bottom;
    }
    RectDUtils.containsRect = containsRect;
    function intersects(rect, rec) {
        return (Math.max(rect.left, rec.left) < Math.min(rect.right, rec.right)) &&
            (Math.max(rect.top, rec.top) < Math.min(rect.bottom, rec.bottom));
    }
    RectDUtils.intersects = intersects;
    function asPath(rect) {
        return [
            { x: rect.left, y: rect.top, z: 0 },
            { x: rect.right, y: rect.top, z: 0 },
            { x: rect.right, y: rect.bottom, z: 0 },
            { x: rect.left, y: rect.bottom, z: 0 }
        ];
    }
    RectDUtils.asPath = asPath;
})(RectDUtils || (RectDUtils = {}));
// Path utility functions
export var PathUtils;
(function (PathUtils) {
    function toString64(path) {
        let result = "";
        for (const pt of path) {
            result += Point64Utils.toString(pt);
        }
        return result + '\n';
    }
    PathUtils.toString64 = toString64;
    function toStringD(path, precision = 2) {
        let result = "";
        for (const pt of path) {
            result += PointDUtils.toString(pt, precision) + ", ";
        }
        if (result !== "")
            result = result.slice(0, -2);
        return result;
    }
    PathUtils.toStringD = toStringD;
    function reverse64(path) {
        return [...path].reverse();
    }
    PathUtils.reverse64 = reverse64;
    function reverseD(path) {
        return [...path].reverse();
    }
    PathUtils.reverseD = reverseD;
})(PathUtils || (PathUtils = {}));
export var PathsUtils;
(function (PathsUtils) {
    function toString64(paths) {
        let result = "";
        for (const path of paths) {
            result += PathUtils.toString64(path);
        }
        return result;
    }
    PathsUtils.toString64 = toString64;
    function toStringD(paths, precision = 2) {
        let result = "";
        for (const path of paths) {
            result += PathUtils.toStringD(path, precision) + "\n";
        }
        return result;
    }
    PathsUtils.toStringD = toStringD;
    function reverse64(paths) {
        return paths.map(path => PathUtils.reverse64(path));
    }
    PathsUtils.reverse64 = reverse64;
    function reverseD(paths) {
        return paths.map(path => PathUtils.reverseD(path));
    }
    PathsUtils.reverseD = reverseD;
})(PathsUtils || (PathsUtils = {}));
// Constants
export const InvalidRect64 = Rect64Utils.createInvalid();
export const InvalidRectD = RectDUtils.createInvalid();
//# sourceMappingURL=Core.js.map