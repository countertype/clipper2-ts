/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  This is the main polygon clipping module                        *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/
import { Point64, Path64, PathD, Paths64, PathsD, Rect64, ClipType, PathType, FillRule, ZCallback64, ZCallbackD } from './Core.js';
export declare enum VertexFlags {
    None = 0,
    OpenStart = 1,
    OpenEnd = 2,
    LocalMax = 4,
    LocalMin = 8
}
declare class ScanlineHeap {
    private readonly data;
    push(value: number): void;
    pop(): number | null;
    clear(): void;
    private siftUp;
    private siftDown;
}
export declare class Vertex {
    readonly pt: Point64;
    next: Vertex | null;
    prev: Vertex | null;
    flags: VertexFlags;
    constructor(pt: Point64, flags: VertexFlags, prev: Vertex | null);
}
export declare class LocalMinima {
    readonly vertex: Vertex;
    readonly polytype: PathType;
    readonly isOpen: boolean;
    constructor(vertex: Vertex, polytype: PathType, isOpen?: boolean);
    equals(other: LocalMinima | null): boolean;
}
export declare function createLocalMinima(vertex: Vertex, polytype: PathType, isOpen?: boolean): LocalMinima;
export interface IntersectNode {
    readonly pt: Point64;
    readonly edge1: Active;
    readonly edge2: Active;
}
export declare function createIntersectNode(pt: Point64, edge1: Active, edge2: Active): IntersectNode;
export declare class OutPt {
    private static _nextId;
    readonly _debugId: number;
    pt: Point64;
    next: OutPt | null;
    prev: OutPt;
    outrec: OutRec;
    horz: HorzSegment | null;
    constructor(pt: Point64, outrec: OutRec);
}
export declare enum JoinWith {
    None = 0,
    Left = 1,
    Right = 2
}
export declare enum HorzPosition {
    Bottom = 0,
    Middle = 1,
    Top = 2
}
export declare class OutRec {
    private static _nextId;
    readonly _debugId: number;
    idx: number;
    owner: OutRec | null;
    frontEdge: Active | null;
    backEdge: Active | null;
    pts: OutPt | null;
    polypath: PolyPathBase | null;
    bounds: Rect64;
    path: Path64;
    isOpen: boolean;
    splits: number[] | null;
    recursiveSplit: OutRec | null;
    constructor();
}
export declare class HorzSegment {
    leftOp: OutPt | null;
    rightOp: OutPt | null;
    leftToRight: boolean;
    constructor(op: OutPt);
}
export declare class HorzJoin {
    op1: OutPt | null;
    op2: OutPt | null;
    constructor(ltor: OutPt, rtol: OutPt);
}
export declare class Active {
    bot: Point64;
    top: Point64;
    curX: number;
    dx: number;
    windDx: number;
    windCount: number;
    windCount2: number;
    outrec: OutRec | null;
    prevInAEL: Active | null;
    nextInAEL: Active | null;
    prevInSEL: Active | null;
    nextInSEL: Active | null;
    jump: Active | null;
    vertexTop: Vertex | null;
    localMin: LocalMinima | null;
    isLeftBound: boolean;
    joinWith: JoinWith;
}
export declare namespace ClipperEngine {
    function addLocMin(vert: Vertex, polytype: PathType, isOpen: boolean, minimaList: LocalMinima[]): void;
    function addPathsToVertexList(paths: Paths64, polytype: PathType, isOpen: boolean, minimaList: LocalMinima[], vertexList: Vertex[]): void;
}
export declare class ReuseableDataContainer64 {
    private readonly minimaList;
    private readonly vertexList;
    constructor();
    clear(): void;
    addPaths(paths: Paths64, pt: PathType, isOpen: boolean): void;
}
export declare abstract class PolyPathBase {
    protected parent: PolyPathBase | null;
    protected children: PolyPathBase[];
    constructor(parent?: PolyPathBase | null);
    get isHole(): boolean;
    private getLevel;
    get level(): number;
    private getIsHole;
    get count(): number;
    abstract addChild(p: Path64): PolyPathBase;
    clear(): void;
    protected toStringInternal(idx: number, level: number): string;
    toString(): string;
}
export declare class PolyPath64 extends PolyPathBase {
    polygon: Path64 | null;
    constructor(parent?: PolyPathBase | null);
    get poly(): Path64 | null;
    addChild(p: Path64): PolyPathBase;
    child(index: number): PolyPath64;
    area(): number;
}
export declare class PolyPathD extends PolyPathBase {
    scale: number;
    private polygon;
    constructor(parent?: PolyPathBase | null);
    get poly(): PathD | null;
    addChild(p: Path64): PolyPathBase;
    addChildD(p: PathD): PolyPathBase;
    child(index: number): PolyPathD;
    area(): number;
}
export declare class PolyTree64 extends PolyPath64 {
}
export declare class PolyTreeD extends PolyPathD {
    get scaleValue(): number;
}
export declare class ClipperBase {
    private static openPathsEnabled;
    protected cliptype: ClipType;
    protected fillrule: FillRule;
    protected actives: Active | null;
    protected sel: Active | null;
    protected readonly minimaList: LocalMinima[];
    protected readonly intersectList: IntersectNode[];
    protected readonly vertexList: Vertex[];
    protected readonly outrecList: OutRec[];
    protected readonly scanlineHeap: ScanlineHeap;
    protected readonly scanlineSet: Set<number>;
    protected readonly scanlineArr: number[];
    protected useScanlineArray: boolean;
    protected readonly horzSegList: HorzSegment[];
    protected readonly horzJoinList: HorzJoin[];
    protected currentLocMin: number;
    protected currentBotY: number;
    protected isSortedMinimaList: boolean;
    protected hasOpenPaths: boolean;
    protected usingPolytree: boolean;
    protected succeeded: boolean;
    protected zCallbackInternal: ZCallback64 | ZCallbackD | undefined;
    preserveCollinear: boolean;
    reverseSolution: boolean;
    constructor();
    protected getZCallback(): ZCallback64 | ZCallbackD | undefined;
    private xyEqual;
    private setZ;
    private static isOdd;
    private static isHotEdge;
    private static isOpen;
    private static isOpenEnd;
    private static isOpenEndVertex;
    private static getPrevHotEdge;
    private static isFront;
    /*******************************************************************************
    *  Dx:                             0(90deg)                                    *
    *                                  |                                           *
    *               +inf (180deg) <--- o ---> -inf (0deg)                          *
    *******************************************************************************/
    private static getDx;
    private static topX;
    private static isHorizontal;
    private static isHeadingRightHorz;
    private static isHeadingLeftHorz;
    private static swapActives;
    private static getPolyType;
    private static isSamePolyType;
    private static setDx;
    private static nextVertex;
    private static prevPrevVertex;
    private static isMaxima;
    private static getMaximaPair;
    private boundingBoxesOverlap;
    protected clearSolutionOnly(): void;
    clear(): void;
    protected reset(): void;
    private upgradeScanlineStructureFromArray;
    private insertScanline;
    private popScanline;
    private hasLocMinAtY;
    private popLocalMinima;
    protected addPath(path: Path64, polytype: PathType, isOpen?: boolean): void;
    protected addPaths(paths: Paths64, polytype: PathType, isOpen?: boolean): void;
    protected addReuseableData(reuseableData: ReuseableDataContainer64): void;
    private deleteFromAEL;
    getBounds(): Rect64;
    protected executeInternal(ct: ClipType, fillRule: FillRule): void;
    private insertLocalMinimaIntoAEL;
    private pushHorz;
    private popHorz;
    private doHorizontal;
    private doHorizontalClosed;
    private convertHorzSegsToJoins;
    private updateHorzSegment;
    private setHorzSegHeadingForward;
    private horzSegSort;
    protected duplicateOp(op: OutPt, insertAfter: boolean): OutPt;
    protected getRealOutRec(outRec: OutRec | null): OutRec | null;
    private doIntersections;
    private doTopOfScanbeam;
    private processHorzJoins;
    private fixOutRecPts;
    protected path1InsidePath2(op1: OutPt, op2: OutPt): boolean;
    private pointInOpPolygon;
    private getCleanPath;
    private moveSplits;
    private buildIntersectList;
    private processIntersectList;
    private edgesAdjacentInAEL;
    private adjustCurrXAndCopyToSEL;
    private doMaxima;
    private updateEdgeIntoAEL;
    private trimHorz;
    private addToHorzSegList;
    private addNewIntersectNode;
    private extractFromSEL;
    private insert1Before2InSEL;
    private getCurrYMaximaVertexOpen;
    private getCurrYMaximaVertex;
    private resetHorzDirection;
    private getLastOp;
    private insertLeftEdge;
    private insertRightEdge;
    private setWindCountForOpenPathEdge;
    private setWindCountForClosedPathEdge;
    private isContributingOpen;
    private isContributingClosed;
    private addLocalMinPoly;
    private outrecIsAscending;
    protected newOutRec(): OutRec;
    private startOpenPath;
    private checkJoinLeft;
    private checkJoinRight;
    private perpendicDistFromLineSqrdGreaterThanQuarter;
    private intersectEdges;
    private swapPositionsInAEL;
    private isValidAelOrder;
    private isJoined;
    private split;
    private setSides;
    private findEdgeWithMatchingLocMin;
    private addOutPt;
    private addLocalMaxPoly;
    private swapFrontBackSides;
    private setOwner;
    private uncoupleOutRec;
    private joinOutrecPaths;
    private swapOutrecs;
    private disposeIntersectNodes;
    private static ptsReallyClose;
    private static isVerySmallTriangle;
    protected static buildPath(op: OutPt | null, reverse: boolean, isOpen: boolean, path: Path64): boolean;
    protected buildPaths(solutionClosed: Paths64, solutionOpen: Paths64): boolean;
    protected buildTree(polytree: PolyPathBase, solutionOpen: Paths64): void;
    protected checkBounds(outrec: OutRec): boolean;
    protected recursiveCheckOwners(outrec: OutRec, polypath: PolyPathBase): void;
    protected cleanCollinear(outrec: OutRec | null): void;
    private isValidClosedPath;
    private disposeOutPt;
    private fixSelfIntersects;
    private doSplitOp;
    private static areaOutPt;
    private areaTriangle;
    private isValidOwner;
    private containsRect;
    private checkSplitOwner;
}
export declare class Clipper64 extends ClipperBase {
    zCallback?: ZCallback64;
    protected getZCallback(): ZCallback64 | undefined;
    addPath(path: Path64, polytype: PathType, isOpen?: boolean): void;
    addReuseableData(reuseableData: ReuseableDataContainer64): void;
    addPaths(paths: Paths64, polytype: PathType, isOpen?: boolean): void;
    addSubject(paths: Paths64): void;
    addOpenSubject(paths: Paths64): void;
    addClip(paths: Paths64): void;
    execute(clipType: ClipType, fillRule: FillRule, solutionClosed: Paths64, solutionOpen?: Paths64): boolean;
    execute(clipType: ClipType, fillRule: FillRule, polytree: PolyTree64, openPaths?: Paths64): boolean;
}
export declare class ClipperD extends ClipperBase {
    zCallback?: ZCallbackD;
    private readonly scale;
    private readonly invScale;
    constructor(roundingDecimalPrecision?: number);
    protected getZCallback(): ZCallbackD | undefined;
    private scalePathDFromInt;
    buildPathsD(solutionClosed: PathsD, solutionOpen: PathsD): boolean;
    buildTreeD(polytree: PolyPathBase, solutionOpen: PathsD): void;
    addPath(path: PathD, polytype: PathType, isOpen?: boolean): void;
    addPaths(paths: PathsD, polytype: PathType, isOpen?: boolean): void;
    addSubject(path: PathD): void;
    addOpenSubject(path: PathD): void;
    addClip(path: PathD): void;
    addSubjectPaths(paths: PathsD): void;
    addOpenSubjectPaths(paths: PathsD): void;
    addClipPaths(paths: PathsD): void;
    execute(clipType: ClipType, fillRule: FillRule, solutionClosed: PathsD, solutionOpen?: PathsD): boolean;
    execute(clipType: ClipType, fillRule: FillRule, polytree: PolyTreeD, openPaths?: PathsD): boolean;
}
export declare namespace Clipper {
    function area(path: Path64): number;
    function areaD(path: PathD): number;
    function scalePath64(path: PathD, scale: number): Path64;
    function scalePaths64(paths: PathsD, scale: number): Paths64;
    function scalePathD(path: Path64, scale: number): PathD;
    function scalePathsD(paths: Paths64, scale: number): PathsD;
}
export {};
//# sourceMappingURL=Engine.d.ts.map