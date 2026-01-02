/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  13 December 2025                                                *
* Release   :  BETA RELEASE                                                    *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Constrained Delaunay Triangulation                              *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { Paths64 } from './Core.js';
export declare enum TriangulateResult {
    success = 0,
    fail = 1,
    noPolygons = 2,
    pathsIntersect = 3
}
export declare class Delaunay {
    private readonly allVertices;
    private readonly allEdges;
    private readonly allTriangles;
    private readonly pendingDelaunayStack;
    private readonly horzEdgeStack;
    private readonly locMinStack;
    private readonly useDelaunay;
    private firstActive;
    private lowermostVertex;
    constructor(delaunay?: boolean);
    private addPath;
    private addPaths;
    private cleanUp;
    private fixupEdgeIntersects;
    private mergeDupOrCollinearVertices;
    private splitEdge;
    private removeIntersection;
    private createEdge;
    private createTriangle;
    private forceLegal;
    private createInnerLocMinLooseEdge;
    private horizontalBetween;
    private doTriangulateLeft;
    private doTriangulateRight;
    private addEdgeToActives;
    private removeEdgeFromActives;
    execute(paths: Paths64): {
        result: TriangulateResult;
        solution: Paths64;
    };
    private static isLooseEdge;
    private static isLeftEdge;
    private static isRightEdge;
    private static isHorizontal;
    private static leftTurning;
    private static rightTurning;
    private static edgeCompleted;
    private static edgeContains;
    private static getAngle;
    private static getLocMinAngle;
    private static removeEdgeFromVertex;
    private static findLocMinIdx;
    private static prev;
    private static next;
    private static findLinkingEdge;
    private static pathFromTriangle;
    private static inCircleTest;
    private static shortestDistFromSegment;
    private static segsIntersect;
    private static distSqr;
    private static distanceSqr;
}
//# sourceMappingURL=Triangulation.d.ts.map