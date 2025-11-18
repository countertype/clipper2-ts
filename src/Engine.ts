/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  This is the main polygon clipping module                        *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import {
    Point64, PointD, Path64, PathD, Paths64, PathsD, Rect64, RectD,
    ClipType, PathType, FillRule, PointInPolygonResult,
    InternalClipper, Point64Utils, Rect64Utils, PointDUtils, RectDUtils
  } from './Core.js';
  
  // Vertex: a pre-clipping data structure. It is used to separate polygons
  // into ascending and descending 'bounds' (or sides) that start at local
  // minima and ascend to a local maxima, before descending again.
  export enum VertexFlags {
    None = 0,
    OpenStart = 1,
    OpenEnd = 2,
    LocalMax = 4,
    LocalMin = 8
  }
  
// C# keeps scanlines in a sorted list; here we use a heap to avoid O(n) splices.
class ScanlineHeap {
  private readonly data: number[] = [];

  push(value: number): void {
    this.data.push(value);
    this.siftUp(this.data.length - 1);
  }

  pop(): number | null {
    if (this.data.length === 0) return null;
    const max = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return max;
  }

  clear(): void {
    this.data.length = 0;
  }

  private siftUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.data[parent] >= this.data[index]) break;
      [this.data[parent], this.data[index]] = [this.data[index], this.data[parent]];
      index = parent;
    }
  }

  private siftDown(index: number): void {
    const length = this.data.length;
    while (true) {
      let largest = index;
      const left = (index << 1) + 1;
      const right = left + 1;

      if (left < length && this.data[left] > this.data[largest]) largest = left;
      if (right < length && this.data[right] > this.data[largest]) largest = right;
      if (largest === index) break;
      [this.data[index], this.data[largest]] = [this.data[largest], this.data[index]];
      index = largest;
    }
  }
}

export class Vertex {
    public readonly pt: Point64;
    public next: Vertex | null = null;
    public prev: Vertex | null = null;
    public flags: VertexFlags;
  
