/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  FAST rectangular clipping                                       *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { Point64, Path64, Paths64, Rect64 } from './Core.js';
export declare class OutPt2 {
    next: OutPt2 | null;
    prev: OutPt2 | null;
    pt: Point64;
    ownerIdx: number;
    edge: (OutPt2 | null)[] | null;
    constructor(pt: Point64);
}
declare enum Location {
    left = 0,
    top = 1,
    right = 2,
    bottom = 3,
    inside = 4
}
export declare class RectClip64 {
    protected readonly rect: Rect64;
    protected readonly mp: Point64;
    protected readonly rectPath: Path64;
    protected pathBounds: Rect64;
    protected results: (OutPt2 | null)[];
    protected edges: (OutPt2 | null)[][];
    protected currIdx: number;
    constructor(rect: Rect64);
    protected add(pt: Point64, startingNewPath?: boolean): OutPt2;
    private static path1ContainsPath2;
    private static isClockwise;
    private static areOpposites;
    private static headingClockwise;
    private static getAdjacentLocation;
    private static unlinkOp;
    private static unlinkOpBack;
    private static getEdgesForPt;
    private static isHeadingClockwise;
    private static hasHorzOverlap;
    private static hasVertOverlap;
    private static addToEdge;
    private static uncoupleEdge;
    private static setNewOwner;
    private addCorner;
    private addCornerWithDirection;
    protected static getLocation(rec: Rect64, pt: Point64): {
        location: Location;
        isOnRect: boolean;
    };
    private static isHorizontal;
    private static getSegmentIntersection;
    protected static getIntersection(rectPath: Path64, p: Point64, p2: Point64, loc: Location): {
        intersects: boolean;
        point: Point64;
        newLocation: Location;
    };
    protected getNextLocation(path: Path64, loc: Location, i: number, highI: number): {
        location: Location;
        index: number;
    };
    private static startLocsAreClockwise;
    private executeInternal;
    execute(paths: Paths64): Paths64;
    private checkEdges;
    private tidyEdgePair;
    private getPath;
}
export declare class RectClipLines64 extends RectClip64 {
    constructor(rect: Rect64);
    execute(paths: Paths64): Paths64;
    private getPathLines;
    private executeInternalLines;
}
export {};
//# sourceMappingURL=RectClip.d.ts.map