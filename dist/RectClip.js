/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  FAST rectangular clipping                                       *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { PointInPolygonResult, InternalClipper, Point64Utils, Rect64Utils } from './Core.js';
export class OutPt2 {
    next = null;
    prev = null;
    pt;
    ownerIdx = 0;
    edge = null;
    constructor(pt) {
        this.pt = pt;
    }
}
var Location;
(function (Location) {
    Location[Location["left"] = 0] = "left";
    Location[Location["top"] = 1] = "top";
    Location[Location["right"] = 2] = "right";
    Location[Location["bottom"] = 3] = "bottom";
    Location[Location["inside"] = 4] = "inside";
})(Location || (Location = {}));
export class RectClip64 {
    rect;
    mp;
    rectPath;
    pathBounds = { left: 0, top: 0, right: 0, bottom: 0 };
    results = [];
    edges = [];
    currIdx = -1;
    constructor(rect) {
        this.currIdx = -1;
        this.rect = rect;
        this.mp = Rect64Utils.midPoint(rect);
        this.rectPath = Rect64Utils.asPath(this.rect);
        this.results = [];
        this.edges = [];
        for (let i = 0; i < 8; i++) {
            this.edges[i] = [];
        }
    }
    add(pt, startingNewPath = false) {
        // this method is only called by InternalExecute.
        // Later splitting and rejoining won't create additional op's,
        // though they will change the (non-storage) fResults count.
        let currIdx = this.results.length;
        let result;
        if ((currIdx === 0) || startingNewPath) {
            result = new OutPt2(pt);
            this.results.push(result);
            result.ownerIdx = currIdx;
            result.prev = result;
            result.next = result;
        }
        else {
            currIdx--;
            const prevOp = this.results[currIdx];
            if (prevOp && Point64Utils.equals(prevOp.pt, pt))
                return prevOp;
            result = new OutPt2(pt);
            result.ownerIdx = currIdx;
            result.next = prevOp.next;
            prevOp.next.prev = result;
            prevOp.next = result;
            result.prev = prevOp;
            this.results[currIdx] = result;
        }
        return result;
    }
    static path1ContainsPath2(path1, path2) {
        // nb: occasionally, due to rounding, path1 may 
        // appear (momentarily) inside or outside path2.
        let ioCount = 0;
        for (const pt of path2) {
            const pip = InternalClipper.pointInPolygon(pt, path1);
            switch (pip) {
                case PointInPolygonResult.IsInside:
                    ioCount--;
                    break;
                case PointInPolygonResult.IsOutside:
                    ioCount++;
                    break;
            }
            if (Math.abs(ioCount) > 1)
                break;
        }
        return ioCount <= 0;
    }
    static isClockwise(prev, curr, prevPt, currPt, rectMidPoint) {
        if (RectClip64.areOpposites(prev, curr)) {
            return InternalClipper.crossProduct(prevPt, rectMidPoint, currPt) < 0;
        }
        return RectClip64.headingClockwise(prev, curr);
    }
    static areOpposites(prev, curr) {
        return Math.abs(prev - curr) === 2;
    }
    static headingClockwise(prev, curr) {
        return (prev + 1) % 4 === curr;
    }
    static getAdjacentLocation(loc, isClockwise) {
        const delta = isClockwise ? 1 : 3;
        return (loc + delta) % 4;
    }
    static unlinkOp(op) {
        if (op.next === op)
            return null;
        op.prev.next = op.next;
        op.next.prev = op.prev;
        return op.next;
    }
    static unlinkOpBack(op) {
        if (op.next === op)
            return null;
        op.prev.next = op.next;
        op.next.prev = op.prev;
        return op.prev;
    }
    static getEdgesForPt(pt, rec) {
        let result = 0;
        if (pt.x === rec.left)
            result = 1;
        else if (pt.x === rec.right)
            result = 4;
        if (pt.y === rec.top)
            result += 2;
        else if (pt.y === rec.bottom)
            result += 8;
        return result;
    }
    static isHeadingClockwise(pt1, pt2, edgeIdx) {
        switch (edgeIdx) {
            case 0: return pt2.y < pt1.y;
            case 1: return pt2.x > pt1.x;
            case 2: return pt2.y > pt1.y;
            default: return pt2.x < pt1.x;
        }
    }
    static hasHorzOverlap(left1, right1, left2, right2) {
        return (left1.x < right2.x) && (right1.x > left2.x);
    }
    static hasVertOverlap(top1, bottom1, top2, bottom2) {
        return (top1.y < bottom2.y) && (bottom1.y > top2.y);
    }
    static addToEdge(edge, op) {
        if (op.edge !== null)
            return;
        op.edge = edge;
        edge.push(op);
    }
    static uncoupleEdge(op) {
        if (op.edge === null)
            return;
        for (let i = 0; i < op.edge.length; i++) {
            const op2 = op.edge[i];
            if (op2 === op) {
                op.edge[i] = null;
                break;
            }
        }
        op.edge = null;
    }
    static setNewOwner(op, newIdx) {
        op.ownerIdx = newIdx;
        let op2 = op.next;
        while (op2 !== op) {
            op2.ownerIdx = newIdx;
            op2 = op2.next;
        }
    }
    addCorner(prev, curr) {
        this.add(RectClip64.headingClockwise(prev, curr) ?
            this.rectPath[prev] : this.rectPath[curr]);
    }
    addCornerWithDirection(loc, isClockwise) {
        if (isClockwise) {
            this.add(this.rectPath[loc]);
            return RectClip64.getAdjacentLocation(loc, true);
        }
        else {
            const newLoc = RectClip64.getAdjacentLocation(loc, false);
            this.add(this.rectPath[newLoc]);
            return newLoc;
        }
    }
    static getLocation(rec, pt) {
        if (pt.x === rec.left && pt.y >= rec.top && pt.y <= rec.bottom) {
            return { location: Location.left, isOnRect: true };
        }
        if (pt.x === rec.right && pt.y >= rec.top && pt.y <= rec.bottom) {
            return { location: Location.right, isOnRect: true };
        }
        if (pt.y === rec.top && pt.x >= rec.left && pt.x <= rec.right) {
            return { location: Location.top, isOnRect: true };
        }
        if (pt.y === rec.bottom && pt.x >= rec.left && pt.x <= rec.right) {
            return { location: Location.bottom, isOnRect: true };
        }
        let location;
        if (pt.x < rec.left)
            location = Location.left;
        else if (pt.x > rec.right)
            location = Location.right;
        else if (pt.y < rec.top)
            location = Location.top;
        else if (pt.y > rec.bottom)
            location = Location.bottom;
        else
            location = Location.inside;
        return { location, isOnRect: false };
    }
    static isHorizontal(pt1, pt2) {
        return pt1.y === pt2.y;
    }
    static getSegmentIntersection(p1, p2, p3, p4) {
        const res1 = InternalClipper.crossProduct(p1, p3, p4);
        const res2 = InternalClipper.crossProduct(p2, p3, p4);
        if (res1 === 0) {
            const ip = p1;
            if (res2 === 0)
                return { intersects: false, point: ip }; // segments are collinear
            if (Point64Utils.equals(p1, p3) || Point64Utils.equals(p1, p4))
                return { intersects: true, point: ip };
            if (RectClip64.isHorizontal(p3, p4)) {
                return { intersects: (p1.x > p3.x) === (p1.x < p4.x), point: ip };
            }
            return { intersects: (p1.y > p3.y) === (p1.y < p4.y), point: ip };
        }
        if (res2 === 0) {
            const ip = p2;
            if (Point64Utils.equals(p2, p3) || Point64Utils.equals(p2, p4))
                return { intersects: true, point: ip };
            if (RectClip64.isHorizontal(p3, p4)) {
                return { intersects: (p2.x > p3.x) === (p2.x < p4.x), point: ip };
            }
            return { intersects: (p2.y > p3.y) === (p2.y < p4.y), point: ip };
        }
        if ((res1 > 0) === (res2 > 0)) {
            return { intersects: false, point: { x: 0, y: 0 } };
        }
        const res3 = InternalClipper.crossProduct(p3, p1, p2);
        const res4 = InternalClipper.crossProduct(p4, p1, p2);
        if (res3 === 0) {
            const ip = p3;
            if (Point64Utils.equals(p3, p1) || Point64Utils.equals(p3, p2))
                return { intersects: true, point: ip };
            if (RectClip64.isHorizontal(p1, p2)) {
                return { intersects: (p3.x > p1.x) === (p3.x < p2.x), point: ip };
            }
            return { intersects: (p3.y > p1.y) === (p3.y < p2.y), point: ip };
        }
        if (res4 === 0) {
            const ip = p4;
            if (Point64Utils.equals(p4, p1) || Point64Utils.equals(p4, p2))
                return { intersects: true, point: ip };
            if (RectClip64.isHorizontal(p1, p2)) {
                return { intersects: (p4.x > p1.x) === (p4.x < p2.x), point: ip };
            }
            return { intersects: (p4.y > p1.y) === (p4.y < p2.y), point: ip };
        }
        if ((res3 > 0) === (res4 > 0)) {
            return { intersects: false, point: { x: 0, y: 0 } };
        }
        // segments must intersect to get here
        return InternalClipper.getLineIntersectPt(p1, p2, p3, p4);
    }
    static getIntersection(rectPath, p, p2, loc) {
        // gets the pt of intersection between rectPath and segment(p, p2) that's closest to 'p'
        // when result == false, loc will remain unchanged
        let ip = { x: 0, y: 0 };
        let newLocation = loc;
        switch (loc) {
            case Location.left:
                {
                    const result1 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[3]);
                    if (result1.intersects) {
                        ip = result1.point;
                        return { intersects: true, point: ip, newLocation };
                    }
                    if (p.y < rectPath[0].y) {
                        const result2 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[1]);
                        if (result2.intersects) {
                            newLocation = Location.top;
                            return { intersects: true, point: result2.point, newLocation };
                        }
                    }
                    const result3 = RectClip64.getSegmentIntersection(p, p2, rectPath[2], rectPath[3]);
                    if (result3.intersects) {
                        newLocation = Location.bottom;
                        return { intersects: true, point: result3.point, newLocation };
                    }
                    return { intersects: false, point: ip, newLocation };
                }
            case Location.right:
                {
                    const result1 = RectClip64.getSegmentIntersection(p, p2, rectPath[1], rectPath[2]);
                    if (result1.intersects) {
                        return { intersects: true, point: result1.point, newLocation };
                    }
                    if (p.y < rectPath[0].y) {
                        const result2 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[1]);
                        if (result2.intersects) {
                            newLocation = Location.top;
                            return { intersects: true, point: result2.point, newLocation };
                        }
                    }
                    const result3 = RectClip64.getSegmentIntersection(p, p2, rectPath[2], rectPath[3]);
                    if (result3.intersects) {
                        newLocation = Location.bottom;
                        return { intersects: true, point: result3.point, newLocation };
                    }
                    return { intersects: false, point: ip, newLocation };
                }
            case Location.top:
                {
                    const result1 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[1]);
                    if (result1.intersects) {
                        return { intersects: true, point: result1.point, newLocation };
                    }
                    if (p.x < rectPath[0].x) {
                        const result2 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[3]);
                        if (result2.intersects) {
                            newLocation = Location.left;
                            return { intersects: true, point: result2.point, newLocation };
                        }
                    }
                    if (p.x <= rectPath[1].x) {
                        return { intersects: false, point: ip, newLocation };
                    }
                    const result3 = RectClip64.getSegmentIntersection(p, p2, rectPath[1], rectPath[2]);
                    if (result3.intersects) {
                        newLocation = Location.right;
                        return { intersects: true, point: result3.point, newLocation };
                    }
                    return { intersects: false, point: ip, newLocation };
                }
            case Location.bottom:
                {
                    const result1 = RectClip64.getSegmentIntersection(p, p2, rectPath[2], rectPath[3]);
                    if (result1.intersects) {
                        return { intersects: true, point: result1.point, newLocation };
                    }
                    if (p.x < rectPath[3].x) {
                        const result2 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[3]);
                        if (result2.intersects) {
                            newLocation = Location.left;
                            return { intersects: true, point: result2.point, newLocation };
                        }
                    }
                    if (p.x <= rectPath[2].x) {
                        return { intersects: false, point: ip, newLocation };
                    }
                    const result3 = RectClip64.getSegmentIntersection(p, p2, rectPath[1], rectPath[2]);
                    if (result3.intersects) {
                        newLocation = Location.right;
                        return { intersects: true, point: result3.point, newLocation };
                    }
                    return { intersects: false, point: ip, newLocation };
                }
            default:
                {
                    const result1 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[3]);
                    if (result1.intersects) {
                        newLocation = Location.left;
                        return { intersects: true, point: result1.point, newLocation };
                    }
                    const result2 = RectClip64.getSegmentIntersection(p, p2, rectPath[0], rectPath[1]);
                    if (result2.intersects) {
                        newLocation = Location.top;
                        return { intersects: true, point: result2.point, newLocation };
                    }
                    const result3 = RectClip64.getSegmentIntersection(p, p2, rectPath[1], rectPath[2]);
                    if (result3.intersects) {
                        newLocation = Location.right;
                        return { intersects: true, point: result3.point, newLocation };
                    }
                    const result4 = RectClip64.getSegmentIntersection(p, p2, rectPath[2], rectPath[3]);
                    if (result4.intersects) {
                        newLocation = Location.bottom;
                        return { intersects: true, point: result4.point, newLocation };
                    }
                    return { intersects: false, point: ip, newLocation };
                }
        }
    }
    getNextLocation(path, loc, i, highI) {
        let newI = i;
        let newLoc = loc;
        switch (loc) {
            case Location.left:
                while (newI <= highI && path[newI].x <= this.rect.left)
                    newI++;
                if (newI > highI)
                    break;
                if (path[newI].x >= this.rect.right)
                    newLoc = Location.right;
                else if (path[newI].y <= this.rect.top)
                    newLoc = Location.top;
                else if (path[newI].y >= this.rect.bottom)
                    newLoc = Location.bottom;
                else
                    newLoc = Location.inside;
                break;
            case Location.top:
                while (newI <= highI && path[newI].y <= this.rect.top)
                    newI++;
                if (newI > highI)
                    break;
                if (path[newI].y >= this.rect.bottom)
                    newLoc = Location.bottom;
                else if (path[newI].x <= this.rect.left)
                    newLoc = Location.left;
                else if (path[newI].x >= this.rect.right)
                    newLoc = Location.right;
                else
                    newLoc = Location.inside;
                break;
            case Location.right:
                while (newI <= highI && path[newI].x >= this.rect.right)
                    newI++;
                if (newI > highI)
                    break;
                if (path[newI].x <= this.rect.left)
                    newLoc = Location.left;
                else if (path[newI].y <= this.rect.top)
                    newLoc = Location.top;
                else if (path[newI].y >= this.rect.bottom)
                    newLoc = Location.bottom;
                else
                    newLoc = Location.inside;
                break;
            case Location.bottom:
                while (newI <= highI && path[newI].y >= this.rect.bottom)
                    newI++;
                if (newI > highI)
                    break;
                if (path[newI].y <= this.rect.top)
                    newLoc = Location.top;
                else if (path[newI].x <= this.rect.left)
                    newLoc = Location.left;
                else if (path[newI].x >= this.rect.right)
                    newLoc = Location.right;
                else
                    newLoc = Location.inside;
                break;
            case Location.inside:
                while (newI <= highI) {
                    if (path[newI].x < this.rect.left)
                        newLoc = Location.left;
                    else if (path[newI].x > this.rect.right)
                        newLoc = Location.right;
                    else if (path[newI].y > this.rect.bottom)
                        newLoc = Location.bottom;
                    else if (path[newI].y < this.rect.top)
                        newLoc = Location.top;
                    else {
                        this.add(path[newI]);
                        newI++;
                        continue;
                    }
                    break;
                }
                break;
        }
        return { location: newLoc, index: newI };
    }
    static startLocsAreClockwise(startLocs) {
        let result = 0;
        for (let i = 1; i < startLocs.length; i++) {
            const d = startLocs[i] - startLocs[i - 1];
            switch (d) {
                case -1:
                    result -= 1;
                    break;
                case 1:
                    result += 1;
                    break;
                case -3:
                    result += 1;
                    break;
                case 3:
                    result -= 1;
                    break;
            }
        }
        return result > 0;
    }
    executeInternal(path) {
        if (path.length < 3 || Rect64Utils.isEmpty(this.rect))
            return;
        const startLocs = [];
        let firstCross = Location.inside;
        let crossingLoc = firstCross;
        let prev = firstCross;
        const highI = path.length - 1;
        const lastLocResult = RectClip64.getLocation(this.rect, path[highI]);
        let loc = lastLocResult.location;
        if (lastLocResult.isOnRect) {
            let i = highI - 1;
            while (i >= 0) {
                const prevLocResult = RectClip64.getLocation(this.rect, path[i]);
                if (!prevLocResult.isOnRect) {
                    prev = prevLocResult.location;
                    break;
                }
                i--;
            }
            if (i < 0) {
                for (const pt of path) {
                    this.add(pt);
                }
                return;
            }
            if (prev === Location.inside)
                loc = Location.inside;
        }
        const startingLoc = loc;
        ///////////////////////////////////////////////////
        let i = 0;
        while (i <= highI) {
            prev = loc;
            const prevCrossLoc = crossingLoc;
            const nextLocResult = this.getNextLocation(path, loc, i, highI);
            loc = nextLocResult.location;
            i = nextLocResult.index;
            if (i > highI)
                break;
            const prevPt = (i === 0) ? path[highI] : path[i - 1];
            crossingLoc = loc;
            const intersectionResult = RectClip64.getIntersection(this.rectPath, path[i], prevPt, crossingLoc);
            if (!intersectionResult.intersects) {
                // ie remaining outside
                if (prevCrossLoc === Location.inside) {
                    const isClockw = RectClip64.isClockwise(prev, loc, prevPt, path[i], this.mp);
                    do {
                        startLocs.push(prev);
                        prev = RectClip64.getAdjacentLocation(prev, isClockw);
                    } while (prev !== loc);
                    crossingLoc = prevCrossLoc; // still not crossed
                }
                else if (prev !== Location.inside && prev !== loc) {
                    const isClockw = RectClip64.isClockwise(prev, loc, prevPt, path[i], this.mp);
                    do {
                        prev = this.addCornerWithDirection(prev, isClockw);
                    } while (prev !== loc);
                }
                ++i;
                continue;
            }
            const ip = intersectionResult.point;
            crossingLoc = intersectionResult.newLocation;
            ////////////////////////////////////////////////////
            // we must be crossing the rect boundary to get here
            ////////////////////////////////////////////////////
            if (loc === Location.inside) { // path must be entering rect
                if (firstCross === Location.inside) {
                    firstCross = crossingLoc;
                    startLocs.push(prev);
                }
                else if (prev !== crossingLoc) {
                    const isClockw = RectClip64.isClockwise(prev, crossingLoc, prevPt, path[i], this.mp);
                    do {
                        prev = this.addCornerWithDirection(prev, isClockw);
                    } while (prev !== crossingLoc);
                }
            }
            else if (prev !== Location.inside) {
                // passing right through rect. 'ip' here will be the second 
                // intersect pt but we'll also need the first intersect pt (ip2)
                loc = prev;
                const intersection2Result = RectClip64.getIntersection(this.rectPath, prevPt, path[i], loc);
                const ip2 = intersection2Result.point;
                if (prevCrossLoc !== Location.inside && prevCrossLoc !== loc) { //#597
                    this.addCorner(prevCrossLoc, loc);
                }
                if (firstCross === Location.inside) {
                    firstCross = loc;
                    startLocs.push(prev);
                }
                loc = crossingLoc;
                this.add(ip2);
                if (Point64Utils.equals(ip, ip2)) {
                    // it's very likely that path[i] is on rect
                    const pathLocResult = RectClip64.getLocation(this.rect, path[i]);
                    loc = pathLocResult.location;
                    this.addCorner(crossingLoc, loc);
                    crossingLoc = loc;
                    continue;
                }
            }
            else { // path must be exiting rect
                loc = crossingLoc;
                if (firstCross === Location.inside) {
                    firstCross = crossingLoc;
                }
            }
            this.add(ip);
        } //while i <= highI
        ///////////////////////////////////////////////////
        if (firstCross === Location.inside) {
            // path never intersects
            if (startingLoc === Location.inside)
                return;
            if (!Rect64Utils.containsRect(this.pathBounds, this.rect) ||
                !RectClip64.path1ContainsPath2(path, this.rectPath))
                return;
            const startLocsClockwise = RectClip64.startLocsAreClockwise(startLocs);
            for (let j = 0; j < 4; j++) {
                const k = startLocsClockwise ? j : 3 - j; // ie reverse result path
                this.add(this.rectPath[k]);
                RectClip64.addToEdge(this.edges[k * 2], this.results[0]);
            }
        }
        else if (loc !== Location.inside &&
            (loc !== firstCross || startLocs.length > 2)) {
            if (startLocs.length > 0) {
                prev = loc;
                for (const loc2 of startLocs) {
                    if (prev === loc2)
                        continue;
                    prev = this.addCornerWithDirection(prev, RectClip64.headingClockwise(prev, loc2));
                    prev = loc2;
                }
                loc = prev;
            }
            if (loc !== firstCross) {
                this.addCornerWithDirection(loc, RectClip64.headingClockwise(loc, firstCross));
            }
        }
    }
    execute(paths) {
        const result = [];
        if (Rect64Utils.isEmpty(this.rect))
            return result;
        for (const path of paths) {
            if (path.length < 3)
                continue;
            this.pathBounds = InternalClipper.getBounds(path);
            if (!Rect64Utils.intersects(this.rect, this.pathBounds)) {
                continue; // the path must be completely outside rect
            }
            if (Rect64Utils.containsRect(this.rect, this.pathBounds)) {
                // the path must be completely inside rect
                result.push(path);
                continue;
            }
            this.executeInternal(path);
            this.checkEdges();
            for (let i = 0; i < 4; ++i) {
                this.tidyEdgePair(i, this.edges[i * 2], this.edges[i * 2 + 1]);
            }
            for (const op of this.results) {
                const tmp = this.getPath(op);
                if (tmp.length > 0)
                    result.push(tmp);
            }
            //clean up after every loop
            this.results.length = 0;
            for (let i = 0; i < 8; i++) {
                this.edges[i].length = 0;
            }
        }
        return result;
    }
    checkEdges() {
        for (let i = 0; i < this.results.length; i++) {
            let op = this.results[i];
            let op2 = op;
            if (op === null)
                continue;
            do {
                if (InternalClipper.isCollinear(op2.prev.pt, op2.pt, op2.next.pt)) {
                    if (op2 === op) {
                        op2 = RectClip64.unlinkOpBack(op2);
                        if (op2 === null)
                            break;
                        op = op2.prev;
                    }
                    else {
                        op2 = RectClip64.unlinkOpBack(op2);
                        if (op2 === null)
                            break;
                    }
                }
                else {
                    op2 = op2.next;
                }
            } while (op2 !== op);
            if (op2 === null) {
                this.results[i] = null;
                continue;
            }
            this.results[i] = op2; // safety first
            let edgeSet1 = RectClip64.getEdgesForPt(op.prev.pt, this.rect);
            op2 = op;
            do {
                const edgeSet2 = RectClip64.getEdgesForPt(op2.pt, this.rect);
                if (edgeSet2 !== 0 && op2.edge === null) {
                    const combinedSet = (edgeSet1 & edgeSet2);
                    for (let j = 0; j < 4; ++j) {
                        if ((combinedSet & (1 << j)) === 0)
                            continue;
                        if (RectClip64.isHeadingClockwise(op2.prev.pt, op2.pt, j)) {
                            RectClip64.addToEdge(this.edges[j * 2], op2);
                        }
                        else {
                            RectClip64.addToEdge(this.edges[j * 2 + 1], op2);
                        }
                    }
                }
                edgeSet1 = edgeSet2;
                op2 = op2.next;
            } while (op2 !== op);
        }
    }
    tidyEdgePair(idx, cw, ccw) {
        if (ccw.length === 0)
            return;
        const isHorz = ((idx === 1) || (idx === 3));
        const cwIsTowardLarger = ((idx === 1) || (idx === 2));
        let i = 0, j = 0;
        while (i < cw.length) {
            let p1 = cw[i];
            if (p1 === null || p1.next === p1.prev) {
                cw[i++] = null;
                j = 0;
                continue;
            }
            const jLim = ccw.length;
            while (j < jLim && (ccw[j] === null || ccw[j].next === ccw[j].prev))
                ++j;
            if (j === jLim) {
                ++i;
                j = 0;
                continue;
            }
            let p2;
            let p1a;
            let p2a;
            if (cwIsTowardLarger) {
                // p1 >>>> p1a;
                // p2 <<<< p2a;
                p1 = cw[i].prev;
                p1a = cw[i];
                p2 = ccw[j];
                p2a = ccw[j].prev;
            }
            else {
                // p1 <<<< p1a;
                // p2 >>>> p2a;
                p1 = cw[i];
                p1a = cw[i].prev;
                p2 = ccw[j].prev;
                p2a = ccw[j];
            }
            if ((isHorz && !RectClip64.hasHorzOverlap(p1.pt, p1a.pt, p2.pt, p2a.pt)) ||
                (!isHorz && !RectClip64.hasVertOverlap(p1.pt, p1a.pt, p2.pt, p2a.pt))) {
                ++j;
                continue;
            }
            // to get here we're either splitting or rejoining
            const isRejoining = cw[i].ownerIdx !== ccw[j].ownerIdx;
            if (isRejoining) {
                this.results[p2.ownerIdx] = null;
                RectClip64.setNewOwner(p2, p1.ownerIdx);
            }
            // do the split or re-join
            if (cwIsTowardLarger) {
                // p1 >> | >> p1a;
                // p2 << | << p2a;
                p1.next = p2;
                p2.prev = p1;
                p1a.prev = p2a;
                p2a.next = p1a;
            }
            else {
                // p1 << | << p1a;
                // p2 >> | >> p2a;
                p1.prev = p2;
                p2.next = p1;
                p1a.next = p2a;
                p2a.prev = p1a;
            }
            if (!isRejoining) {
                const newIdx = this.results.length;
                this.results.push(p1a);
                RectClip64.setNewOwner(p1a, newIdx);
            }
            let op;
            let op2;
            if (cwIsTowardLarger) {
                op = p2;
                op2 = p1a;
            }
            else {
                op = p1;
                op2 = p2a;
            }
            this.results[op.ownerIdx] = op;
            this.results[op2.ownerIdx] = op2;
            // and now lots of work to get ready for the next loop
            let opIsLarger, op2IsLarger;
            if (isHorz) { // X
                opIsLarger = op.pt.x > op.prev.pt.x;
                op2IsLarger = op2.pt.x > op2.prev.pt.x;
            }
            else { // Y
                opIsLarger = op.pt.y > op.prev.pt.y;
                op2IsLarger = op2.pt.y > op2.prev.pt.y;
            }
            if ((op.next === op.prev) || Point64Utils.equals(op.pt, op.prev.pt)) {
                if (op2IsLarger === cwIsTowardLarger) {
                    cw[i] = op2;
                    ccw[j++] = null;
                }
                else {
                    ccw[j] = op2;
                    cw[i++] = null;
                }
            }
            else if ((op2.next === op2.prev) || Point64Utils.equals(op2.pt, op2.prev.pt)) {
                if (opIsLarger === cwIsTowardLarger) {
                    cw[i] = op;
                    ccw[j++] = null;
                }
                else {
                    ccw[j] = op;
                    cw[i++] = null;
                }
            }
            else if (opIsLarger === op2IsLarger) {
                if (opIsLarger === cwIsTowardLarger) {
                    cw[i] = op;
                    RectClip64.uncoupleEdge(op2);
                    RectClip64.addToEdge(cw, op2);
                    ccw[j++] = null;
                }
                else {
                    cw[i++] = null;
                    ccw[j] = op2;
                    RectClip64.uncoupleEdge(op);
                    RectClip64.addToEdge(ccw, op);
                    j = 0;
                }
            }
            else {
                if (opIsLarger === cwIsTowardLarger) {
                    cw[i] = op;
                }
                else {
                    ccw[j] = op;
                }
                if (op2IsLarger === cwIsTowardLarger) {
                    cw[i] = op2;
                }
                else {
                    ccw[j] = op2;
                }
            }
        }
    }
    getPath(op) {
        const result = [];
        if (op === null || op.prev === op.next)
            return result;
        let op2 = op.next;
        while (op2 !== null && op2 !== op) {
            if (InternalClipper.isCollinear(op2.prev.pt, op2.pt, op2.next.pt)) {
                op = op2.prev;
                op2 = RectClip64.unlinkOp(op2);
            }
            else {
                op2 = op2.next;
            }
        }
        if (op2 === null)
            return [];
        result.push(op.pt);
        op2 = op.next;
        while (op2 !== op) {
            result.push(op2.pt);
            op2 = op2.next;
        }
        return result;
    }
}
export class RectClipLines64 extends RectClip64 {
    constructor(rect) {
        super(rect);
    }
    execute(paths) {
        const result = [];
        if (Rect64Utils.isEmpty(this.rect))
            return result;
        for (const path of paths) {
            if (path.length < 2)
                continue;
            this.pathBounds = InternalClipper.getBounds(path);
            if (!Rect64Utils.intersects(this.rect, this.pathBounds)) {
                continue; // the path must be completely outside rect
            }
            // Apart from that, we can't be sure whether the path
            // is completely outside or completed inside or intersects
            // rect, simply by comparing path bounds with rect.
            this.executeInternalLines(path);
            for (const op of this.results) {
                const tmp = this.getPathLines(op);
                if (tmp.length > 0)
                    result.push(tmp);
            }
            //clean up after every loop
            this.results.length = 0;
            for (let i = 0; i < 8; i++) {
                this.edges[i].length = 0;
            }
        }
        return result;
    }
    getPathLines(op) {
        const result = [];
        if (op === null || op === op.next)
            return result;
        op = op.next; // starting at path beginning 
        result.push(op.pt);
        let op2 = op.next;
        while (op2 !== op) {
            result.push(op2.pt);
            op2 = op2.next;
        }
        return result;
    }
    executeInternalLines(path) {
        this.results.length = 0;
        if (path.length < 2 || Rect64Utils.isEmpty(this.rect))
            return;
        let prev = Location.inside;
        let i = 1;
        const highI = path.length - 1;
        const firstLocResult = RectClip64.getLocation(this.rect, path[0]);
        let loc = firstLocResult.location;
        if (firstLocResult.isOnRect) {
            while (i <= highI) {
                const prevLocResult = RectClip64.getLocation(this.rect, path[i]);
                if (!prevLocResult.isOnRect) {
                    prev = prevLocResult.location;
                    break;
                }
                i++;
            }
            if (i > highI) {
                for (const pt of path) {
                    this.add(pt);
                }
                return;
            }
            if (prev === Location.inside)
                loc = Location.inside;
            i = 1;
        }
        if (loc === Location.inside)
            this.add(path[0]);
        ///////////////////////////////////////////////////
        while (i <= highI) {
            prev = loc;
            const nextLocResult = this.getNextLocation(path, loc, i, highI);
            loc = nextLocResult.location;
            i = nextLocResult.index;
            if (i > highI)
                break;
            const prevPt = path[i - 1];
            let crossingLoc = loc;
            const intersectionResult = RectClip64.getIntersection(this.rectPath, path[i], prevPt, crossingLoc);
            if (!intersectionResult.intersects) {
                // ie remaining outside (& crossingLoc still == loc)
                ++i;
                continue;
            }
            const ip = intersectionResult.point;
            crossingLoc = intersectionResult.newLocation;
            ////////////////////////////////////////////////////
            // we must be crossing the rect boundary to get here
            ////////////////////////////////////////////////////
            if (loc === Location.inside) { // path must be entering rect
                this.add(ip, true);
            }
            else if (prev !== Location.inside) {
                // passing right through rect. 'ip' here will be the second 
                // intersect pt but we'll also need the first intersect pt (ip2)
                crossingLoc = prev;
                const intersection2Result = RectClip64.getIntersection(this.rectPath, prevPt, path[i], crossingLoc);
                const ip2 = intersection2Result.point;
                this.add(ip2, true);
                this.add(ip);
            }
            else { // path must be exiting rect
                this.add(ip);
            }
        } //while i <= highI
        ///////////////////////////////////////////////////
    }
}
//# sourceMappingURL=RectClip.js.map