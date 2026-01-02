/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Path Offset (Inflate/Shrink)                                    *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { Point64, PointD, Path64, PathD, Paths64 } from './Core.js';
import { PolyTree64 } from './Engine.js';
export declare enum JoinType {
    Miter = 0,
    Square = 1,
    Bevel = 2,
    Round = 3
}
export declare enum EndType {
    Polygon = 0,
    Joined = 1,
    Butt = 2,
    Square = 3,
    Round = 4
}
export declare class ClipperOffset {
    private static readonly Tolerance;
    private static readonly arc_const;
    private readonly groupList;
    private pathOut;
    private readonly normals;
    private solution;
    private solutionTree;
    private groupDelta;
    private delta;
    private mitLimSqr;
    private stepsPerRad;
    private stepSin;
    private stepCos;
    private joinType;
    private endType;
    arcTolerance: number;
    mergeGroups: boolean;
    miterLimit: number;
    preserveCollinear: boolean;
    reverseSolution: boolean;
    zCallback?: (bot1: Point64, top1: Point64, bot2: Point64, top2: Point64, intersectPt: Point64) => void;
    deltaCallback: ((path: Path64, pathNorms: PathD, currPt: number, prevPt: number) => number) | null;
    constructor(miterLimit?: number, arcTolerance?: number, preserveCollinear?: boolean, reverseSolution?: boolean);
    clear(): void;
    private ZCB;
    addPath(path: Path64, joinType: JoinType, endType: EndType): void;
    addPaths(paths: Paths64, joinType: JoinType, endType: EndType): void;
    private calcSolutionCapacity;
    private checkPathsReversed;
    private executeInternal;
    execute(delta: number, solution: Paths64): void;
    execute(delta: number, solutionTree: PolyTree64): void;
    executeWithCallback(deltaCallback: (path: Path64, pathNorms: PathD, currPt: number, prevPt: number) => number, solution: Paths64): void;
    static getUnitNormal(pt1: Point64, pt2: Point64): PointD;
    static getLowestPathInfo(paths: Paths64): {
        idx: number;
        isNegArea: boolean;
    };
    private static translatePoint;
    private static reflectPoint;
    private static almostZero;
    private static hypotenuse;
    private static normalizeVector;
    private static getAvgUnitVector;
    private static intersectPoint;
    private getPerpendic;
    private getPerpendicD;
    private doBevel;
    private doSquare;
    private doMiter;
    private doRound;
    private buildNormals;
    private offsetPoint;
    private offsetPolygon;
    private offsetOpenJoined;
    private offsetOpenPath;
    private doGroupOffset;
    static stripDuplicates(path: Path64, isClosedPath: boolean): Path64;
    static area(path: Path64): number;
    static sqr(val: number): number;
    static ellipse(center: Point64, radiusX: number, radiusY?: number, steps?: number): Path64;
}
//# sourceMappingURL=Offset.d.ts.map