    constructor(pt: Point64, flags: VertexFlags, prev: Vertex | null) {
      this.pt = pt;
      this.flags = flags;
      this.prev = prev;
    }
  }
  
  export class LocalMinima {
    public readonly vertex: Vertex;
    public readonly polytype: PathType;
    public readonly isOpen: boolean;

    constructor(vertex: Vertex, polytype: PathType, isOpen: boolean = false) {
      this.vertex = vertex;
      this.polytype = polytype;
      this.isOpen = isOpen;
    }

    equals(other: LocalMinima | null): boolean {
      return other !== null && this.vertex === other.vertex;
    }
  }
  
  // deprecated: kept for backward compatibility, use new LocalMinima() directly
  // (no longer used internally for performance)
  export function createLocalMinima(vertex: Vertex, polytype: PathType, isOpen: boolean = false): LocalMinima {
    return new LocalMinima(vertex, polytype, isOpen);
  }
  
  // IntersectNode: a structure representing 2 intersecting edges.
  // Intersections must be sorted so they are processed from the largest
  // Y coordinates to the smallest while keeping edges adjacent.
  export interface IntersectNode {
    readonly pt: Point64;
    readonly edge1: Active;
    readonly edge2: Active;
  }
  
  export function createIntersectNode(pt: Point64, edge1: Active, edge2: Active): IntersectNode {
    // Create a copy of pt to avoid reference sharing (C# uses struct which copies by value)
    return { pt: { x: pt.x, y: pt.y }, edge1, edge2 };
  }
  
  // OutPt: vertex data structure for clipping solutions
  export class OutPt {
    private static _nextId = 1;
    public readonly _debugId: number;
    public pt: Point64;
    public next: OutPt | null;
    public prev: OutPt;
    public outrec: OutRec;
    public horz: HorzSegment | null;
  
    constructor(pt: Point64, outrec: OutRec) {
      this._debugId = OutPt._nextId++;
      this.pt = pt;
      this.outrec = outrec;
      this.next = this;
      this.prev = this;
      this.horz = null;
    }
  }
  
  export enum JoinWith { None, Left, Right }
  export enum HorzPosition { Bottom, Middle, Top }
  
  // OutRec: path data structure for clipping solutions
  export class OutRec {
    private static _nextId = 1;
    public readonly _debugId: number;
    public idx: number = 0;
    public owner: OutRec | null = null;
    public frontEdge: Active | null = null;
    public backEdge: Active | null = null;
    public pts: OutPt | null = null;
    public polypath: PolyPathBase | null = null;
    public bounds: Rect64 = { left: 0, top: 0, right: 0, bottom: 0 };
    public path: Path64 = [];
    public isOpen: boolean = false;
    public splits: number[] | null = null;
    public recursiveSplit: OutRec | null = null;

    constructor() {
      this._debugId = OutRec._nextId++;
    }
  }
  
  export class HorzSegment {
    public leftOp: OutPt | null;
    public rightOp: OutPt | null;
    public leftToRight: boolean;
  
    constructor(op: OutPt) {
      this.leftOp = op;
      this.rightOp = null;
      this.leftToRight = true;
    }
  }
  
  export class HorzJoin {
    public op1: OutPt | null;
    public op2: OutPt | null;
  
    constructor(ltor: OutPt, rtol: OutPt) {
      this.op1 = ltor;
      this.op2 = rtol;
    }
  }
  
  ///////////////////////////////////////////////////////////////////
  // Important: UP and DOWN here are premised on Y-axis positive down
  // displays, which is the orientation used in Clipper's development.
  ///////////////////////////////////////////////////////////////////
  
  export class Active {
    public bot: Point64 = { x: 0, y: 0 };
    public top: Point64 = { x: 0, y: 0 };
    public curX: number = 0; // current (updated at every new scanline) - keep as number but ensure integer precision
    public dx: number = 0;
    public windDx: number = 0; // 1 or -1 depending on winding direction
    public windCount: number = 0;
    public windCount2: number = 0; // winding count of the opposite polytype
    public outrec: OutRec | null = null;
  
    // AEL: 'active edge list' (Vatti's AET - active edge table)
    //     a linked list of all edges (from left to right) that are present
    //     (or 'active') within the current scanbeam (a horizontal 'beam' that
    //     sweeps from bottom to top over the paths in the clipping operation).
    public prevInAEL: Active | null = null;
    public nextInAEL: Active | null = null;
  
    // SEL: 'sorted edge list' (Vatti's ST - sorted table)
    //     linked list used when sorting edges into their new positions at the
    //     top of scanbeams, but also (re)used to process horizontals.
    public prevInSEL: Active | null = null;
    public nextInSEL: Active | null = null;
    public jump: Active | null = null;
    public vertexTop: Vertex | null = null;
    public localMin: LocalMinima | null = null; // the bottom of an edge 'bound' (also Vatti)
    public isLeftBound: boolean = false;
    public joinWith: JoinWith = JoinWith.None;
  }
  
  export namespace ClipperEngine {
    export function addLocMin(vert: Vertex, polytype: PathType, isOpen: boolean, minimaList: LocalMinima[]): void {
      // make sure the vertex is added only once ...
      if ((vert.flags & VertexFlags.LocalMin) !== VertexFlags.None) return;
      vert.flags |= VertexFlags.LocalMin;
  
      const lm = new LocalMinima(vert, polytype, isOpen);
      minimaList.push(lm);
    }
  
    export function addPathsToVertexList(
      paths: Paths64, 
      polytype: PathType, 
      isOpen: boolean,
      minimaList: LocalMinima[], 
      vertexList: Vertex[]
    ): void {
      for (const path of paths) {
        let v0: Vertex | null = null;
        let prevV: Vertex | null = null;
        
        for (const pt of path) {
          if (v0 === null) {
            v0 = new Vertex(pt, VertexFlags.None, null);
            vertexList.push(v0);
            prevV = v0;
          } else if (!(prevV!.pt.x === pt.x && prevV!.pt.y === pt.y)) { // ie skips duplicates
            const currV: Vertex = new Vertex(pt, VertexFlags.None, prevV);
            vertexList.push(currV);
            prevV!.next = currV;
            prevV = currV;
          }
        }
        
        if (prevV?.prev === null) continue;
        if (!isOpen && prevV!.pt.x === v0!.pt.x && prevV!.pt.y === v0!.pt.y) prevV = prevV!.prev;
        prevV!.next = v0;
        v0!.prev = prevV;
        if (!isOpen && prevV!.next === prevV) continue;
  
        // OK, we have a valid path
        let goingUp: boolean;
        if (isOpen) {
          let currV = v0!.next;
          while (currV !== v0 && currV!.pt.y === v0!.pt.y)
            currV = currV!.next;
          goingUp = currV!.pt.y <= v0!.pt.y;
          if (goingUp) {
            v0!.flags = VertexFlags.OpenStart;
            addLocMin(v0!, polytype, true, minimaList);
          } else {
            v0!.flags = VertexFlags.OpenStart | VertexFlags.LocalMax;
          }
        } else { // closed path
          prevV = v0!.prev;
          while (prevV !== v0 && prevV!.pt.y === v0!.pt.y)
            prevV = prevV!.prev;
          if (prevV === v0)
            continue; // only open paths can be completely flat
          goingUp = prevV!.pt.y > v0!.pt.y;
        }
  
        const goingUp0 = goingUp;
        prevV = v0;
        let currV = v0!.next;
        while (currV !== v0) {
          if (currV!.pt.y > prevV!.pt.y && goingUp) {
            prevV!.flags |= VertexFlags.LocalMax;
            goingUp = false;
          } else if (currV!.pt.y < prevV!.pt.y && !goingUp) {
            goingUp = true;
            addLocMin(prevV!, polytype, isOpen, minimaList);
          }
          prevV = currV;
          currV = currV!.next;
        }
  
        if (isOpen) {
          prevV!.flags |= VertexFlags.OpenEnd;
          if (goingUp)
            prevV!.flags |= VertexFlags.LocalMax;
          else
            addLocMin(prevV!, polytype, isOpen, minimaList);
        } else if (goingUp !== goingUp0) {
          if (goingUp0) addLocMin(prevV!, polytype, false, minimaList);
          else prevV!.flags |= VertexFlags.LocalMax;
        }
      }
    }
  }
  
  export class ReuseableDataContainer64 {
    private readonly minimaList: LocalMinima[];
    private readonly vertexList: Vertex[];
  
    constructor() {
      this.minimaList = [];
      this.vertexList = [];
    }
  
    public clear(): void {
      this.minimaList.length = 0;
      this.vertexList.length = 0;
    }
  
    public addPaths(paths: Paths64, pt: PathType, isOpen: boolean): void {
      ClipperEngine.addPathsToVertexList(paths, pt, isOpen, this.minimaList, this.vertexList);
    }
  }
  
  export abstract class PolyPathBase {
    protected parent: PolyPathBase | null;
    protected children: PolyPathBase[] = [];
  
    constructor(parent: PolyPathBase | null = null) {
      this.parent = parent;
    }
  
    public get isHole(): boolean {
      return this.getIsHole();
    }
  
    private getLevel(): number {
      let result = 0;
      let pp = this.parent;
      while (pp !== null) {
        ++result;
        pp = pp.parent;
      }
      return result;
    }
  
    public get level(): number {
      return this.getLevel();
    }
  
    private getIsHole(): boolean {
      const lvl = this.getLevel();
      return lvl !== 0 && (lvl & 1) === 0;
    }
  
    public get count(): number {
      return this.children.length;
    }
  
    public abstract addChild(p: Path64): PolyPathBase;
  
    public clear(): void {
      this.children.length = 0;
    }
  
    protected toStringInternal(idx: number, level: number): string {
      let result = "";
      const padding = "  ".repeat(level);
      const plural = this.children.length === 1 ? "" : "s";
      
      if ((level & 1) === 0) {
        result += `${padding}+- hole (${idx}) contains ${this.children.length} nested polygon${plural}.\n`;
      } else {
        result += `${padding}+- polygon (${idx}) contains ${this.children.length} hole${plural}.\n`;
      }
      
      for (let i = 0; i < this.count; i++) {
        if (this.children[i].count > 0) {
          result += this.children[i].toStringInternal(i, level + 1);
        }
      }
      return result;
    }
  
    public toString(): string {
      if (this.level > 0) return ""; // only accept tree root
      const plural = this.children.length === 1 ? "" : "s";
      let result = `Polytree with ${this.children.length} polygon${plural}.\n`;
      for (let i = 0; i < this.count; i++) {
        if (this.children[i].count > 0) {
          result += this.children[i].toStringInternal(i, 1);
        }
      }
      return result + '\n';
    }
  }
  
  export class PolyPath64 extends PolyPathBase {
    public polygon: Path64 | null = null; // polytree root's polygon == null
  
    constructor(parent: PolyPathBase | null = null) {
      super(parent);
    }
  
    public get poly(): Path64 | null {
      return this.polygon;
    }
  
    public addChild(p: Path64): PolyPathBase {
      const newChild = new PolyPath64(this);
      newChild.polygon = p;
      this.children.push(newChild);
      return newChild;
    }
  
    public child(index: number): PolyPath64 {
      if (index < 0 || index >= this.children.length) {
        throw new Error("Index out of range");
      }
      return this.children[index] as PolyPath64;
    }
  
    public area(): number {
      let result = this.polygon === null ? 0 : Clipper.area(this.polygon);
      for (const child of this.children) {
        result += (child as PolyPath64).area();
      }
      return result;
    }
  }
  
  export class PolyPathD extends PolyPathBase {
    public scale: number = 1.0;
    private polygon: PathD | null = null;
  
    constructor(parent: PolyPathBase | null = null) {
      super(parent);
    }
  
    public get poly(): PathD | null {
      return this.polygon;
    }
  
    public addChild(p: Path64): PolyPathBase {
      const newChild = new PolyPathD(this);
      newChild.scale = this.scale;
      newChild.polygon = Clipper.scalePathD(p, 1 / this.scale);
      this.children.push(newChild);
      return newChild;
    }
  
    public addChildD(p: PathD): PolyPathBase {
      const newChild = new PolyPathD(this);
      newChild.scale = this.scale;
      newChild.polygon = p;
      this.children.push(newChild);
      return newChild;
    }
  
    public child(index: number): PolyPathD {
      if (index < 0 || index >= this.children.length) {
        throw new Error("Index out of range");
      }
      return this.children[index] as PolyPathD;
    }
  
    public area(): number {
      let result = this.polygon === null ? 0 : Clipper.areaD(this.polygon);
      for (const child of this.children) {
        result += (child as PolyPathD).area();
      }
      return result;
    }
  }
  
  export class PolyTree64 extends PolyPath64 {}
  
  export class PolyTreeD extends PolyPathD {
    public get scaleValue(): number {
      return this.scale;
    }
  }
  
  export class ClipperBase {
    protected cliptype: ClipType = ClipType.NoClip;
    protected fillrule: FillRule = FillRule.EvenOdd;
    protected actives: Active | null = null;
    protected sel: Active | null = null;
    protected readonly minimaList: LocalMinima[] = [];
    protected readonly intersectList: IntersectNode[] = [];
    protected readonly vertexList: Vertex[] = [];
    protected readonly outrecList: OutRec[] = [];
    protected readonly scanlineHeap = new ScanlineHeap();
    protected readonly scanlineSet = new Set<number>();
    protected readonly horzSegList: HorzSegment[] = [];
    protected readonly horzJoinList: HorzJoin[] = [];
    protected currentLocMin: number = 0;
    protected currentBotY: number = 0;
    protected isSortedMinimaList: boolean = false;
    protected hasOpenPaths: boolean = false;
    protected usingPolytree: boolean = false;
    protected succeeded: boolean = false;

    public preserveCollinear: boolean = true;
    public reverseSolution: boolean = false;

    constructor() {}
  
    // Helper functions
    private static isOdd(val: number): boolean {
      return (val & 1) !== 0;
    }
  
  private static isHotEdge(ae: Active): boolean {
    return ae.outrec != null;
  }
  
    private static isOpen(ae: Active): boolean {
      return ae.localMin!.isOpen;
    }
  
    private static isOpenEnd(ae: Active): boolean {
      return ae.localMin!.isOpen && ClipperBase.isOpenEndVertex(ae.vertexTop!);
    }
  
    private static isOpenEndVertex(v: Vertex): boolean {
      return (v.flags & (VertexFlags.OpenStart | VertexFlags.OpenEnd)) !== VertexFlags.None;
    }
  
    private static getPrevHotEdge(ae: Active): Active | null {
      let prev = ae.prevInAEL;
      while (prev !== null && (ClipperBase.isOpen(prev) || !ClipperBase.isHotEdge(prev))) {
        prev = prev.prevInAEL;
      }
      return prev;
    }
  
  private static isFront(ae: Active): boolean {
    return ae === ae.outrec!.frontEdge;
  }
  
    /*******************************************************************************
    *  Dx:                             0(90deg)                                    *
    *                                  |                                           *
    *               +inf (180deg) <--- o ---> -inf (0deg)                          *
    *******************************************************************************/
  
    private static getDx(pt1: Point64, pt2: Point64): number {
      const dy = pt2.y - pt1.y;
      if (dy !== 0) {
        return (pt2.x - pt1.x) / dy;
      }
      return pt2.x > pt1.x ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    }
  
  private static topX(ae: Active, currentY: number): number {
    if ((currentY === ae.top.y) || (ae.top.x === ae.bot.x)) return ae.top.x;
    if (currentY === ae.bot.y) return ae.bot.x;

    // use MidpointRounding.ToEven in order to explicitly match the nearbyint behaviour on the C++ side
    return InternalClipper.roundToEven(ae.bot.x + ae.dx * (currentY - ae.bot.y));
  }
  
    private static isHorizontal(ae: Active): boolean {
      return ae.top.y === ae.bot.y;
    }
  
    private static isHeadingRightHorz(ae: Active): boolean {
      return ae.dx === Number.NEGATIVE_INFINITY;
    }
  
    private static isHeadingLeftHorz(ae: Active): boolean {
      return ae.dx === Number.POSITIVE_INFINITY;
    }
  
    private static swapActives(ae1: Active, ae2: Active): [Active, Active] {
      return [ae2, ae1];
    }
  
    private static getPolyType(ae: Active): PathType {
      return ae.localMin!.polytype;
    }
  
    private static isSamePolyType(ae1: Active, ae2: Active): boolean {
      return ae1.localMin!.polytype === ae2.localMin!.polytype;
    }
  
    private static setDx(ae: Active): void {
      ae.dx = ClipperBase.getDx(ae.bot, ae.top);
    }
  
    private static nextVertex(ae: Active): Vertex {
      return ae.windDx > 0 ? ae.vertexTop!.next! : ae.vertexTop!.prev!;
    }
  
    private static prevPrevVertex(ae: Active): Vertex {
      return ae.windDx > 0 ? ae.vertexTop!.prev!.prev! : ae.vertexTop!.next!.next!;
    }
  
    private static isMaxima(vertex: Vertex): boolean;
    private static isMaxima(ae: Active): boolean;
    private static isMaxima(vertexOrAe: Vertex | Active): boolean {
      if ('flags' in vertexOrAe) {
        // It's a Vertex
        return (vertexOrAe.flags & VertexFlags.LocalMax) !== VertexFlags.None;
      } else {
        // It's an Active
        return ClipperBase.isMaxima(vertexOrAe.vertexTop!);
      }
    }
  
    private static getMaximaPair(ae: Active): Active | null {
      let ae2 = ae.nextInAEL;
      while (ae2 !== null) {
        if (ae2.vertexTop === ae.vertexTop) return ae2; // Found!
        ae2 = ae2.nextInAEL;
      }
      return null;
    }

    // optimization (not in C# reference): fast bounding box overlap check for segment intersection
    private boundingBoxesOverlap(p1: Point64, p2: Point64, p3: Point64, p4: Point64): boolean {
      // segment 1: p1-p2, segment 2: p3-p4
      const min1x = Math.min(p1.x, p2.x);
      const max1x = Math.max(p1.x, p2.x);
      const min1y = Math.min(p1.y, p2.y);
      const max1y = Math.max(p1.y, p2.y);
      
      const min2x = Math.min(p3.x, p4.x);
      const max2x = Math.max(p3.x, p4.x);
      const min2y = Math.min(p3.y, p4.y);
      const max2y = Math.max(p3.y, p4.y);
      
      return !(max1x < min2x || max2x < min1x || max1y < min2y || max2y < min1y);
    }

    protected clearSolutionOnly(): void {
      while (this.actives !== null) this.deleteFromAEL(this.actives);
      this.scanlineHeap.clear();
      this.scanlineSet.clear();
      this.disposeIntersectNodes();
      this.outrecList.length = 0;
      this.horzSegList.length = 0;
      this.horzJoinList.length = 0;
    }
  
    public clear(): void {
      this.clearSolutionOnly();
      this.minimaList.length = 0;
      this.vertexList.length = 0;
      this.currentLocMin = 0;
      this.isSortedMinimaList = false;
      this.hasOpenPaths = false;
    }
  
    protected reset(): void {
      if (!this.isSortedMinimaList) {
        this.minimaList.sort((a, b) => b.vertex.pt.y - a.vertex.pt.y);
        this.isSortedMinimaList = true;
      }
  
      this.scanlineHeap.clear();
      this.scanlineSet.clear();
      for (let i = this.minimaList.length - 1; i >= 0; i--) {
        this.insertScanline(this.minimaList[i].vertex.pt.y);
      }
  
      this.currentBotY = 0;
      this.currentLocMin = 0;
      this.actives = null;
      this.sel = null;
      this.succeeded = true;
    }
  
    private insertScanline(y: number): void {
      if (this.scanlineSet.has(y)) return;
      this.scanlineSet.add(y);
      this.scanlineHeap.push(y);
    }
  
    private popScanline(): { success: boolean; y: number } {
      const y = this.scanlineHeap.pop();
      if (y === null) return { success: false, y: 0 };
      this.scanlineSet.delete(y);
      return { success: true, y };
    }
  
    private hasLocMinAtY(y: number): boolean {
      return this.currentLocMin < this.minimaList.length && 
             this.minimaList[this.currentLocMin].vertex.pt.y === y;
    }
  
    private popLocalMinima(): LocalMinima {
      return this.minimaList[this.currentLocMin++];
    }
  
    protected addPath(path: Path64, polytype: PathType, isOpen: boolean = false): void {
      const tmp: Paths64 = [path];
      this.addPaths(tmp, polytype, isOpen);
    }
  
    protected addPaths(paths: Paths64, polytype: PathType, isOpen: boolean = false): void {
      if (isOpen) this.hasOpenPaths = true;
      this.isSortedMinimaList = false;
      ClipperEngine.addPathsToVertexList(paths, polytype, isOpen, this.minimaList, this.vertexList);
    }
  
    protected addReuseableData(reuseableData: ReuseableDataContainer64): void {
      if (reuseableData['minimaList'].length === 0) return;
      // nb: reuseableData will continue to own the vertices, so it's important
      // that the reuseableData object isn't destroyed before the Clipper object
      // that's using the data.
      this.isSortedMinimaList = false;
      for (const lm of reuseableData['minimaList']) {
        this.minimaList.push(new LocalMinima(lm.vertex, lm.polytype, lm.isOpen));
        if (lm.isOpen) this.hasOpenPaths = true;
      }
    }
  
    private deleteFromAEL(ae: Active): void {
      const prev = ae.prevInAEL;
      const next = ae.nextInAEL;
      if (prev === null && next === null && (ae !== this.actives)) return; // already deleted
      if (prev !== null) {
        prev.nextInAEL = next;
      } else {
        this.actives = next;
      }
      if (next !== null) next.prevInAEL = prev;
      // delete ae;
    }
  
    public getBounds(): Rect64 {
      const bounds: Rect64 = {
        left: Number.MAX_SAFE_INTEGER,
        top: Number.MAX_SAFE_INTEGER,
        right: Number.MIN_SAFE_INTEGER,
        bottom: Number.MIN_SAFE_INTEGER
      };
      
      for (const t of this.vertexList) {
        let v = t;
        do {
          if (v.pt.x < bounds.left) bounds.left = v.pt.x;
          if (v.pt.x > bounds.right) bounds.right = v.pt.x;
          if (v.pt.y < bounds.top) bounds.top = v.pt.y;
          if (v.pt.y > bounds.bottom) bounds.bottom = v.pt.y;
          v = v.next!;
        } while (v !== t);
      }
      
      return Rect64Utils.isEmpty(bounds) ? { left: 0, top: 0, right: 0, bottom: 0 } : bounds;
    }
  
  protected executeInternal(ct: ClipType, fillRule: FillRule): void {
    if (ct === ClipType.NoClip) return;
    this.fillrule = fillRule;
    this.cliptype = ct;
    this.reset();
    
    const scanResult = this.popScanline();
    if (!scanResult.success) return;
    let y = scanResult.y;
    
    while (this.succeeded) {
      this.insertLocalMinimaIntoAEL(y);
      let ae: Active | null;
      while ((ae = this.popHorz()) !== null) this.doHorizontal(ae);
      if (this.horzSegList.length > 0) {
        this.convertHorzSegsToJoins();
        this.horzSegList.length = 0;
      }
      this.currentBotY = y; // bottom of scanbeam
      const nextScanResult = this.popScanline();
      if (!nextScanResult.success) break; // y new top of scanbeam
      y = nextScanResult.y;
      this.doIntersections(y);
      this.doTopOfScanbeam(y);
      while ((ae = this.popHorz()) !== null) this.doHorizontal(ae);
    }
    if (this.succeeded) this.processHorzJoins();
  }
  
    private insertLocalMinimaIntoAEL(botY: number): void {
      // Add any local minima (if any) at BotY ...
      // NB horizontal local minima edges should contain locMin.vertex.prev
      while (this.hasLocMinAtY(botY)) {
        const localMinima = this.popLocalMinima();
        let leftBound: Active | null;
        
        if ((localMinima.vertex.flags & VertexFlags.OpenStart) !== VertexFlags.None) {
          leftBound = null;
        } else {
          leftBound = new Active();
          leftBound.bot = { x: localMinima.vertex.pt.x, y: localMinima.vertex.pt.y };  // Create copy
          leftBound.curX = localMinima.vertex.pt.x;
          leftBound.windDx = -1;
          leftBound.vertexTop = localMinima.vertex.prev;
          leftBound.top = { x: localMinima.vertex.prev!.pt.x, y: localMinima.vertex.prev!.pt.y };  // Create copy
          leftBound.outrec = null;
          leftBound.localMin = localMinima;
          ClipperBase.setDx(leftBound);
        }

        let rightBound: Active | null;
        if ((localMinima.vertex.flags & VertexFlags.OpenEnd) !== VertexFlags.None) {
          rightBound = null;
        } else {
          rightBound = new Active();
          rightBound.bot = { x: localMinima.vertex.pt.x, y: localMinima.vertex.pt.y };  // Create copy
          rightBound.curX = localMinima.vertex.pt.x;
          rightBound.windDx = 1;
          rightBound.vertexTop = localMinima.vertex.next; // i.e. ascending
          rightBound.top = { x: localMinima.vertex.next!.pt.x, y: localMinima.vertex.next!.pt.y };  // Create copy
          rightBound.outrec = null;
          rightBound.localMin = localMinima;
          ClipperBase.setDx(rightBound);
        }
  
        // Currently LeftB is just the descending bound and RightB is the ascending.
        // Now if the LeftB isn't on the left of RightB then we need swap them.
        if (leftBound !== null && rightBound !== null) {
          if (ClipperBase.isHorizontal(leftBound)) {
            if (ClipperBase.isHeadingRightHorz(leftBound)) [leftBound, rightBound] = ClipperBase.swapActives(leftBound, rightBound);
          } else if (ClipperBase.isHorizontal(rightBound)) {
            if (ClipperBase.isHeadingLeftHorz(rightBound)) [leftBound, rightBound] = ClipperBase.swapActives(leftBound, rightBound);
          } else if (leftBound.dx < rightBound.dx) {
            [leftBound, rightBound] = ClipperBase.swapActives(leftBound, rightBound);
          }
        } else if (leftBound === null) {
          leftBound = rightBound;
          rightBound = null;
        }
  
        let contributing: boolean;
        leftBound!.isLeftBound = true;
        this.insertLeftEdge(leftBound!);
  
        if (ClipperBase.isOpen(leftBound!)) {
          this.setWindCountForOpenPathEdge(leftBound!);
          contributing = this.isContributingOpen(leftBound!);
        } else {
          this.setWindCountForClosedPathEdge(leftBound!);
          contributing = this.isContributingClosed(leftBound!);
        }
  
        if (rightBound !== null) {
          rightBound.windCount = leftBound!.windCount;
          rightBound.windCount2 = leftBound!.windCount2;
          this.insertRightEdge(leftBound!, rightBound);
  
          if (contributing) {
            this.addLocalMinPoly(leftBound!, rightBound, leftBound!.bot, true);
            if (!ClipperBase.isHorizontal(leftBound!)) {
              this.checkJoinLeft(leftBound!, leftBound!.bot);
            }
          }
  
          while (rightBound.nextInAEL !== null &&
                 this.isValidAelOrder(rightBound.nextInAEL, rightBound)) {
            this.intersectEdges(rightBound, rightBound.nextInAEL, rightBound.bot);
            this.swapPositionsInAEL(rightBound, rightBound.nextInAEL);
          }
  
          if (ClipperBase.isHorizontal(rightBound)) {
            this.pushHorz(rightBound);
          } else {
            this.checkJoinRight(rightBound, rightBound.bot);
            this.insertScanline(rightBound.top.y);
          }
        } else if (contributing) {
          this.startOpenPath(leftBound!, leftBound!.bot);
        }
  
        if (ClipperBase.isHorizontal(leftBound!)) {
          this.pushHorz(leftBound!);
        } else {
          this.insertScanline(leftBound!.top.y);
        }
      }
    }
  
    private pushHorz(ae: Active): void {
      ae.nextInSEL = this.sel;
      this.sel = ae;
    }
  
    private popHorz(): Active | null {
      const ae = this.sel;
      if (ae === null) return null;
      this.sel = this.sel!.nextInSEL;
      return ae;
    }
  
    private doHorizontal(horz: Active): void {
      const horzIsOpen = ClipperBase.isOpen(horz);
      const y = horz.bot.y;
  
      const vertexMax = horzIsOpen ?
        this.getCurrYMaximaVertexOpen(horz) :
        this.getCurrYMaximaVertex(horz);
  
      const { isLeftToRight, leftX, rightX } = this.resetHorzDirection(horz, vertexMax);
      let leftX2 = leftX;
      let rightX2 = rightX;
  
      if (ClipperBase.isHotEdge(horz)) {
        const op = this.addOutPt(horz, { x: horz.curX, y });
        this.addToHorzSegList(op);
      }
  
      while (true) {
        // loops through consec. horizontal edges (if open)
        let ae = isLeftToRight ? horz.nextInAEL : horz.prevInAEL;
  
        while (ae !== null) {
          if (ae.vertexTop === vertexMax) {
            // do this first!!
            if (ClipperBase.isHotEdge(horz) && this.isJoined(ae)) this.split(ae, ae.top);
  
            if (ClipperBase.isHotEdge(horz)) {
              while (horz.vertexTop !== vertexMax) {
                this.addOutPt(horz, horz.top);
                this.updateEdgeIntoAEL(horz);
              }
              if (isLeftToRight) {
                this.addLocalMaxPoly(horz, ae, horz.top);
              } else {
                this.addLocalMaxPoly(ae, horz, horz.top);
              }
            }
            this.deleteFromAEL(ae);
            this.deleteFromAEL(horz);
            return;
          }
  
          // if horzEdge is a maxima, keep going until we reach
          // its maxima pair, otherwise check for break conditions
          if (vertexMax !== horz.vertexTop || ClipperBase.isOpenEnd(horz)) {
            // otherwise stop when 'ae' is beyond the end of the horizontal line
            if ((isLeftToRight && ae.curX > rightX2) ||
                (!isLeftToRight && ae.curX < leftX2)) break;
  
            if (ae.curX === horz.top.x && !ClipperBase.isHorizontal(ae)) {
              const pt = ClipperBase.nextVertex(horz).pt;
  
              // to maximize the possibility of putting open edges into
              // solutions, we'll only break if it's past HorzEdge's end
              if (ClipperBase.isOpen(ae) && !ClipperBase.isSamePolyType(ae, horz) && !ClipperBase.isHotEdge(ae)) {
                if ((isLeftToRight && (ClipperBase.topX(ae, pt.y) > pt.x)) ||
                  (!isLeftToRight && (ClipperBase.topX(ae, pt.y) < pt.x))) break;
              }
              // otherwise for edges at horzEdge's end, only stop when horzEdge's
              // outslope is greater than e's slope when heading right or when
              // horzEdge's outslope is less than e's slope when heading left.
              else if ((isLeftToRight && (ClipperBase.topX(ae, pt.y) >= pt.x)) ||
                  (!isLeftToRight && (ClipperBase.topX(ae, pt.y) <= pt.x))) break;
            }
          }
  
          const pt = { x: ae.curX, y };
  
          if (isLeftToRight) {
            this.intersectEdges(horz, ae, pt);
            this.swapPositionsInAEL(horz, ae);
            this.checkJoinLeft(ae, pt);
            horz.curX = ae.curX;
            ae = horz.nextInAEL;
          } else {
            this.intersectEdges(ae, horz, pt);
            this.swapPositionsInAEL(ae, horz);
            this.checkJoinRight(ae, pt);
            horz.curX = ae.curX;
            ae = horz.prevInAEL;
          }
  
          if (ClipperBase.isHotEdge(horz)) {
            this.addToHorzSegList(this.getLastOp(horz));
          }
        }
  
        // check if we've finished looping
        // through consecutive horizontals
        if (horzIsOpen && ClipperBase.isOpenEnd(horz)) { // ie open at top
          if (ClipperBase.isHotEdge(horz)) {
            this.addOutPt(horz, horz.top);
            if (ClipperBase.isFront(horz)) {
              horz.outrec!.frontEdge = null;
            } else {
              horz.outrec!.backEdge = null;
            }
            horz.outrec = null;
          }
          this.deleteFromAEL(horz);
          return;
        }
        if (ClipperBase.nextVertex(horz).pt.y !== horz.top.y) {
          break;
        }
  
        //still more horizontals in bound to process ...
        if (ClipperBase.isHotEdge(horz)) {
          this.addOutPt(horz, horz.top);
        }
  
        this.updateEdgeIntoAEL(horz);
  
        const resetResult = this.resetHorzDirection(horz, vertexMax);
        leftX2 = resetResult.leftX;
        rightX2 = resetResult.rightX;
      }
  
      if (ClipperBase.isHotEdge(horz)) {
        const op = this.addOutPt(horz, horz.top);
        this.addToHorzSegList(op);
      }
  
      this.updateEdgeIntoAEL(horz); // this is the end of an intermediate horiz.
    }
  
    private convertHorzSegsToJoins(): void {
      let k = 0;
      for (const hs of this.horzSegList) {
        if (this.updateHorzSegment(hs)) k++;
      }
      if (k < 2) return;
      
      this.horzSegList.sort((a, b) => this.horzSegSort(a, b));
  
      for (let i = 0; i < k - 1; i++) {
        const hs1 = this.horzSegList[i];
        // for each HorzSegment, find others that overlap
        for (let j = i + 1; j < k; j++) {
          const hs2 = this.horzSegList[j];
          if ((hs2.leftOp!.pt.x >= hs1.rightOp!.pt.x) || 
            (hs2.leftToRight === hs1.leftToRight) ||
            (hs2.rightOp!.pt.x <= hs1.leftOp!.pt.x)) continue;
          const currY = hs1.leftOp!.pt.y;
          if (hs1.leftToRight) {
            while (hs1.leftOp!.next!.pt.y === currY &&
              hs1.leftOp!.next!.pt.x <= hs2.leftOp!.pt.x)
              hs1.leftOp = hs1.leftOp!.next;
            while (hs2.leftOp!.prev.pt.y === currY &&
              hs2.leftOp!.prev.pt.x <= hs1.leftOp!.pt.x)
              hs2.leftOp = hs2.leftOp!.prev;
            const join = new HorzJoin(
              this.duplicateOp(hs1.leftOp!, true),
              this.duplicateOp(hs2.leftOp!, false));
            this.horzJoinList.push(join);
          } else {
            while (hs1.leftOp!.prev.pt.y === currY &&
              hs1.leftOp!.prev.pt.x <= hs2.leftOp!.pt.x)
              hs1.leftOp = hs1.leftOp!.prev;
            while (hs2.leftOp!.next!.pt.y === currY &&
              hs2.leftOp!.next!.pt.x <= hs1.leftOp!.pt.x)
              hs2.leftOp = hs2.leftOp!.next;
            const join = new HorzJoin(
              this.duplicateOp(hs2.leftOp!, true),
              this.duplicateOp(hs1.leftOp!, false));
            this.horzJoinList.push(join);
          }
        }
      }
    }
  
    private updateHorzSegment(hs: HorzSegment): boolean {
      const op = hs.leftOp!;
      const outrec = this.getRealOutRec(op.outrec)!;
      const outrecHasEdges = outrec.frontEdge !== null;
      const currY = op.pt.y;
      let opP = op;
      let opN = op;
      
      if (outrecHasEdges) {
        const opA = outrec.pts!;
        const opZ = opA.next!;
        while (opP !== opZ && opP.prev.pt.y === currY)
          opP = opP.prev;
        while (opN !== opA && opN.next!.pt.y === currY)
          opN = opN.next!;
      } else {
        while (opP.prev !== opN && opP.prev.pt.y === currY)
          opP = opP.prev;
        while (opN.next !== opP && opN.next!.pt.y === currY)
          opN = opN.next!;
      }
      
      const result = this.setHorzSegHeadingForward(hs, opP, opN) && hs.leftOp!.horz === null;
  
      if (result) {
        hs.leftOp!.horz = hs;
      } else {
        hs.rightOp = null; // (for sorting)
      }
      return result;
    }
  
    private setHorzSegHeadingForward(hs: HorzSegment, opP: OutPt, opN: OutPt): boolean {
      if (opP.pt.x === opN.pt.x) return false;
      if (opP.pt.x < opN.pt.x) {
        hs.leftOp = opP;
        hs.rightOp = opN;
        hs.leftToRight = true;
      } else {
        hs.leftOp = opN;
        hs.rightOp = opP;
        hs.leftToRight = false;
      }
      return true;
    }
  
    private horzSegSort(hs1: HorzSegment, hs2: HorzSegment): number {
      if (hs1.rightOp === null) {
        return hs2.rightOp === null ? 0 : 1;
      }
      if (hs2.rightOp === null) return -1;
      return hs1.leftOp!.pt.x - hs2.leftOp!.pt.x;
    }
  
    protected duplicateOp(op: OutPt, insertAfter: boolean): OutPt {
      const result = new OutPt(op.pt, op.outrec);
      if (insertAfter) {
        result.next = op.next;
        result.next!.prev = result;
        result.prev = op;
        op.next = result;
      } else {
        result.prev = op.prev;
        result.prev.next = result;
        result.next = op;
        op.prev = result;
      }
      return result;
    }
  
    protected getRealOutRec(outRec: OutRec | null): OutRec | null {
      while (outRec !== null && outRec.pts === null) {
        outRec = outRec.owner;
      }
      return outRec;
    }
  
    private doIntersections(y: number): void {
      if (this.buildIntersectList(y)) {
        this.processIntersectList();
        this.disposeIntersectNodes();
      }
    }
  
    private doTopOfScanbeam(y: number): void {
      this.sel = null; // sel is reused to flag horizontals (see PushHorz below)
      let ae = this.actives;
      while (ae !== null) {
        // NB 'ae' will never be horizontal here
        if (ae.top.y === y) {
          ae.curX = ae.top.x;
          if (ClipperBase.isMaxima(ae)) {
            ae = this.doMaxima(ae); // TOP OF BOUND (MAXIMA)
            continue;
          } else {
            // INTERMEDIATE VERTEX ...
            if (ClipperBase.isHotEdge(ae)) this.addOutPt(ae, ae.top);
            this.updateEdgeIntoAEL(ae);
            if (ClipperBase.isHorizontal(ae)) {
              this.pushHorz(ae); // horizontals are processed later
            }
          }
        } else { // i.e. not the top of the edge
          ae.curX = ClipperBase.topX(ae, y);  // TopX already returns correctly rounded integer
        }
  
        ae = ae.nextInAEL;
      }
    }
  
    private processHorzJoins(): void {
      for (const j of this.horzJoinList) {
        const or1 = this.getRealOutRec(j.op1!.outrec)!;
        const or2 = this.getRealOutRec(j.op2!.outrec)!;
  
        const op1b = j.op1!.next!;
        const op2b = j.op2!.prev;
        j.op1!.next = j.op2;
        j.op2!.prev = j.op1!;
        op1b.prev = op2b;
        op2b.next = op1b;
  
        if (or1 === or2) { // 'join' is really a split
          const or2New = this.newOutRec();
          or2New.pts = op1b;
          this.fixOutRecPts(or2New);
  
          //if or1->pts has moved to or2 then update or1->pts!!
          if (or1.pts!.outrec === or2New) {
            or1.pts = j.op1;
            or1.pts!.outrec = or1;
          }
  
          if (this.usingPolytree) {
            if (this.path1InsidePath2(or1.pts!, or2New.pts!)) {
              //swap or1's & or2's pts
              [or2New.pts, or1.pts] = [or1.pts, or2New.pts];
              this.fixOutRecPts(or1);
              this.fixOutRecPts(or2New);
              //or2 is now inside or1
              or2New.owner = or1;
            } else if (this.path1InsidePath2(or2New.pts!, or1.pts!)) {
              or2New.owner = or1;
            } else {
              or2New.owner = or1.owner;
            }
  
            if (or1.splits === null) or1.splits = [];
            or1.splits.push(or2New.idx);
          } else {
            or2New.owner = or1;
          }
        } else {
          or2.pts = null;
          if (this.usingPolytree) {
            this.setOwner(or2, or1);
            this.moveSplits(or2, or1);
          } else {
            or2.owner = or1;
          }
        }
      }
    }
  
    private fixOutRecPts(outrec: OutRec): void {
      let op = outrec.pts!;
      do {
        op.outrec = outrec;
        op = op.next!;
      } while (op !== outrec.pts);
    }
  
    protected path1InsidePath2(op1: OutPt, op2: OutPt): boolean {
      // we need to make some accommodation for rounding errors
      // so we won't jump if the first vertex is found outside
      let pip = PointInPolygonResult.IsOn;
      let op = op1;
      do {
        switch (this.pointInOpPolygon(op.pt, op2)) {
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
        op = op.next!;
      } while (op !== op1);
      // result is unclear, so try again using cleaned paths
      return InternalClipper.path2ContainsPath1(this.getCleanPath(op1), this.getCleanPath(op2)); // (#973)
    }
  
    private pointInOpPolygon(pt: Point64, op: OutPt): PointInPolygonResult {
      if (op === op.next || op.prev === op.next) {
        return PointInPolygonResult.IsOutside;
      }
  
      let op2 = op;
      do {
        if (op.pt.y !== pt.y) break;
        op = op.next!;
      } while (op !== op2);
      if (op.pt.y === pt.y) // not a proper polygon
        return PointInPolygonResult.IsOutside;
  
      // must be above or below to get here
      let isAbove = op.pt.y < pt.y;
      const startingAbove = isAbove;
      let val = 0;
  
      op2 = op.next!;
      while (op2 !== op) {
        if (isAbove) {
          while (op2 !== op && op2.pt.y < pt.y) op2 = op2.next!;
        } else {
          while (op2 !== op && op2.pt.y > pt.y) op2 = op2.next!;
        }
        if (op2 === op) break;
  
        // must have touched or crossed the pt.Y horizontal
        // and this must happen an even number of times
  
        if (op2.pt.y === pt.y) { // touching the horizontal
          if (op2.pt.x === pt.x || (op2.pt.y === op2.prev.pt.y &&
            (pt.x < op2.prev.pt.x) !== (pt.x < op2.pt.x)))
            return PointInPolygonResult.IsOn;
          op2 = op2.next!;
          if (op2 === op) break;
          continue;
        }
  
        if (op2.pt.x <= pt.x || op2.prev.pt.x <= pt.x) {
          if ((op2.prev.pt.x < pt.x && op2.pt.x < pt.x)) {
            val = 1 - val; // toggle val
          } else {
            const d = InternalClipper.crossProduct(op2.prev.pt, op2.pt, pt);
            if (d === 0) return PointInPolygonResult.IsOn;
            if ((d < 0) === isAbove) val = 1 - val;
          }
        }
        isAbove = !isAbove;
        op2 = op2.next!;
      }
  
      if (isAbove === startingAbove) return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
      {
        const d = InternalClipper.crossProduct(op2.prev.pt, op2.pt, pt);
        if (d === 0) return PointInPolygonResult.IsOn;
        if ((d < 0) === isAbove) val = 1 - val;
      }
  
      return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
    }
  
    private getCleanPath(op: OutPt): Path64 {
      const result: Path64 = [];
      let op2 = op;
      while (op2.next !== op &&
        ((op2.pt.x === op2.next!.pt.x && op2.pt.x === op2.prev.pt.x) ||
          (op2.pt.y === op2.next!.pt.y && op2.pt.y === op2.prev.pt.y))) op2 = op2.next!;
      result.push(op2.pt);
      let prevOp = op2;
      op2 = op2.next!;
      while (op2 !== op) {
        if ((op2.pt.x !== op2.next!.pt.x || op2.pt.x !== prevOp.pt.x) &&
          (op2.pt.y !== op2.next!.pt.y || op2.pt.y !== prevOp.pt.y)) {
          result.push(op2.pt);
          prevOp = op2;
        }
        op2 = op2.next!;
      }
      return result;
    }
  
    private moveSplits(fromOr: OutRec, toOr: OutRec): void {
      if (fromOr.splits === null) return;
      if (toOr.splits === null) toOr.splits = [];
      for (const i of fromOr.splits) {
        if (i !== toOr.idx) {
          toOr.splits.push(i);
        }
      }
      fromOr.splits = null;
    }
  
    private buildIntersectList(topY: number): boolean {
      if (this.actives?.nextInAEL === null) return false;
  
      // Calculate edge positions at the top of the current scanbeam, and from this
      // we will determine the intersections required to reach these new positions.
      this.adjustCurrXAndCopyToSEL(topY);
  
      // Find all edge intersections in the current scanbeam using a stable merge
      // sort that ensures only adjacent edges are intersecting. Intersect info is
      // stored in intersectList ready to be processed in ProcessIntersectList.
      // Re merge sorts see https://stackoverflow.com/a/46319131/359538
  
      let left = this.sel;
  
      while (left !== null && left.jump !== null) {
        let prevBase: Active | null = null;
        while (left !== null && left.jump !== null) {
          let currBase = left;
          let right: Active | null = left.jump;
          let lEnd: Active | null = right;
          const rEnd: Active | null = right?.jump || null;
          left.jump = rEnd;
          
          while (left !== lEnd && right !== rEnd) {
            if (right!.curX < left!.curX) {
              let tmp = right!.prevInSEL!;
              while (true) {
                this.addNewIntersectNode(tmp, right!, topY);
                if (tmp === left) break;
                tmp = tmp.prevInSEL!;
              }
  
              tmp = right!;
              right = this.extractFromSEL(tmp);
              lEnd = right; // Update lEnd - this is the critical fix!
              if (left !== null) this.insert1Before2InSEL(tmp, left);
              if (left !== currBase) continue;
              currBase = tmp;
              currBase.jump = rEnd;
              if (prevBase === null) {
                this.sel = currBase;
              } else {
                prevBase.jump = currBase;
              }
            } else {
              left = left!.nextInSEL;
            }
          }
  
          prevBase = currBase;
          left = rEnd;
        }
        left = this.sel;
      }
  
      return this.intersectList.length > 0;
    }
  
    private processIntersectList(): void {
      // We now have a list of intersections required so that edges will be
      // correctly positioned at the top of the scanbeam. However, it's important
      // that edge intersections are processed from the bottom up, but it's also
      // crucial that intersections only occur between adjacent edges.
  
      // First we do a quicksort so intersections proceed in a bottom up order ...
      this.intersectList.sort((a, b) => {
        if (a.pt.y !== b.pt.y) return (a.pt.y > b.pt.y) ? -1 : 1;
        if (a.pt.x !== b.pt.x) return (a.pt.x < b.pt.x) ? -1 : 1;
        // Tiebreaker: when points are identical, sort by edge1's curX position
        // This provides deterministic ordering matching C# IntroSort behavior
        if (a.edge1.curX !== b.edge1.curX) return (a.edge1.curX < b.edge1.curX) ? -1 : 1;
        // Final tiebreaker: edge2's curX
        return (a.edge2.curX < b.edge2.curX) ? -1 : (a.edge2.curX > b.edge2.curX) ? 1 : 0;
      });
  
      // Now as we process these intersections, we must sometimes adjust the order
      // to ensure that intersecting edges are always adjacent ...
      for (let i = 0; i < this.intersectList.length; ++i) {
        if (!this.edgesAdjacentInAEL(this.intersectList[i])) {
          let j = i + 1;
          while (!this.edgesAdjacentInAEL(this.intersectList[j])) j++;
          // swap
          [this.intersectList[j], this.intersectList[i]] = [this.intersectList[i], this.intersectList[j]];
        }
  
        const node = this.intersectList[i];
        this.intersectEdges(node.edge1, node.edge2, node.pt);
        this.swapPositionsInAEL(node.edge1, node.edge2);
  
        node.edge1.curX = node.pt.x;
        node.edge2.curX = node.pt.x;
        this.checkJoinLeft(node.edge2, node.pt, true);
        this.checkJoinRight(node.edge1, node.pt, true);
      }
    }
  
    private edgesAdjacentInAEL(inode: IntersectNode): boolean {
      return (inode.edge1.nextInAEL === inode.edge2) || (inode.edge1.prevInAEL === inode.edge2);
    }
  
    private adjustCurrXAndCopyToSEL(topY: number): void {
      let ae = this.actives;
      this.sel = ae;
      while (ae !== null) {
        ae.prevInSEL = ae.prevInAEL;
        ae.nextInSEL = ae.nextInAEL;
        ae.jump = ae.nextInSEL;
        // it is safe to ignore 'joined' edges here because
        // if necessary they will be split in IntersectEdges()
        ae.curX = ClipperBase.topX(ae, topY);
        // NB don't update ae.curr.Y yet (see AddNewIntersectNode)
        ae = ae.nextInAEL;
      }
    }
  
    private doMaxima(ae: Active): Active | null {
      const prevE = ae.prevInAEL;
      let nextE = ae.nextInAEL;
  
      if (ClipperBase.isOpenEnd(ae)) {
        if (ClipperBase.isHotEdge(ae)) this.addOutPt(ae, ae.top);
        if (ClipperBase.isHorizontal(ae)) return nextE;
        if (ClipperBase.isHotEdge(ae)) {
          if (ClipperBase.isFront(ae)) {
            ae.outrec!.frontEdge = null;
          } else {
            ae.outrec!.backEdge = null;
          }
          ae.outrec = null;
        }
        this.deleteFromAEL(ae);
        return nextE;
      }
  
      const maxPair = ClipperBase.getMaximaPair(ae);
      if (maxPair === null) return nextE; // eMaxPair is horizontal
  
      if (this.isJoined(ae)) this.split(ae, ae.top);
      if (this.isJoined(maxPair)) this.split(maxPair, maxPair.top);
  
      // only non-horizontal maxima here.
      // process any edges between maxima pair ...
      while (nextE !== maxPair) {
        this.intersectEdges(ae, nextE!, ae.top);
        this.swapPositionsInAEL(ae, nextE!);
        nextE = ae.nextInAEL;
      }
  
      if (ClipperBase.isOpen(ae)) {
        if (ClipperBase.isHotEdge(ae)) {
          this.addLocalMaxPoly(ae, maxPair, ae.top);
        }
        this.deleteFromAEL(maxPair);
        this.deleteFromAEL(ae);
        return (prevE !== null ? prevE.nextInAEL : this.actives);
      }
  
      // here ae.nextInAel == ENext == EMaxPair ...
      if (ClipperBase.isHotEdge(ae)) {
        this.addLocalMaxPoly(ae, maxPair, ae.top);
      }
  
      this.deleteFromAEL(ae);
      this.deleteFromAEL(maxPair);
      return (prevE !== null ? prevE.nextInAEL : this.actives);
    }
  
    private updateEdgeIntoAEL(ae: Active): void {
      ae.bot = { x: ae.top.x, y: ae.top.y };  // Create copy
      ae.vertexTop = ClipperBase.nextVertex(ae);
      ae.top = { x: ae.vertexTop!.pt.x, y: ae.vertexTop!.pt.y };  // Create copy  
      ae.curX = ae.bot.x;
      ClipperBase.setDx(ae);
  
      if (this.isJoined(ae)) this.split(ae, ae.bot);
  
      if (ClipperBase.isHorizontal(ae)) {
        if (!ClipperBase.isOpen(ae)) this.trimHorz(ae, this.preserveCollinear);
        return;
      }
      this.insertScanline(ae.top.y);
  
      this.checkJoinLeft(ae, ae.bot);
      this.checkJoinRight(ae, ae.bot, true); // (#500)
    }
  
    private trimHorz(horzEdge: Active, preserveCollinear: boolean): void {
      let wasTrimmed = false;
      let pt = ClipperBase.nextVertex(horzEdge).pt;
  
      while (pt.y === horzEdge.top.y) {
        // always trim 180 deg. spikes (in closed paths)
        // but otherwise break if preserveCollinear = true
        if (preserveCollinear &&
        (pt.x < horzEdge.top.x) !== (horzEdge.bot.x < horzEdge.top.x)) {
          break;
        }
  
        horzEdge.vertexTop = ClipperBase.nextVertex(horzEdge);
        horzEdge.top = pt;
        wasTrimmed = true;
        if (ClipperBase.isMaxima(horzEdge)) break;
        pt = ClipperBase.nextVertex(horzEdge).pt;
      }
      if (wasTrimmed) ClipperBase.setDx(horzEdge); // +/-infinity
    }
  
    private addToHorzSegList(op: OutPt): void {
      if (op.outrec.isOpen) return;
      this.horzSegList.push(new HorzSegment(op));
    }
  
    private addNewIntersectNode(ae1: Active, ae2: Active, topY: number): void {
      const intersectResult = InternalClipper.getLineIntersectPt(ae1.bot, ae1.top, ae2.bot, ae2.top);
      let ip: Point64;
      
      if (!intersectResult.intersects) {
        ip = { x: ae1.curX, y: topY }; // parallel edges
      } else {
        ip = intersectResult.point;
      }
  
      if (ip.y > this.currentBotY || ip.y < topY) {
        const absDx1 = Math.abs(ae1.dx);
        const absDx2 = Math.abs(ae2.dx);
        
        if (absDx1 > 100 && absDx2 > 100) {
          if (absDx1 > absDx2) {
            ip = InternalClipper.getClosestPtOnSegment(ip, ae1.bot, ae1.top);
          } else {
            ip = InternalClipper.getClosestPtOnSegment(ip, ae2.bot, ae2.top);
          }
        } else if (absDx1 > 100) {
          ip = InternalClipper.getClosestPtOnSegment(ip, ae1.bot, ae1.top);
        } else if (absDx2 > 100) {
          ip = InternalClipper.getClosestPtOnSegment(ip, ae2.bot, ae2.top);
        } else {
          if (ip.y < topY) ip.y = topY;
          else ip.y = this.currentBotY;
          if (absDx1 < absDx2) ip.x = ClipperBase.topX(ae1, ip.y);
          else ip.x = ClipperBase.topX(ae2, ip.y);
        }
      }
      
      const node = createIntersectNode(ip, ae1, ae2);
      this.intersectList.push(node);
    }
  
    private extractFromSEL(ae: Active): Active | null {
      const res = ae.nextInSEL;
      if (res !== null) {
        res.prevInSEL = ae.prevInSEL;
      }
      ae.prevInSEL!.nextInSEL = res;
      return res;
    }
  
    private insert1Before2InSEL(ae1: Active, ae2: Active): void {
      ae1.prevInSEL = ae2.prevInSEL;
      if (ae1.prevInSEL !== null) {
        ae1.prevInSEL.nextInSEL = ae1;
      }
      ae1.nextInSEL = ae2;
      ae2.prevInSEL = ae1;
    }
  
    private getCurrYMaximaVertexOpen(ae: Active): Vertex | null {
      let result = ae.vertexTop;
      if (ae.windDx > 0) {
        while (result!.next!.pt.y === result!.pt.y &&
          ((result!.flags & (VertexFlags.OpenEnd | VertexFlags.LocalMax)) === VertexFlags.None))
          result = result!.next;
      } else {
        while (result!.prev!.pt.y === result!.pt.y &&
          ((result!.flags & (VertexFlags.OpenEnd | VertexFlags.LocalMax)) === VertexFlags.None))
          result = result!.prev;
      }
      if (!ClipperBase.isMaxima(result!)) result = null; // not a maxima
      return result;
    }
  
    private getCurrYMaximaVertex(ae: Active): Vertex | null {
      let result = ae.vertexTop;
      if (ae.windDx > 0) {
        while (result!.next!.pt.y === result!.pt.y) result = result!.next;
      } else {
        while (result!.prev!.pt.y === result!.pt.y) result = result!.prev;
      }
      if (!ClipperBase.isMaxima(result!)) result = null; // not a maxima
      return result;
    }
  
    private resetHorzDirection(horz: Active, vertexMax: Vertex | null): { isLeftToRight: boolean; leftX: number; rightX: number } {
      if (horz.bot.x === horz.top.x) {
        // the horizontal edge is going nowhere ...
        const leftX = horz.curX;
        const rightX = horz.curX;
        let ae = horz.nextInAEL;
        while (ae !== null && ae.vertexTop !== vertexMax)
          ae = ae.nextInAEL;
        return { isLeftToRight: ae !== null, leftX, rightX };
      }
  
      if (horz.curX < horz.top.x) {
        return { isLeftToRight: true, leftX: horz.curX, rightX: horz.top.x };
      } else {
        return { isLeftToRight: false, leftX: horz.top.x, rightX: horz.curX };
      }
    }
  
    private getLastOp(hotEdge: Active): OutPt {
      const outrec = hotEdge.outrec!;
      return (hotEdge === outrec.frontEdge) ?
        outrec.pts! : outrec.pts!.next!;
    }
  
    private insertLeftEdge(ae: Active): void {
      if (this.actives === null) {
        ae.prevInAEL = null;
        ae.nextInAEL = null;
        this.actives = ae;
      } else if (!this.isValidAelOrder(this.actives, ae)) {
        ae.prevInAEL = null;
        ae.nextInAEL = this.actives;
        this.actives.prevInAEL = ae;
        this.actives = ae;
      } else {
        let ae2 = this.actives;
        while (ae2.nextInAEL !== null && this.isValidAelOrder(ae2.nextInAEL, ae)) {
          ae2 = ae2.nextInAEL;
        }
        //don't separate joined edges
        if (ae2.joinWith === JoinWith.Right) ae2 = ae2.nextInAEL!;
        ae.nextInAEL = ae2.nextInAEL;
        if (ae2.nextInAEL !== null) ae2.nextInAEL.prevInAEL = ae;
        ae.prevInAEL = ae2;
        ae2.nextInAEL = ae;
      }
    }
  
    private insertRightEdge(ae1: Active, ae2: Active): void {
      ae2.nextInAEL = ae1.nextInAEL;
      if (ae1.nextInAEL !== null) ae1.nextInAEL.prevInAEL = ae2;
      ae2.prevInAEL = ae1;
      ae1.nextInAEL = ae2;
    }
  
    private setWindCountForOpenPathEdge(ae: Active): void {
      let ae2 = this.actives;
      if (this.fillrule === FillRule.EvenOdd) {
        let cnt1 = 0, cnt2 = 0;
        while (ae2 !== ae) {
          if (ClipperBase.getPolyType(ae2!) === PathType.Clip) {
            cnt2++;
          } else if (!ClipperBase.isOpen(ae2!)) {
            cnt1++;
          }
          ae2 = ae2!.nextInAEL;
        }
  
        ae.windCount = (ClipperBase.isOdd(cnt1) ? 1 : 0);
        ae.windCount2 = (ClipperBase.isOdd(cnt2) ? 1 : 0);
      } else {
        while (ae2 !== ae) {
          if (ClipperBase.getPolyType(ae2!) === PathType.Clip) {
            ae.windCount2 += ae2!.windDx;
          } else if (!ClipperBase.isOpen(ae2!)) {
            ae.windCount += ae2!.windDx;
          }
          ae2 = ae2!.nextInAEL;
        }
      }
    }
  
    private setWindCountForClosedPathEdge(ae: Active): void {
      // Wind counts refer to polygon regions not edges, so here an edge's WindCnt
      // indicates the higher of the wind counts for the two regions touching the
      // edge. (nb: Adjacent regions can only ever have their wind counts differ by
      // one. Also, open paths have no meaningful wind directions or counts.)
  
      let ae2 = ae.prevInAEL;
      // find the nearest closed path edge of the same PolyType in AEL (heading left)
      const pt = ClipperBase.getPolyType(ae);
      while (ae2 !== null && (ClipperBase.getPolyType(ae2) !== pt || ClipperBase.isOpen(ae2))) ae2 = ae2.prevInAEL;
  
      if (ae2 === null) {
        ae.windCount = ae.windDx;
        ae2 = this.actives;
      } else if (this.fillrule === FillRule.EvenOdd) {
        ae.windCount = ae.windDx;
        ae.windCount2 = ae2.windCount2;
        ae2 = ae2.nextInAEL;
      } else {
        // NonZero, positive, or negative filling here ...
        // when e2's WindCnt is in the SAME direction as its WindDx,
        // then polygon will fill on the right of 'e2' (and 'e' will be inside)
        // nb: neither e2.WindCnt nor e2.WindDx should ever be 0.
        if (ae2.windCount * ae2.windDx < 0) {
          // opposite directions so 'ae' is outside 'ae2' ...
          if (Math.abs(ae2.windCount) > 1) {
            // outside prev poly but still inside another.
            if (ae2.windDx * ae.windDx < 0) {
              // reversing direction so use the same WC
              ae.windCount = ae2.windCount;
            } else {
              // otherwise keep 'reducing' the WC by 1 (i.e. towards 0) ...
              ae.windCount = ae2.windCount + ae.windDx;
            }
          } else {
            // now outside all polys of same polytype so set own WC ...
            ae.windCount = (ClipperBase.isOpen(ae) ? 1 : ae.windDx);
          }
        } else {
          //'ae' must be inside 'ae2'
          if (ae2.windDx * ae.windDx < 0) {
            // reversing direction so use the same WC
            ae.windCount = ae2.windCount;
          } else {
            // otherwise keep 'increasing' the WC by 1 (i.e. away from 0) ...
            ae.windCount = ae2.windCount + ae.windDx;
          }
        }
  
        ae.windCount2 = ae2.windCount2;
        ae2 = ae2.nextInAEL; // i.e. get ready to calc WindCnt2
      }
  
      // update windCount2 ...
      if (this.fillrule === FillRule.EvenOdd) {
        while (ae2 !== ae) {
          if (ClipperBase.getPolyType(ae2!) !== pt && !ClipperBase.isOpen(ae2!)) {
            ae.windCount2 = (ae.windCount2 === 0 ? 1 : 0);
          }
          ae2 = ae2!.nextInAEL;
        }
      } else {
        while (ae2 !== ae) {
          if (ClipperBase.getPolyType(ae2!) !== pt && !ClipperBase.isOpen(ae2!)) {
            ae.windCount2 += ae2!.windDx;
          }
          ae2 = ae2!.nextInAEL;
        }
      }
    }
  
    private isContributingOpen(ae: Active): boolean {
      let isInClip: boolean, isInSubj: boolean;
      switch (this.fillrule) {
        case FillRule.Positive:
          isInSubj = ae.windCount > 0;
          isInClip = ae.windCount2 > 0;
          break;
        case FillRule.Negative:
          isInSubj = ae.windCount < 0;
          isInClip = ae.windCount2 < 0;
          break;
        default:
          isInSubj = ae.windCount !== 0;
          isInClip = ae.windCount2 !== 0;
          break;
      }
  
      switch (this.cliptype) {
        case ClipType.Intersection: return isInClip;
        case ClipType.Union: return !isInSubj && !isInClip;
        default: return !isInClip;
      }
    }
  
    private isContributingClosed(ae: Active): boolean {
      switch (this.fillrule) {
        case FillRule.Positive:
          if (ae.windCount !== 1) return false;
          break;
        case FillRule.Negative:
          if (ae.windCount !== -1) return false;
          break;
        case FillRule.NonZero:
          if (Math.abs(ae.windCount) !== 1) return false;
          break;
      }
  
      switch (this.cliptype) {
        case ClipType.Intersection:
          return this.fillrule === FillRule.Positive ? ae.windCount2 > 0 :
                 this.fillrule === FillRule.Negative ? ae.windCount2 < 0 :
                 ae.windCount2 !== 0;
  
        case ClipType.Union:
          return this.fillrule === FillRule.Positive ? ae.windCount2 <= 0 :
                 this.fillrule === FillRule.Negative ? ae.windCount2 >= 0 :
                 ae.windCount2 === 0;
  
        case ClipType.Difference:
          const result = this.fillrule === FillRule.Positive ? (ae.windCount2 <= 0) :
                         this.fillrule === FillRule.Negative ? (ae.windCount2 >= 0) :
                         (ae.windCount2 === 0);
          return (ClipperBase.getPolyType(ae) === PathType.Subject) ? result : !result;
  
        case ClipType.Xor:
          return true; // XOr is always contributing unless open
  
        default:
          return false;
      }
    }
  
  private addLocalMinPoly(ae1: Active, ae2: Active, pt: Point64, isNew: boolean = false): OutPt {
    const outrec = this.newOutRec();
    ae1.outrec = outrec;
    ae2.outrec = outrec;

    if (ClipperBase.isOpen(ae1)) {
      outrec.owner = null;
      outrec.isOpen = true;
      if (ae1.windDx > 0) {
        this.setSides(outrec, ae1, ae2);
      } else {
        this.setSides(outrec, ae2, ae1);
      }
    } else {
      outrec.isOpen = false;
      const prevHotEdge = ClipperBase.getPrevHotEdge(ae1);
      // e.windDx is the winding direction of the **input** paths
      // and unrelated to the winding direction of output polygons.
      // Output orientation is determined by e.outrec.frontE which is
      // the ascending edge (see AddLocalMinPoly).
      if (prevHotEdge !== null) {
        if (this.usingPolytree) {
          this.setOwner(outrec, prevHotEdge.outrec!);
        }
        outrec.owner = prevHotEdge.outrec;
        if (this.outrecIsAscending(prevHotEdge) === isNew) {
          this.setSides(outrec, ae2, ae1);
        } else {
          this.setSides(outrec, ae1, ae2);
        }
      } else {
        outrec.owner = null;
        if (isNew) {
          this.setSides(outrec, ae1, ae2);
        } else {
          this.setSides(outrec, ae2, ae1);
        }
      }
    }

    const op = new OutPt(pt, outrec);
    outrec.pts = op;
    return op;
  }
  
    private outrecIsAscending(hotEdge: Active): boolean {
      return hotEdge === hotEdge.outrec!.frontEdge;
    }
  
  protected newOutRec(): OutRec {
    const result = new OutRec();
    result.idx = this.outrecList.length;
    this.outrecList.push(result);
    return result;
  }
  
    private startOpenPath(ae: Active, pt: Point64): OutPt {
      const outrec = this.newOutRec();
      outrec.isOpen = true;
      if (ae.windDx > 0) {
        outrec.frontEdge = ae;
        outrec.backEdge = null;
      } else {
        outrec.frontEdge = null;
        outrec.backEdge = ae;
      }
  
      ae.outrec = outrec;
      const op = new OutPt(pt, outrec);
      outrec.pts = op;
      return op;
    }
  
    private checkJoinLeft(ae: Active, pt: Point64, checkCurrX: boolean = false): void {
      const prev = ae.prevInAEL;
      if (prev === null || 
        !ClipperBase.isHotEdge(ae) || !ClipperBase.isHotEdge(prev) || 
        ClipperBase.isHorizontal(ae) || ClipperBase.isHorizontal(prev) ||
        ClipperBase.isOpen(ae) || ClipperBase.isOpen(prev)) return;
      if ((pt.y < ae.top.y + 2 || pt.y < prev.top.y + 2) &&  // avoid trivial joins
        ((ae.bot.y > pt.y) || (prev.bot.y > pt.y))) return;  // (#490)
  
      if (checkCurrX) {
        if (this.perpendicDistFromLineSqrd(pt, prev.bot, prev.top) > 0.25) return;
      } else if (ae.curX !== prev.curX) return;
      if (!InternalClipper.isCollinear(ae.top, pt, prev.top)) return;
  
      if (ae.outrec!.idx === prev.outrec!.idx) {
        this.addLocalMaxPoly(prev, ae, pt);
      } else if (ae.outrec!.idx < prev.outrec!.idx) {
        this.joinOutrecPaths(ae, prev);
      } else {
        this.joinOutrecPaths(prev, ae);
      }
      prev.joinWith = JoinWith.Right;
      ae.joinWith = JoinWith.Left;
    }
  
    private checkJoinRight(ae: Active, pt: Point64, checkCurrX: boolean = false): void {
      const next = ae.nextInAEL;
      if (next === null || 
        !ClipperBase.isHotEdge(ae) || !ClipperBase.isHotEdge(next) || 
        ClipperBase.isHorizontal(ae) || ClipperBase.isHorizontal(next) ||
        ClipperBase.isOpen(ae) || ClipperBase.isOpen(next)) return; 
      if ((pt.y < ae.top.y + 2 || pt.y < next.top.y + 2) &&  // avoid trivial joins
        ((ae.bot.y > pt.y) || (next.bot.y > pt.y)))  return; // (#490)
  
      if (checkCurrX) {
        if (this.perpendicDistFromLineSqrd(pt, next.bot, next.top) > 0.25) return;
      } else if (ae.curX !== next.curX) return;
      if (!InternalClipper.isCollinear(ae.top, pt, next.top)) return;
  
      if (ae.outrec!.idx === next.outrec!.idx) {
        this.addLocalMaxPoly(ae, next, pt);
      } else if (ae.outrec!.idx < next.outrec!.idx) {
        this.joinOutrecPaths(ae, next);
      } else {
        this.joinOutrecPaths(next, ae);
      }
      ae.joinWith = JoinWith.Right;
      next.joinWith = JoinWith.Left;
    }
  
    private perpendicDistFromLineSqrd(pt: Point64, line1: Point64, line2: Point64): number {
      const a = pt.x - line1.x;
      const b = pt.y - line1.y;
      const c = line2.x - line1.x;
      const d = line2.y - line1.y;
      if (c === 0 && d === 0) return 0;
      return ((a * d - c * b) * (a * d - c * b)) / (c * c + d * d);
    }

  
    private intersectEdges(ae1: Active, ae2: Active, pt: Point64): void {
      let resultOp: OutPt | null = null;
      // MANAGE OPEN PATH INTERSECTIONS SEPARATELY ...
      if (this.hasOpenPaths && (ClipperBase.isOpen(ae1) || ClipperBase.isOpen(ae2))) {
        if (ClipperBase.isOpen(ae1) && ClipperBase.isOpen(ae2)) return;
        // the following line avoids duplicating quite a bit of code
        if (ClipperBase.isOpen(ae2)) [ae1, ae2] = ClipperBase.swapActives(ae1, ae2);
        if (this.isJoined(ae2)) this.split(ae2, pt); // needed for safety
  
        if (this.cliptype === ClipType.Union) {
          if (!ClipperBase.isHotEdge(ae2)) return;
        } else if (ae2.localMin!.polytype === PathType.Subject) return;
  
        switch (this.fillrule) {
          case FillRule.Positive:
            if (ae2.windCount !== 1) return;
            break;
          case FillRule.Negative:
            if (ae2.windCount !== -1) return;
            break;
          default:
            if (Math.abs(ae2.windCount) !== 1) return;
            break;
        }
  
        // toggle contribution ...
        if (ClipperBase.isHotEdge(ae1)) {
          resultOp = this.addOutPt(ae1, pt);
          if (ClipperBase.isFront(ae1)) {
            ae1.outrec!.frontEdge = null;
          } else {
            ae1.outrec!.backEdge = null;
          }
          ae1.outrec = null;
        }
  
        // horizontal edges can pass under open paths at a LocMins
        else if (pt.x === ae1.localMin!.vertex.pt.x && pt.y === ae1.localMin!.vertex.pt.y &&
          !ClipperBase.isOpenEndVertex(ae1.localMin!.vertex)) {
          // find the other side of the LocMin and
          // if it's 'hot' join up with it ...
          const ae3 = this.findEdgeWithMatchingLocMin(ae1);
          if (ae3 !== null && ClipperBase.isHotEdge(ae3)) {
            ae1.outrec = ae3.outrec;
            if (ae1.windDx > 0) {
              this.setSides(ae3.outrec!, ae1, ae3);
            } else {
              this.setSides(ae3.outrec!, ae3, ae1);
            }
            return;
          }
  
          resultOp = this.startOpenPath(ae1, pt);
        } else {
          resultOp = this.startOpenPath(ae1, pt);
        }
        return;
      }
  
      // MANAGING CLOSED PATHS FROM HERE ON
      if (this.isJoined(ae1)) this.split(ae1, pt);
      if (this.isJoined(ae2)) this.split(ae2, pt);
  
      // UPDATE WINDING COUNTS...
      let oldE1WindCount: number, oldE2WindCount: number;
      if (ae1.localMin!.polytype === ae2.localMin!.polytype) {
        if (this.fillrule === FillRule.EvenOdd) {
          oldE1WindCount = ae1.windCount;
          ae1.windCount = ae2.windCount;
          ae2.windCount = oldE1WindCount;
        } else {
          if (ae1.windCount + ae2.windDx === 0) {
            ae1.windCount = -ae1.windCount;
          } else {
            ae1.windCount += ae2.windDx;
          }
          if (ae2.windCount - ae1.windDx === 0) {
            ae2.windCount = -ae2.windCount;
          } else {
            ae2.windCount -= ae1.windDx;
          }
        }
      } else {
        if (this.fillrule !== FillRule.EvenOdd) {
          ae1.windCount2 += ae2.windDx;
        } else {
          ae1.windCount2 = (ae1.windCount2 === 0 ? 1 : 0);
        }
        if (this.fillrule !== FillRule.EvenOdd) {
          ae2.windCount2 -= ae1.windDx;
        } else {
          ae2.windCount2 = (ae2.windCount2 === 0 ? 1 : 0);
        }
      }
  
      switch (this.fillrule) {
        case FillRule.Positive:
          oldE1WindCount = ae1.windCount;
          oldE2WindCount = ae2.windCount;
          break;
        case FillRule.Negative:
          oldE1WindCount = -ae1.windCount;
          oldE2WindCount = -ae2.windCount;
          break;
        default:
          oldE1WindCount = Math.abs(ae1.windCount);
          oldE2WindCount = Math.abs(ae2.windCount);
          break;
      }
  
      const e1WindCountIs0or1 = oldE1WindCount === 0 || oldE1WindCount === 1;
      const e2WindCountIs0or1 = oldE2WindCount === 0 || oldE2WindCount === 1;
  
      if ((!ClipperBase.isHotEdge(ae1) && !e1WindCountIs0or1) || 
        (!ClipperBase.isHotEdge(ae2) && !e2WindCountIs0or1)) return;
  
      // NOW PROCESS THE INTERSECTION ...
  
      // if both edges are 'hot' ...
      if (ClipperBase.isHotEdge(ae1) && ClipperBase.isHotEdge(ae2)) {
        if ((oldE1WindCount !== 0 && oldE1WindCount !== 1) || (oldE2WindCount !== 0 && oldE2WindCount !== 1) ||
            (ae1.localMin!.polytype !== ae2.localMin!.polytype && this.cliptype !== ClipType.Xor)) {
          resultOp = this.addLocalMaxPoly(ae1, ae2, pt);
        } else if (ClipperBase.isFront(ae1) || (ae1.outrec === ae2.outrec)) {
          // this 'else if' condition isn't strictly needed but
          // it's sensible to split polygons that only touch at
          // a common vertex (not at common edges).
          resultOp = this.addLocalMaxPoly(ae1, ae2, pt);
          // C# non-USINGZ version calls AddLocalMinPoly here (without the max poly call)
          this.addLocalMinPoly(ae1, ae2, pt);
        } else {
          // can't treat as maxima & minima
          resultOp = this.addOutPt(ae1, pt);
          this.addOutPt(ae2, pt);
          this.swapOutrecs(ae1, ae2);
        }
      }
  
      // if one or other edge is 'hot' ...
      else if (ClipperBase.isHotEdge(ae1)) {
        resultOp = this.addOutPt(ae1, pt);
        this.swapOutrecs(ae1, ae2);
      } else if (ClipperBase.isHotEdge(ae2)) {
        resultOp = this.addOutPt(ae2, pt);
        this.swapOutrecs(ae1, ae2);
      }
  
      // neither edge is 'hot'
      else {
        let e1Wc2: number, e2Wc2: number;
        switch (this.fillrule) {
          case FillRule.Positive:
            e1Wc2 = ae1.windCount2;
            e2Wc2 = ae2.windCount2;
            break;
          case FillRule.Negative:
            e1Wc2 = -ae1.windCount2;
            e2Wc2 = -ae2.windCount2;
            break;
          default:
            e1Wc2 = Math.abs(ae1.windCount2);
            e2Wc2 = Math.abs(ae2.windCount2);
            break;
        }
  
        if (!ClipperBase.isSamePolyType(ae1, ae2)) {
          resultOp = this.addLocalMinPoly(ae1, ae2, pt);
        } else if (oldE1WindCount === 1 && oldE2WindCount === 1) {
          resultOp = null; 
          switch (this.cliptype) {
            case ClipType.Union:
              if (e1Wc2 > 0 && e2Wc2 > 0) return;
              resultOp = this.addLocalMinPoly(ae1, ae2, pt);
              break;
  
            case ClipType.Difference:
              if (((ClipperBase.getPolyType(ae1) === PathType.Clip) && (e1Wc2 > 0) && (e2Wc2 > 0)) ||
                  ((ClipperBase.getPolyType(ae1) === PathType.Subject) && (e1Wc2 <= 0) && (e2Wc2 <= 0))) {
                resultOp = this.addLocalMinPoly(ae1, ae2, pt);
              }
              break;
  
            case ClipType.Xor:
              resultOp = this.addLocalMinPoly(ae1, ae2, pt);
              break;
  
            default: // ClipType.Intersection:
              if (e1Wc2 <= 0 || e2Wc2 <= 0) return;
              resultOp = this.addLocalMinPoly(ae1, ae2, pt);
              break;
          }
        }
      }
    }
  
    private swapPositionsInAEL(ae1: Active, ae2: Active): void {
      // preconditon: ae1 must be immediately to the left of ae2
      const next = ae2.nextInAEL;
      if (next !== null) next.prevInAEL = ae1;
      const prev = ae1.prevInAEL;
      if (prev !== null) prev.nextInAEL = ae2;
      ae2.prevInAEL = prev;
      ae2.nextInAEL = ae1;
      ae1.prevInAEL = ae2;
      ae1.nextInAEL = next;
      if (ae2.prevInAEL === null) this.actives = ae2;
    }
  
    private isValidAelOrder(resident: Active, newcomer: Active): boolean {
      if (newcomer.curX !== resident.curX) {
        return newcomer.curX > resident.curX;
      }
  
      // get the turning direction  a1.top, a2.bot, a2.top
      const d = InternalClipper.crossProduct(resident.top, newcomer.bot, newcomer.top);
      if (d !== 0) return d < 0;
  
      // edges must be collinear to get here
  
      // for starting open paths, place them according to
      // the direction they're about to turn
      if (!ClipperBase.isMaxima(resident) && (resident.top.y > newcomer.top.y)) {
        return InternalClipper.crossProduct(newcomer.bot,
          resident.top, ClipperBase.nextVertex(resident).pt) <= 0;
      }
  
      if (!ClipperBase.isMaxima(newcomer) && (newcomer.top.y > resident.top.y)) {
        return InternalClipper.crossProduct(newcomer.bot,
          newcomer.top, ClipperBase.nextVertex(newcomer).pt) >= 0;
      }
  
      const y = newcomer.bot.y;
      const newcomerIsLeft = newcomer.isLeftBound;
  
      if (resident.bot.y !== y || resident.localMin!.vertex.pt.y !== y) {
        return newcomer.isLeftBound;
      }
      // resident must also have just been inserted
      if (resident.isLeftBound !== newcomerIsLeft) {
        return newcomerIsLeft;
      }
      if (InternalClipper.isCollinear(ClipperBase.prevPrevVertex(resident).pt,
            resident.bot, resident.top)) return true;
      // compare turning direction of the alternate bound
      return (InternalClipper.crossProduct(ClipperBase.prevPrevVertex(resident).pt,
        newcomer.bot, ClipperBase.prevPrevVertex(newcomer).pt) > 0) === newcomerIsLeft;
    }
  
    private isJoined(e: Active): boolean {
      return e.joinWith !== JoinWith.None;
    }
  
    private split(e: Active, currPt: Point64): void {
      if (e.joinWith === JoinWith.Right) {
        e.joinWith = JoinWith.None;
        e.nextInAEL!.joinWith = JoinWith.None;
        this.addLocalMinPoly(e, e.nextInAEL!, currPt, true);
      } else {
        e.joinWith = JoinWith.None;
        e.prevInAEL!.joinWith = JoinWith.None;
        this.addLocalMinPoly(e.prevInAEL!, e, currPt, true);
      }
    }
  
    private setSides(outrec: OutRec, startEdge: Active, endEdge: Active): void {
      outrec.frontEdge = startEdge;
      outrec.backEdge = endEdge;
    }
  
    private findEdgeWithMatchingLocMin(e: Active): Active | null {
      let result = e.nextInAEL;
      while (result !== null) {
        if (result.localMin?.equals(e.localMin)) return result;
        if (!ClipperBase.isHorizontal(result) && !(e.bot.x === result.bot.x && e.bot.y === result.bot.y)) result = null;
        else result = result.nextInAEL;
      }
      result = e.prevInAEL;
      while (result !== null) {
        if (result.localMin?.equals(e.localMin)) return result;
        if (!ClipperBase.isHorizontal(result) && !(e.bot.x === result.bot.x && e.bot.y === result.bot.y)) return null;
        result = result.prevInAEL;
      }
      return result;
    }
  
    private addOutPt(ae: Active, pt: Point64): OutPt {
      // Outrec.OutPts: a circular doubly-linked-list of POutPt where ...
      // opFront[.Prev]* ~~~> opBack & opBack == opFront.Next
      const outrec = ae.outrec!;
      const toFront = ClipperBase.isFront(ae);
      const opFront = outrec.pts!;
      const opBack = opFront.next!;
  
      if (toFront && pt.x === opFront.pt.x && pt.y === opFront.pt.y) {
        return opFront;
      } else if (!toFront && pt.x === opBack.pt.x && pt.y === opBack.pt.y) {
        return opBack;
      }
  
      const newOp = new OutPt(pt, outrec);
      opBack.prev = newOp;
      newOp.prev = opFront;
      newOp.next = opBack;
      opFront.next = newOp;
      if (toFront) outrec.pts = newOp;
      return newOp;
    }
  
  private addLocalMaxPoly(ae1: Active, ae2: Active, pt: Point64): OutPt | null {
    if (this.isJoined(ae1)) this.split(ae1, pt);
    if (this.isJoined(ae2)) this.split(ae2, pt);

    if (ClipperBase.isFront(ae1) === ClipperBase.isFront(ae2)) {
      if (ClipperBase.isOpenEnd(ae1)) {
        this.swapFrontBackSides(ae1.outrec!);
      } else if (ClipperBase.isOpenEnd(ae2)) {
        this.swapFrontBackSides(ae2.outrec!);
      } else {
        this.succeeded = false;
        return null;
      }
    }
  
      const result = this.addOutPt(ae1, pt);
      if (ae1.outrec === ae2.outrec) {
        const outrec = ae1.outrec!;
        outrec.pts = result;
  
        if (this.usingPolytree) {
          const e = ClipperBase.getPrevHotEdge(ae1);
          if (e === null) {
            outrec.owner = null;
          } else {
            this.setOwner(outrec, e.outrec!);
          }
          // nb: outRec.owner here is likely NOT the real
          // owner but this will be fixed in DeepCheckOwner()
        }
        this.uncoupleOutRec(ae1);
      }
      // and to preserve the winding orientation of outrec ...
      else if (ClipperBase.isOpen(ae1)) {
        if (ae1.windDx < 0) {
          this.joinOutrecPaths(ae1, ae2);
        } else {
          this.joinOutrecPaths(ae2, ae1);
        }
      } else if (ae1.outrec!.idx < ae2.outrec!.idx) {
        this.joinOutrecPaths(ae1, ae2);
      } else {
        this.joinOutrecPaths(ae2, ae1);
      }
      return result;
    }
  
    private swapFrontBackSides(outrec: OutRec): void {
      // while this proc. is needed for open paths
      // it's almost never needed for closed paths
      const ae2 = outrec.frontEdge!;
      outrec.frontEdge = outrec.backEdge;
      outrec.backEdge = ae2;
      outrec.pts = outrec.pts!.next;
    }
  
  private setOwner(outrec: OutRec, newOwner: OutRec): void {
    //precondition1: new_owner is never null
    while (newOwner.owner !== null && newOwner.owner.pts === null) {
      newOwner.owner = newOwner.owner.owner;
    }

    //make sure that outrec isn't an owner of newOwner
    let tmp: OutRec | null = newOwner;
    while (tmp !== null && tmp !== outrec) {
      tmp = tmp.owner;
    }
    if (tmp !== null) {
      newOwner.owner = outrec.owner;
    }
    outrec.owner = newOwner;
  }
  
    private uncoupleOutRec(ae: Active): void {
      const outrec = ae.outrec;
      if (outrec === null) return;
      outrec.frontEdge!.outrec = null;
      outrec.backEdge!.outrec = null;
      outrec.frontEdge = null;
      outrec.backEdge = null;
    }
  
    private joinOutrecPaths(ae1: Active, ae2: Active): void {
      // join ae2 outrec path onto ae1 outrec path and then delete ae2 outrec path
      // pointers. (NB Only very rarely do the joining ends share the same coords.)
      const p1Start = ae1.outrec!.pts!;
      const p2Start = ae2.outrec!.pts!;
      const p1End = p1Start.next!;
      const p2End = p2Start.next!;
      if (ClipperBase.isFront(ae1)) {
        p2End.prev = p1Start;
        p1Start.next = p2End;
        p2Start.next = p1End;
        p1End.prev = p2Start;
        ae1.outrec!.pts = p2Start;
        // nb: if IsOpen(e1) then e1 & e2 must be a 'maximaPair'
        ae1.outrec!.frontEdge = ae2.outrec!.frontEdge;
        if (ae1.outrec!.frontEdge !== null) {
          ae1.outrec!.frontEdge!.outrec = ae1.outrec;
        }
      } else {
        p1End.prev = p2Start;
        p2Start.next = p1End;
        p1Start.next = p2End;
        p2End.prev = p1Start;
  
        ae1.outrec!.backEdge = ae2.outrec!.backEdge;
        if (ae1.outrec!.backEdge !== null) {
          ae1.outrec!.backEdge!.outrec = ae1.outrec;
        }
      }
  
      // after joining, the ae2.OutRec must contains no vertices ...
      ae2.outrec!.frontEdge = null;
      ae2.outrec!.backEdge = null;
      ae2.outrec!.pts = null;
      this.setOwner(ae2.outrec!, ae1.outrec!);
  
      if (ClipperBase.isOpenEnd(ae1)) {
        ae2.outrec!.pts = ae1.outrec!.pts;
        ae1.outrec!.pts = null;
      }
  
      // and ae1 and ae2 are maxima and are about to be dropped from the Actives list.
      ae1.outrec = null;
      ae2.outrec = null;
    }
  
    private swapOutrecs(ae1: Active, ae2: Active): void {
      const or1 = ae1.outrec; // at least one edge has 
      const or2 = ae2.outrec; // an assigned outrec
      if (or1 === or2) {
        const ae = or1!.frontEdge;
        or1!.frontEdge = or1!.backEdge;
        or1!.backEdge = ae;
        return;
      }
  
      if (or1 !== null) {
        if (ae1 === or1.frontEdge) {
          or1.frontEdge = ae2;
        } else {
          or1.backEdge = ae2;
        }
      }
  
      if (or2 !== null) {
        if (ae2 === or2.frontEdge) {
          or2.frontEdge = ae1;
        } else {
          or2.backEdge = ae1;
        }
      }
  
      ae1.outrec = or2;
      ae2.outrec = or1;
    }
  
    private disposeIntersectNodes(): void {
      this.intersectList.length = 0;
    }
  
    private static ptsReallyClose(pt1: Point64, pt2: Point64): boolean {
      return (Math.abs(pt1.x - pt2.x) < 2) && (Math.abs(pt1.y - pt2.y) < 2);
    }
  
    private static isVerySmallTriangle(op: OutPt): boolean {
      return op.next!.next === op.prev &&
        (ClipperBase.ptsReallyClose(op.prev.pt, op.next!.pt) ||
          ClipperBase.ptsReallyClose(op.pt, op.next!.pt) ||
          ClipperBase.ptsReallyClose(op.pt, op.prev.pt));
    }
  
    protected static buildPath(op: OutPt | null, reverse: boolean, isOpen: boolean, path: Path64): boolean {
      if (op === null || op.next === op || (!isOpen && op.next === op.prev)) return false;
      path.length = 0;
  
      let lastPt: Point64;
      let op2: OutPt;
      
      if (reverse) {
        lastPt = op.pt;
        op2 = op.prev;
      } else {
        op = op.next!;
        lastPt = op.pt;
        op2 = op.next!;
      }
      path.push(lastPt);
  
      while (op2 !== op) {
        if (!(op2.pt.x === lastPt.x && op2.pt.y === lastPt.y)) {
          lastPt = op2.pt;
          path.push(lastPt);
        }
        if (reverse) {
          op2 = op2.prev;
        } else {
          op2 = op2.next!;
        }
      }
  
      return path.length !== 3 || isOpen || !ClipperBase.isVerySmallTriangle(op2);
    }
  
  protected buildPaths(solutionClosed: Paths64, solutionOpen: Paths64): boolean {
    solutionClosed.length = 0;
    solutionOpen.length = 0;
    
    let i = 0;
    // outrecList.length is not static here because
    // CleanCollinear can indirectly add additional OutRec
    while (i < this.outrecList.length) {
      const outrec = this.outrecList[i++];
      if (outrec.pts === null) continue;

      const path: Path64 = [];
      if (outrec.isOpen) {
        if (ClipperBase.buildPath(outrec.pts, this.reverseSolution, true, path)) {
          solutionOpen.push(path);
        }
      } else {
        this.cleanCollinear(outrec);
        // closed paths should always return a Positive orientation
        // except when ReverseSolution == true
        if (ClipperBase.buildPath(outrec.pts, this.reverseSolution, false, path)) {
            solutionClosed.push(path);
          }
        }
      }
      return true;
    }
  
  protected buildTree(polytree: PolyPathBase, solutionOpen: Paths64): void {
    polytree.clear();
    solutionOpen.length = 0;

    let i = 0;
    // outrecList.length is not static here because
    // checkBounds below can indirectly add additional
    // OutRec (via FixOutRecPts & CleanCollinear)
    while (i < this.outrecList.length) {
      const outrec = this.outrecList[i++];
      if (outrec.pts === null) continue;

      if (outrec.isOpen) {
          const openPath: Path64 = [];
          if (ClipperBase.buildPath(outrec.pts, this.reverseSolution, true, openPath)) {
            solutionOpen.push(openPath);
          }
          continue;
        }
        
        if (this.checkBounds(outrec)) {
          this.recursiveCheckOwners(outrec, polytree);
        }
      }
    }
  
    protected checkBounds(outrec: OutRec): boolean {
      if (outrec.pts === null) return false;
      if (!Rect64Utils.isEmpty(outrec.bounds)) return true;
      this.cleanCollinear(outrec);
      if (outrec.pts === null ||
        !ClipperBase.buildPath(outrec.pts, this.reverseSolution, false, outrec.path)) {
          return false;
      }
      outrec.bounds = InternalClipper.getBounds(outrec.path);
      return true;
    }
  
    protected recursiveCheckOwners(outrec: OutRec, polypath: PolyPathBase): void {
      // pre-condition: outrec will have valid bounds
      // post-condition: if a valid path, outrec will have a polypath
  
      if (outrec.polypath !== null || Rect64Utils.isEmpty(outrec.bounds)) return;
  
      while (outrec.owner !== null) {
        if (outrec.owner.splits !== null && 
          this.checkSplitOwner(outrec, outrec.owner.splits)) break; 
        if (outrec.owner.pts !== null && this.checkBounds(outrec.owner) &&
          this.path1InsidePath2(outrec.pts!, outrec.owner.pts!)) break;
        outrec.owner = outrec.owner.owner;
      }
  
      if (outrec.owner !== null) {
        if (outrec.owner.polypath === null) {
          this.recursiveCheckOwners(outrec.owner, polypath);
        }
        outrec.polypath = outrec.owner.polypath!.addChild(outrec.path); 
      } else {
        outrec.polypath = polypath.addChild(outrec.path);
      }
    }
  
    protected cleanCollinear(outrec: OutRec | null): void {
      outrec = this.getRealOutRec(outrec);
      
      if (outrec === null || outrec.isOpen) return;
  
      if (!this.isValidClosedPath(outrec.pts)) {
        outrec.pts = null;
        return;
      }
  
      let startOp = outrec.pts!;
      let op2: OutPt | null = startOp;
      
      while (true) {
        // NB if preserveCollinear == true, then only remove 180 deg. spikes
        if (op2 !== null && InternalClipper.isCollinear(op2.prev.pt, op2.pt, op2.next!.pt) &&
          ((op2.pt.x === op2.prev.pt.x && op2.pt.y === op2.prev.pt.y) || 
           (op2.pt.x === op2.next!.pt.x && op2.pt.y === op2.next!.pt.y) || 
           !this.preserveCollinear ||
           InternalClipper.dotProduct(op2.prev.pt, op2.pt, op2.next!.pt) < 0)) {
          
          if (op2 === outrec.pts) {
            outrec.pts = op2.prev;
          }
          op2 = this.disposeOutPt(op2!);
          if (!this.isValidClosedPath(op2)) {
            outrec.pts = null;
            return;
          }
          startOp = op2!;
          continue;
        }
        if (op2 === null) break;
        op2 = op2.next!;
        if (op2 === startOp) break;
      }
      
      this.fixSelfIntersects(outrec);
    }
  
    private isValidClosedPath(op: OutPt | null): boolean {
      return op !== null && op.next !== op &&
        (op.next !== op.prev || !ClipperBase.isVerySmallTriangle(op));
    }
  
    private disposeOutPt(op: OutPt): OutPt | null {
      const result = (op.next === op ? null : op.next);
      op.prev.next = op.next;
      op.next!.prev = op.prev;
      return result;
    }
  
    private fixSelfIntersects(outrec: OutRec): void {
      let op2 = outrec.pts!;
      if (op2.prev === op2.next!.next) {
        return; // because triangles can't self-intersect
      }
      
      while (true) {
        if (op2.next && op2.next.next && 
            // optimization (not in C# reference): bbox check before segsIntersect  
            this.boundingBoxesOverlap(op2.prev.pt, op2.pt, op2.next.pt, op2.next.next.pt) && // TEST: Bbox only
            InternalClipper.segsIntersect(op2.prev.pt, op2.pt, op2.next.pt, op2.next.next.pt)) {
          if (op2.next.next.next && 
              // optimization (not in C# reference): bbox check before segsIntersect
              this.boundingBoxesOverlap(op2.prev.pt, op2.pt, op2.next.next.pt, op2.next.next.next.pt) && // TEST: Bbox only
              InternalClipper.segsIntersect(op2.prev.pt, op2.pt, op2.next.next.pt, op2.next.next.next.pt)) {
            // adjacent intersections (ie a micro self-intersection)
            op2 = this.duplicateOp(op2, false);
            op2.pt = op2.next!.next!.next!.pt;
            op2 = op2.next!;
          } else {
            if (op2 === outrec.pts || op2.next === outrec.pts) {
              outrec.pts = outrec.pts!.prev;
            }
            this.doSplitOp(outrec, op2);
            if (outrec.pts === null) return;
            op2 = outrec.pts;
            // triangles can't self-intersect
            if (op2.prev === op2.next!.next) break;
            continue;
          }
        }
  
        op2 = op2.next!;
        if (op2 === outrec.pts) break;
      }
    }
  
  private doSplitOp(outrec: OutRec, splitOp: OutPt): void {
    // splitOp.prev <=> splitOp &&
    // splitOp.next <=> splitOp.next.next are intersecting
    const prevOp = splitOp.prev;
    const nextNextOp = splitOp.next!.next!;
    outrec.pts = prevOp;

    const intersectResult = InternalClipper.getLineIntersectPt(
      prevOp.pt, splitOp.pt, splitOp.next!.pt, nextNextOp.pt);
    
    const ip = intersectResult.point;

    const area1 = ClipperBase.areaOutPt(prevOp);
    const absArea1 = Math.abs(area1);
    
    if (absArea1 < 2) {
      outrec.pts = null;
      return;
    }

    const area2 = this.areaTriangle(ip, splitOp.pt, splitOp.next!.pt);
    const absArea2 = Math.abs(area2);

    // de-link splitOp and splitOp.next from the path
    // while inserting the intersection point
    if ((ip.x === prevOp.pt.x && ip.y === prevOp.pt.y) || (ip.x === nextNextOp.pt.x && ip.y === nextNextOp.pt.y)) {
      nextNextOp.prev = prevOp;
      prevOp.next = nextNextOp;
    } else {
      const newOp2 = new OutPt(ip, outrec);
      newOp2.prev = prevOp;
      newOp2.next = nextNextOp;
      nextNextOp.prev = newOp2;
      prevOp.next = newOp2;
    }

    if (!(absArea2 > 1) ||
        (!(absArea2 > absArea1) &&
         ((area2 > 0) !== (area1 > 0)))) return;
         
    const newOutRec = this.newOutRec();
    newOutRec.owner = outrec.owner;
    splitOp.outrec = newOutRec;
    splitOp.next!.outrec = newOutRec;

    const newOp = new OutPt(ip, newOutRec);
    newOp.prev = splitOp.next!;
    newOp.next = splitOp;
    newOutRec.pts = newOp;
    splitOp.prev = newOp;
    splitOp.next!.next = newOp;
  
      if (!this.usingPolytree) return;
      
      if (this.path1InsidePath2(prevOp, newOp)) {
        if (newOutRec.splits === null) newOutRec.splits = [];
        newOutRec.splits.push(outrec.idx);
      } else {
        if (outrec.splits === null) outrec.splits = [];
        outrec.splits.push(newOutRec.idx);
      }
    }
  
    private static areaOutPt(op: OutPt): number {
      // https://en.wikipedia.org/wiki/Shoelace_formula
      let area = 0.0;
      let op2 = op;
      do {
        area += (op2.prev.pt.y + op2.pt.y) * (op2.prev.pt.x - op2.pt.x);
        op2 = op2.next!;
      } while (op2 !== op);
      return area * 0.5;
    }
  
    private areaTriangle(pt1: Point64, pt2: Point64, pt3: Point64): number {
      return ((pt3.y + pt1.y) * (pt3.x - pt1.x) +
        (pt1.y + pt2.y) * (pt1.x - pt2.x) +
        (pt2.y + pt3.y) * (pt2.x - pt3.x));
    }
  
    private isValidOwner(outRec: OutRec | null, testOwner: OutRec | null): boolean {
      while (testOwner !== null && testOwner !== outRec) {
        testOwner = testOwner.owner;
      }
      return testOwner === null;
    }
  
    private containsRect(rect: Rect64, rec: Rect64): boolean {
      return rec.left >= rect.left && rec.right <= rect.right &&
        rec.top >= rect.top && rec.bottom <= rect.bottom;
    }
  
  private checkSplitOwner(outrec: OutRec, splits: number[]): boolean {
    // nb: use indexing (not an iterator) in case 'splits' is modified inside this loop (#1029)
    for (let i = 0; i < splits.length; i++) {
      let split: OutRec | null = this.outrecList[splits[i]];
      if (split.pts === null && split.splits !== null &&
        this.checkSplitOwner(outrec, split.splits)) return true; // #942
      split = this.getRealOutRec(split);
      if (split === null || split === outrec || split.recursiveSplit === outrec) continue;
      split.recursiveSplit = outrec; // #599
      
      if (split.splits !== null && this.checkSplitOwner(outrec, split.splits)) return true;
  
        if (!this.checkBounds(split) ||
            !this.containsRect(split.bounds, outrec.bounds) ||
            !this.path1InsidePath2(outrec.pts!, split.pts!)) continue;
  
        if (!this.isValidOwner(outrec, split)) { // split is owned by outrec (#957)
          split.owner = outrec.owner;
        }
  
        outrec.owner = split; // found in split
        return true;
      }
      return false;
    }
  }
  
  export class Clipper64 extends ClipperBase {
    public addPath(path: Path64, polytype: PathType, isOpen: boolean = false): void {
      super.addPath(path, polytype, isOpen);
    }
  
    public addReuseableData(reuseableData: ReuseableDataContainer64): void {
      super.addReuseableData(reuseableData);
    }
  
  public addPaths(paths: Paths64, polytype: PathType, isOpen: boolean = false): void {
    super.addPaths(paths, polytype, isOpen);
  }
  
    public addSubject(paths: Paths64): void {
      this.addPaths(paths, PathType.Subject);
    }
  
    public addOpenSubject(paths: Paths64): void {
      this.addPaths(paths, PathType.Subject, true);
    }
  
    public addClip(paths: Paths64): void {
      this.addPaths(paths, PathType.Clip);
    }
  
    public execute(clipType: ClipType, fillRule: FillRule, solutionClosed: Paths64, solutionOpen?: Paths64): boolean;
    public execute(clipType: ClipType, fillRule: FillRule, polytree: PolyTree64, openPaths?: Paths64): boolean;
    public execute(clipType: ClipType, fillRule: FillRule, solutionOrTree: Paths64 | PolyTree64, openPathsOrSolutionOpen?: Paths64): boolean {
      if (Array.isArray(solutionOrTree)) {
        // Paths64 version
        const solutionClosed = solutionOrTree;
        const solutionOpen = openPathsOrSolutionOpen;
        
        solutionClosed.length = 0;
        if (solutionOpen) solutionOpen.length = 0;
        
        try {
          this.executeInternal(clipType, fillRule);
          this.buildPaths(solutionClosed, solutionOpen || []);
        } catch {
          this.succeeded = false;
        }
        
        this.clearSolutionOnly();
        return this.succeeded;
      } else {
        // PolyTree64 version
        const polytree = solutionOrTree;
        const openPaths = openPathsOrSolutionOpen;
        
        polytree.clear();
        if (openPaths) openPaths.length = 0;
        this.usingPolytree = true;
        
        try {
          this.executeInternal(clipType, fillRule);
          this.buildTree(polytree, openPaths || []);
        } catch {
          this.succeeded = false;
        }
        
        this.clearSolutionOnly();
        return this.succeeded;
      }
    }
  }
  
  export class ClipperD extends ClipperBase {
    private readonly scale: number;
    private readonly invScale: number;
  
    constructor(roundingDecimalPrecision: number = 2) {
      super();
      InternalClipper.checkPrecision(roundingDecimalPrecision);
      this.scale = Math.pow(10, roundingDecimalPrecision);
      this.invScale = 1 / this.scale;
    }
  
    private scalePathDFromInt(path: Path64, scale: number): PathD {
      const result: PathD = [];
      for (const pt of path) {
        result.push({
          x: pt.x * scale,
          y: pt.y * scale
        });
      }
      return result;
    }
  
    public buildPathsD(solutionClosed: PathsD, solutionOpen: PathsD): boolean {
      solutionClosed.length = 0;
      solutionOpen.length = 0;
      
      let i = 0;
      // outrecList.length is not static here because
      // CleanCollinear can indirectly add additional OutRec
      while (i < this.outrecList.length) {
        const outrec = this.outrecList[i++];
        if (outrec.pts === null) continue;
  
        const path: Path64 = [];
        if (outrec.isOpen) {
          if (ClipperBase.buildPath(outrec.pts, this.reverseSolution, true, path)) {
            solutionOpen.push(this.scalePathDFromInt(path, this.invScale));
          }
        } else {
          this.cleanCollinear(outrec);
          // closed paths should always return a Positive orientation
          // except when ReverseSolution == true
          if (ClipperBase.buildPath(outrec.pts, this.reverseSolution, false, path)) {
            solutionClosed.push(this.scalePathDFromInt(path, this.invScale));
          }
        }
      }
      return true;
    }
  
    public buildTreeD(polytree: PolyPathBase, solutionOpen: PathsD): void {
      polytree.clear();
      solutionOpen.length = 0;
  
      let i = 0;
      // outrecList.length is not static here because
      // BuildPathD below can indirectly add additional OutRec
      while (i < this.outrecList.length) {
        const outrec = this.outrecList[i++];
        if (outrec.pts === null) continue;
        
        if (outrec.isOpen) {
          const openPath: Path64 = [];
          if (ClipperBase.buildPath(outrec.pts, this.reverseSolution, true, openPath)) {
            solutionOpen.push(this.scalePathDFromInt(openPath, this.invScale));
          }
          continue;
        }
        
        if (this.checkBounds(outrec)) {
          this.recursiveCheckOwners(outrec, polytree);
        }
      }
    }
  
    public addPath(path: PathD, polytype: PathType, isOpen: boolean = false): void {
      super.addPath(Clipper.scalePath64(path, this.scale), polytype, isOpen);
    }
  
    public addPaths(paths: PathsD, polytype: PathType, isOpen: boolean = false): void {
      super.addPaths(Clipper.scalePaths64(paths, this.scale), polytype, isOpen);
    }
  
    public addSubject(path: PathD): void {
      this.addPath(path, PathType.Subject);
    }
  
    public addOpenSubject(path: PathD): void {
      this.addPath(path, PathType.Subject, true);
    }
  
    public addClip(path: PathD): void {
      this.addPath(path, PathType.Clip);
    }
  
    public addSubjectPaths(paths: PathsD): void {
      this.addPaths(paths, PathType.Subject);
    }
  
    public addOpenSubjectPaths(paths: PathsD): void {
      this.addPaths(paths, PathType.Subject, true);
    }
  
    public addClipPaths(paths: PathsD): void {
      this.addPaths(paths, PathType.Clip);
    }
  
    public execute(clipType: ClipType, fillRule: FillRule, solutionClosed: PathsD, solutionOpen?: PathsD): boolean;
    public execute(clipType: ClipType, fillRule: FillRule, polytree: PolyTreeD, openPaths?: PathsD): boolean;
    public execute(clipType: ClipType, fillRule: FillRule, solutionOrTree: PathsD | PolyTreeD, openPathsOrSolutionOpen?: PathsD): boolean {
      if (Array.isArray(solutionOrTree)) {
        // PathsD version - match C# implementation exactly
        const solutionClosed = solutionOrTree;
        const solutionOpen = openPathsOrSolutionOpen;
        
        // Use Paths64 internally like C# does
        const solClosed64: Paths64 = [];
        const solOpen64: Paths64 = [];
        
        solutionClosed.length = 0;
        if (solutionOpen) solutionOpen.length = 0;
        
        let success = true;
        try {
          this.executeInternal(clipType, fillRule);
          // Call regular buildPaths which includes cleanCollinear and fixSelfIntersects
          this.buildPaths(solClosed64, solOpen64);
        } catch {
          success = false;
        }
        
        this.clearSolutionOnly();
        if (!success) return false;
        
        // Convert Paths64 to PathsD
        for (const path of solClosed64) {
          solutionClosed.push(this.scalePathDFromInt(path, this.invScale));
        }
        if (solutionOpen) {
          for (const path of solOpen64) {
            solutionOpen.push(this.scalePathDFromInt(path, this.invScale));
          }
        }
        
        return true;
      } else {
        // PolyTreeD version
        const polytree = solutionOrTree;
        const openPaths = openPathsOrSolutionOpen;
        
        polytree.clear();
        if (openPaths) openPaths.length = 0;
        this.usingPolytree = true;
        polytree.scale = this.scale;
        
        let success = true;
        try {
          this.executeInternal(clipType, fillRule);
          this.buildTreeD(polytree, openPaths || []);
        } catch {
          success = false;
        }
        this.clearSolutionOnly();
        return success;
      }
    }
  }
  
  // Forward declaration for Clipper class
  export namespace Clipper {
    export function area(path: Path64): number {
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
  
    export function areaD(path: PathD): number {
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
  
    export function scalePath64(path: PathD, scale: number): Path64 {
      const result: Path64 = [];
      for (const pt of path) {
        result.push({
          x: Math.round(pt.x * scale),
          y: Math.round(pt.y * scale)
        });
      }
      return result;
    }
  
    export function scalePaths64(paths: PathsD, scale: number): Paths64 {
      const result: Paths64 = [];
      for (const path of paths) {
        result.push(scalePath64(path, scale));
      }
      return result;
    }
  
    export function scalePathD(path: Path64, scale: number): PathD {
      const result: PathD = [];
      for (const pt of path) {
        result.push({
          x: pt.x * scale,
          y: pt.y * scale
        });
      }
      return result;
    }
  
    export function scalePathsD(paths: Paths64, scale: number): PathsD {
      const result: PathsD = [];
      for (const path of paths) {
        result.push(scalePathD(path, scale));
      }
      return result;
    }
  }
  