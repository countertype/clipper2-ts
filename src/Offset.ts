/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Path Offset (Inflate/Shrink)                                    *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import {
  Point64, PointD, Path64, PathD, Paths64, Rect64,
  ClipType, FillRule, PointInPolygonResult,
  Point64Utils, PointDUtils, InternalClipper
} from './Core.js';
import { Clipper64, PolyTree64 } from './Engine.js';

export enum JoinType {
  Miter = 0,
  Square = 1,
  Bevel = 2,
  Round = 3
}

export enum EndType {
  Polygon = 0,
  Joined = 1,
  Butt = 2,
  Square = 3,
  Round = 4
}

// a path's area, as its exact sign and twice its magnitude
interface ExactArea {
  sign: number;
  twiceMagnitude: number;
}

function exactArea(path: Path64): ExactArea {
  const cnt = path.length;
  let minX = path[0].x, maxX = minX, minY = path[0].y, maxY = minY;
  let allSafe = true;
  for (let i = 0; i < cnt; i++) {
    const pt = path[i];
    if (pt.x < minX) minX = pt.x; else if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y; else if (pt.y > maxY) maxY = pt.y;
    if (allSafe && !(Number.isSafeInteger(pt.x) && Number.isSafeInteger(pt.y))) allSafe = false;
  }

  // TS: C++ always sums in 128 bits. Here the area is taken relative to the path's own
  // corner, which doesn't change it, so the size of the products depends on the path's
  // extent and not on how far it is from the origin. The shoelace sum is then exact in
  // doubles while every partial sum stays a safe integer, which covers most paths.
  // Coordinates that are not safe integers (the library's contract, but not checked
  // here) are summed in doubles too, as InternalClipper.area does.
  const span = Math.max(maxX - minX, maxY - minY);
  if (!allSafe || 2 * cnt * span * span < Number.MAX_SAFE_INTEGER) {
    let sum = 0;
    let px = path[cnt - 1].x - minX, py = path[cnt - 1].y - minY;
    for (let i = 0; i < cnt; i++) {
      const x = path[i].x - minX, y = path[i].y - minY;
      sum += px * y - x * py;
      px = x;
      py = y;
    }
    if (sum < 0) return { sign: -1, twiceMagnitude: -sum };
    return { sign: sum > 0 ? 1 : 0, twiceMagnitude: sum };
  }

  // The products no longer fit a double, so BigInt carries the sum, as intermediate
  // arithmetic only. The sign is exact. The magnitude is returned as a number: exact
  // up to 2^53, the nearest double above that, where two paths would have to agree
  // to 16 digits without being equal for their order to differ from C++.
  let twice = BigInt(0);
  for (let i = 0, j = cnt - 1; i < cnt; j = i++) {
    twice += BigInt(path[j].x) * BigInt(path[i].y) - BigInt(path[i].x) * BigInt(path[j].y);
  }
  if (twice < 0) return { sign: -1, twiceMagnitude: Number(-twice) };
  return { sign: twice > 0 ? 1 : 0, twiceMagnitude: Number(twice) };
}

// true when path lies inside a container, judged by the first of its vertices that locate
// doesn't put on the container's edge. A path touching it at every vertex counts as inside.
function isInside(path: Path64, locate: (pt: Point64) => PointInPolygonResult): boolean {
  for (const pt of path) {
    const pip = locate(pt);
    if (pip !== PointInPolygonResult.IsOn) return pip === PointInPolygonResult.IsInside;
  }
  return true;
}

// true when any vertex of path is inside a container, or all of them are on its edge
function hasVertexInside(path: Path64, locate: (pt: Point64) => PointInPolygonResult): boolean {
  let allOn = true;
  for (const pt of path) {
    const pip = locate(pt);
    if (pip === PointInPolygonResult.IsInside) return true;
    if (pip === PointInPolygonResult.IsOutside) allOn = false;
  }
  return allOn;
}

// true when every vertex lies on one line, so the path encloses no area
function isFlat(path: Path64): boolean {
  const cnt = path.length;
  const pt0 = path[0];
  let i = 1;
  while (i < cnt && path[i].x === pt0.x && path[i].y === pt0.y) i++;
  if (i === cnt) return true;

  const pt1 = path[i];
  for (i++; i < cnt; i++) {
    if (InternalClipper.crossProductSign(pt0, pt1, path[i]) !== 0) return false;
  }
  return true;
}

interface BoundsNode {
  left: number;
  top: number;
  right: number;
  bottom: number;
  first: number;
  count: number;
  activeCount: number;
}

// each node covers a run of items, which index the nodes of the level below, or the boxes,
// and parents maps each of those to the node covering it
interface BoundsLevel {
  items: number[];
  parents: number[];
  nodes: BoundsNode[];
}

// A static R-tree, packed by sorting the boxes into tiles. Tiling by rank rather than by
// coordinate keeps it balanced however the boxes cluster. Boxes can be marked active, and each
// node counts its active boxes, so a query for active boxes skips whole subtrees of the others.
class BoundsTree {
  private static readonly nodeSize = 16;
  private readonly boxes: Rect64[];
  private readonly isActive: boolean[];
  private readonly levels: BoundsLevel[] = [];

  constructor(boxes: Rect64[]) {
    this.boxes = boxes;
    this.isActive = new Array<boolean>(boxes.length).fill(false);
    const nodeSize = BoundsTree.nodeSize;
    let rects: Rect64[] = boxes;

    while (rects.length > 0) {
      const items = BoundsTree.tileOrder(rects);
      const parents = new Array<number>(rects.length);
      const nodes: BoundsNode[] = [];

      for (let first = 0; first < items.length; first += nodeSize) {
        const count = Math.min(nodeSize, items.length - first);
        const node: BoundsNode = {
          left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity,
          first, count, activeCount: 0
        };

        for (let i = first; i < first + count; i++) {
          const r = rects[items[i]];
          if (r.left < node.left) node.left = r.left;
          if (r.top < node.top) node.top = r.top;
          if (r.right > node.right) node.right = r.right;
          if (r.bottom > node.bottom) node.bottom = r.bottom;
          parents[items[i]] = nodes.length;
        }
        nodes.push(node);
      }

      this.levels.push({ items, parents, nodes });
      if (nodes.length === 1) break;
      rects = nodes;
    }
  }

  public setActive(box: number, isActive: boolean): void {
    if (this.isActive[box] === isActive) return;

    this.isActive[box] = isActive;
    let item = box;
    for (const level of this.levels) {
      item = level.parents[item];
      level.nodes[item].activeCount += isActive ? 1 : -1;
    }
  }

  // calls fn with the index of every box that meets, or of every active one, where meets must
  // also hold for every box enclosing one that it holds for
  public query(meets: (r: Rect64) => boolean, fn: (box: number) => void, activeOnly: boolean = false): void {
    const levels = this.levels;
    if (levels.length === 0) return;

    const stackLevel: number[] = [];
    const stackNode: number[] = [];
    const top = levels.length - 1;
    for (let i = 0; i < levels[top].nodes.length; i++) {
      stackLevel.push(top);
      stackNode.push(i);
    }

    while (stackLevel.length > 0) {
      const levelIdx = stackLevel.pop()!;
      const level = levels[levelIdx];
      const node = level.nodes[stackNode.pop()!];

      if ((activeOnly && node.activeCount === 0) || !meets(node)) continue;

      for (let i = node.first; i < node.first + node.count; i++) {
        const item = level.items[i];
        if (levelIdx > 0) {
          stackLevel.push(levelIdx - 1);
          stackNode.push(item);
        } else if ((!activeOnly || this.isActive[item]) && meets(this.boxes[item])) {
          fn(item);
        }
      }
    }
  }

  // sorts by x into vertical slices about as many as there are tiles per slice, then by y
  private static tileOrder(rects: Rect64[]): number[] {
    const cnt = rects.length;
    const nodeSize = BoundsTree.nodeSize;
    const midX = new Array<number>(cnt);
    const midY = new Array<number>(cnt);
    const order = new Array<number>(cnt);
    for (let i = 0; i < cnt; i++) {
      midX[i] = rects[i].left / 2.0 + rects[i].right / 2.0;
      midY[i] = rects[i].top / 2.0 + rects[i].bottom / 2.0;
      order[i] = i;
    }
    order.sort((a, b) => midX[a] - midX[b]);

    const tiles = Math.floor((cnt + nodeSize - 1) / nodeSize);
    const slices = Math.ceil(Math.sqrt(tiles));
    const sliceLen = Math.floor((tiles + slices - 1) / slices) * nodeSize;
    if (sliceLen >= cnt) return order.sort((a, b) => midY[a] - midY[b]);

    const result: number[] = [];
    for (let first = 0; first < cnt; first += sliceLen) {
      const slice = order.slice(first, Math.min(first + sliceLen, cnt));
      slice.sort((a, b) => midY[a] - midY[b]);
      for (const i of slice) result.push(i);
    }
    return result;
  }
}

// Locates points in one polygon with the same result as PointInPolygon, but visits only the
// edges whose bounds hold the point, then those crossing the point's y to its left. The
// even-odd parity of a point off the edges doesn't depend on which ray counts the crossings.
class PolygonIndex {
  private readonly polygon: Path64;
  private readonly edges: BoundsTree;

  constructor(polygon: Path64) {
    this.polygon = polygon;
    const cnt = polygon.length;
    const bounds: Rect64[] = new Array<Rect64>(cnt);
    for (let i = 0; i < cnt; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1 === cnt) ? 0 : i + 1];
      bounds[i] = {
        left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
        right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y)
      };
    }
    this.edges = new BoundsTree(bounds);
  }

  public locate(pt: Point64): PointInPolygonResult {
    const polygon = this.polygon;
    const cnt = polygon.length;
    let isOn = false;

    this.edges.query(
      (r) => !isOn && r.left <= pt.x && r.right >= pt.x && r.top <= pt.y && r.bottom >= pt.y,
      (i) => {
        isOn = InternalClipper.crossProductSign(polygon[i], polygon[(i + 1 === cnt) ? 0 : i + 1], pt) === 0;
      });

    if (isOn) return PointInPolygonResult.IsOn;

    // with a half-open rule, an edge lying along the ray never crosses it
    let inside = false;

    this.edges.query(
      (r) => r.left <= pt.x && r.top <= pt.y && r.bottom > pt.y,
      (i) => {
        const a = polygon[i];
        const b = polygon[(i + 1 === cnt) ? 0 : i + 1];
        const d = InternalClipper.crossProductSign(a, b, pt);
        if ((a.y > pt.y) !== (b.y > pt.y) && ((a.y < b.y) ? d < 0 : d > 0)) inside = !inside;
      });

    return inside ? PointInPolygonResult.IsInside : PointInPolygonResult.IsOutside;
  }
}

// Locates points in a set of polygons. A large polygon gets an edge index on its first use, since
// many small paths may be tested against it.
class PolygonLocator {
  private readonly indexes: (PolygonIndex | undefined)[];

  constructor(count: number) {
    this.indexes = new Array<PolygonIndex | undefined>(count);
  }

  public locate(pt: Point64, polygon: Path64, polygonIdx: number): PointInPolygonResult {
    if (polygon.length < 64) return InternalClipper.pointInPolygon(pt, polygon);

    let index = this.indexes[polygonIdx];
    if (index === undefined) {
      index = new PolygonIndex(polygon);
      this.indexes[polygonIdx] = index;
    }
    return index.locate(pt);
  }
}

class Group {
  public inPaths: Paths64;
  public joinType: JoinType;
  public endType: EndType;
  public areas: ExactArea[] = []; // of each path in a polygon group
  public outerIdx: number = 0; // the largest closed path
  public outerSign: number = 0; // sign of the largest closed path's area, 0 if none
  public isStray: boolean[] | null = null; // holes no outer encloses, null if there are none
  public pathsReversed: boolean = false;

  constructor(paths: Paths64, joinType: JoinType, endType: EndType = EndType.Polygon) {
    this.joinType = joinType;
    this.endType = endType;

    const isJoined = (endType === EndType.Polygon) || (endType === EndType.Joined);
    this.inPaths = [];
    for (const path of paths) {
      const stripped = ClipperOffset.stripDuplicates(path, isJoined);
      // the offset code assumes every path has at least one vertex
      if (stripped.length > 0) this.inPaths.push(stripped);
    }

    if (endType !== EndType.Polygon) return;

    // sizes compare exactly, so paths of nearly equal size rank the same however they're wound.
    // The first path wins a tie.
    let largest = 0;
    for (let i = 0; i < this.inPaths.length; i++) {
      const a = exactArea(this.inPaths[i]);
      this.areas.push(a);
      if (a.twiceMagnitude > largest) {
        largest = a.twiceMagnitude;
        this.outerSign = a.sign;
        this.outerIdx = i;
      }
    }
  }

  public isStrayPath(pathIdx: number): boolean {
    return this.isStray !== null && this.isStray[pathIdx];
  }
}

export class ClipperOffset {
  private static readonly Tolerance = 1.0E-12;

  // Clipper2 approximates arcs by using series of relatively short straight
  //line segments. And logically, shorter line segments will produce better arc
  // approximations. But very short segments can degrade performance, usually
  // with little or no discernable improvement in curve quality. Very short
  // segments can even detract from curve quality, due to the effects of integer
  // rounding. Since there isn't an optimal number of line segments for any given
  // arc radius (that perfectly balances curve approximation with performance),
  // arc tolerance is user defined. Nevertheless, when the user doesn't define
  // an arc tolerance (ie leaves alone the 0 default value), the calculated
  // default arc tolerance (offset_radius / 500) generally produces good (smooth)
  // arc approximations without producing excessively small segment lengths.
  // See also: https://www.angusj.com/clipper2/Docs/Trigonometry.htm
  private static readonly arc_const = 0.002; // <-- 1/500

  private readonly groupList: Group[] = [];
  private pathOut: Path64 = [];
  private readonly normals: PathD = [];
  private solution: Paths64 = [];
  private solutionTree: PolyTree64 | null = null;

  private groupDelta: number = 0; //*0.5 for open paths; *-1.0 for negative areas
  private delta: number = 0;
  private mitLimSqr: number = 0;
  private stepsPerRad: number = 0;
  private stepSin: number = 0;
  private stepCos: number = 0;
  private joinType: JoinType = JoinType.Bevel;

  public arcTolerance: number = 0;
  public mergeGroups: boolean = true;
  public miterLimit: number = 2.0;
  public preserveCollinear: boolean = false;
  public reverseSolution: boolean = false;
  public zCallback?: (bot1: Point64, top1: Point64, bot2: Point64, top2: Point64, intersectPt: Point64) => void;

  public deltaCallback: ((path: Path64, pathNorms: PathD, currPt: number, prevPt: number) => number) | null = null;

  constructor(
    miterLimit: number = 2.0,
    arcTolerance: number = 0.0,
    preserveCollinear: boolean = false,
    reverseSolution: boolean = false
  ) {
    this.miterLimit = miterLimit;
    this.arcTolerance = arcTolerance;
    this.mergeGroups = true;
    this.preserveCollinear = preserveCollinear;
    this.reverseSolution = reverseSolution;
  }

  public clear(): void {
    this.groupList.length = 0;
  }

  // Internal Z callback that implements default Z handling before calling user callback
  private ZCB = (bot1: Point64, top1: Point64, bot2: Point64, top2: Point64, intersectPt: Point64): void => {
    // Default Z handling: if endpoints share a Z value, use it
    if ((bot1.z || 0) !== 0 && ((bot1.z === bot2.z) || (bot1.z === top2.z))) {
      intersectPt.z = bot1.z;
    } else if ((bot2.z || 0) !== 0 && bot2.z === top1.z) {
      intersectPt.z = bot2.z;
    } else if ((top1.z || 0) !== 0 && top1.z === top2.z) {
      intersectPt.z = top1.z;
    } else if (this.zCallback) {
      // Fall back to user callback if no default applies
      this.zCallback(bot1, top1, bot2, top2, intersectPt);
    }
  }

  public addPath(path: Path64, joinType: JoinType, endType: EndType): void {
    if (path.length === 0) return;
    const pp: Paths64 = [path];
    this.addPaths(pp, joinType, endType);
  }

  public addPaths(paths: Paths64, joinType: JoinType, endType: EndType): void {
    if (paths.length === 0) return;
    this.groupList.push(new Group(paths, joinType, endType));
  }

  private calcSolutionCapacity(): number {
    let result = 0;
    for (const g of this.groupList) {
      result += (g.endType === EndType.Joined) ? g.inPaths.length * 2 : g.inPaths.length;
    }
    return result;
  }

  private setGroupOrientations(): void {
    // a group's outers share the orientation of its largest closed path, which a hole touching
    // its outer or a stray sliver left by clipping can't outweigh. Flagging groups as 'reversed'
    // (negating delta etc.) is much more efficient than reversing every path.
    const groups = this.groupList;
    let hasCcw = false, hasCw = false, hasHoles = false;

    for (const g of groups) {
      g.pathsReversed = g.outerSign < 0;
      g.isStray = null;
      hasCcw = hasCcw || (g.outerSign > 0);
      hasCw = hasCw || (g.outerSign < 0);

      for (let j = 0; j < g.areas.length && !hasHoles; j++) {
        const sign = g.areas[j].sign;
        hasHoles = sign !== 0 && sign !== g.outerSign;
      }
    }

    // only a group wound against another can hold that group's holes
    const isMixed = hasCcw && hasCw;

    if (!isMixed && !hasHoles) return;

    // TS: the lists below are only built once it's known they are needed
    const sizes: number[] = [];      // of each path with area, over all groups
    const groupIdxs: number[] = [];  // its group
    const pathIdxs: number[] = [];   // and its index in that group
    const bounds: Rect64[] = [];
    const groupEnds: number[] = [];  // where each group's paths end in the lists above
    const outerRefs = new Array<number>(groups.length).fill(0); // each group's largest path

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      for (let j = 0; j < g.areas.length; j++) {
        if (g.areas[j].sign === 0) continue;
        if (j === g.outerIdx) outerRefs[i] = sizes.length;

        sizes.push(g.areas[j].twiceMagnitude);
        groupIdxs.push(i);
        pathIdxs.push(j);
        bounds.push(InternalClipper.getBounds(g.inPaths[j]));
      }
      groupEnds.push(sizes.length);
    }

    // A group wound against another holds that group's holes when its largest path lies inside one
    // of that group's outers, and the innermost enclosing path decides, so a group inside another
    // group's hole stays an island. A hole that no outer at least as large encloses is stray and
    // contributes nothing, since offsetting it alone would leave the loops its concave joins add.
    // Each decision depends only on paths at least as large, so settling from the largest path down,
    // with a group's own largest path first among equals, settles everything in one pass whatever
    // the AddPaths order. Without mixed orientations no group turns into holes, so any order will do.
    const cnt = sizes.length;
    const order = new Array<number>(cnt);
    for (let i = 0; i < cnt; i++) order[i] = i;

    const isGroupOuter = (i: number): boolean => pathIdxs[i] === groups[groupIdxs[i]].outerIdx;

    if (isMixed) {
      order.sort((a, b) => {
        if (sizes[a] > sizes[b]) return -1;
        if (sizes[a] < sizes[b]) return 1;
        const oa = isGroupOuter(a), ob = isGroupOuter(b);
        return oa === ob ? 0 : (oa ? -1 : 1);
      });
    }

    const pathOf = (i: number): Path64 => groups[groupIdxs[i]].inPaths[pathIdxs[i]];
    const signOf = (i: number): number => groups[groupIdxs[i]].areas[pathIdxs[i]].sign;
    const isOuter = (i: number): boolean => (signOf(i) < 0) === groups[groupIdxs[i]].pathsReversed;

    // the outers are active, so a hole looking for one skips the holes around it. Holes inside
    // their own group's outer don't need the tree at all.
    let tree: BoundsTree | null = null;
    const getTree = (): BoundsTree => {
      if (tree !== null) return tree;
      tree = new BoundsTree(bounds);
      for (let i = 0; i < cnt; i++) tree.setActive(i, isOuter(i));
      return tree;
    };

    const locator = new PolygonLocator(cnt);
    const locateIn = (i: number) => (pt: Point64): PointInPolygonResult => locator.locate(pt, pathOf(i), i);

    for (const k of order) {
      const groupIdx = groupIdxs[k];
      const g = groups[groupIdx];
      const path = pathOf(k);
      const pb = bounds[k];

      if (pathIdxs[k] === g.outerIdx) {
        if (!isMixed) continue;

        const enclosers: number[] = [];
        getTree().query(
          (r) => pb.left >= r.left && pb.right <= r.right && pb.top >= r.top && pb.bottom <= r.bottom,
          (i) => {
            if (groupIdxs[i] !== groupIdx && sizes[i] > sizes[k] &&
              !groups[groupIdxs[i]].isStrayPath(pathIdxs[i])) enclosers.push(i);
          });

        // smallest first, since only the smallest few enclosers are usually needed
        enclosers.sort((a, b) => sizes[a] < sizes[b] ? -1 : (sizes[a] > sizes[b] ? 1 : 0));
        let innermost = cnt;
        let isHole = false;

        for (const i of enclosers) {
          if (innermost < cnt && sizes[i] > sizes[innermost]) break;
          if (!isInside(path, locateIn(i))) continue;

          innermost = i;
          // the enclosing path must be one of its group's outers, wound against this group
          if (isOuter(i) && signOf(i) !== g.outerSign) isHole = true;
        }

        if (!isHole) continue;

        g.pathsReversed = !g.pathsReversed;
        const t = getTree();
        for (let i = groupIdx > 0 ? groupEnds[groupIdx - 1] : 0; i < groupEnds[groupIdx]; i++) {
          t.setActive(i, isOuter(i));
        }
        continue;
      }

      if (isOuter(k)) continue;

      // a hole with a vertex inside an outer counts as enclosed, so one poking out still cuts it
      const ownOuter = outerRefs[groupIdx];
      let isEnclosed = isOuter(ownOuter) && hasVertexInside(path, locateIn(ownOuter));

      if (!isEnclosed) {
        getTree().query(
          (r) => !isEnclosed &&
            Math.max(r.left, pb.left) <= Math.min(r.right, pb.right) &&
            Math.max(r.top, pb.top) <= Math.min(r.bottom, pb.bottom),
          (i) => {
            if (sizes[i] >= sizes[k]) isEnclosed = hasVertexInside(path, locateIn(i));
          }, true);
      }

      if (isEnclosed) continue;

      if (g.isStray === null) g.isStray = new Array<boolean>(g.inPaths.length).fill(false);
      g.isStray[pathIdxs[k]] = true;
    }
  }

  private initClipper(c: Clipper64): void {
    c.preserveCollinear = this.preserveCollinear;
    c.zCallback = this.ZCB;
  }

  private keepGrownRegions(): void {
    // growth is always wound positively, so a positive union removes the eroded regions
    const c = new Clipper64();
    this.initClipper(c);
    c.addSubject([this.solution.pop()!]);
    const grown: Paths64 = [];
    c.execute(ClipType.Union, FillRule.Positive, grown);
    for (const path of grown) this.solution.push(path);
  }

  private executeInternal(delta: number): void {
    if (this.groupList.length === 0) return;
    this.setGroupOrientations();

    // make sure the offset delta is significant
    if (Math.abs(delta) < 0.5) {
      for (const group of this.groupList) {
        // an open path is only as wide as its delta, so an insignificant delta leaves nothing
        if (group.endType !== EndType.Polygon) continue;

        for (let i = 0; i < group.inPaths.length; i++) {
          if (group.isStrayPath(i)) continue;
          const path = group.inPaths[i];
          this.solution.push(group.pathsReversed ? [...path].reverse() : path);
        }
      }
    } else {
      this.delta = delta;
      this.mitLimSqr = (this.miterLimit <= 1 ?
        2.0 : 2.0 / ClipperOffset.sqr(this.miterLimit));

      for (const group of this.groupList) {
        this.doGroupOffset(group);
      }
    }

    if (this.solution.length === 0) return;

    // clean up self-intersections ...
    const c = new Clipper64();
    this.initClipper(c);
    c.reverseSolution = this.reverseSolution;
    c.addSubject(this.solution);

    // outers are wound positively, whatever the orientation of the input
    if (this.solutionTree !== null) {
      c.execute(ClipType.Union, FillRule.Positive, this.solutionTree);
    } else {
      c.execute(ClipType.Union, FillRule.Positive, this.solution);
    }
  }

  public execute(delta: number, solution: Paths64): void;
  public execute(delta: number, solutionTree: PolyTree64): void;
  public execute(delta: number, solutionOrTree: Paths64 | PolyTree64): void {
    if (Array.isArray(solutionOrTree)) {
      // Paths64 version
      const solution = solutionOrTree;
      solution.length = 0;
      this.solution = solution;
      this.executeInternal(delta);
    } else {
      // PolyTree64 version
      const solutionTree = solutionOrTree;
      solutionTree.clear();
      this.solutionTree = solutionTree;
      this.solution = [];
      this.executeInternal(delta);
    }
  }

  public executeWithCallback(deltaCallback: (path: Path64, pathNorms: PathD, currPt: number, prevPt: number) => number, solution: Paths64): void {
    this.deltaCallback = deltaCallback;
    this.execute(1.0, solution);
  }

  public static getUnitNormal(pt1: Point64, pt2: Point64): PointD {
    const dx = (pt2.x - pt1.x);
    const dy = (pt2.y - pt1.y);
    if ((dx === 0) && (dy === 0)) return { x: 0, y: 0 };

    const f = 1.0 / Math.sqrt(dx * dx + dy * dy);
    return {
      x: dy * f,
      y: -dx * f
    };
  }

  public static getLowestPathInfo(paths: Paths64): { idx: number; isNegArea: boolean } {
    let idx = -1;
    let isNegArea = false;
    const botPt: Point64 = { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER };
    
    for (let i = 0; i < paths.length; ++i) {
      let a = Number.MAX_VALUE;
      for (const pt of paths[i]) {
        if ((pt.y < botPt.y) || ((pt.y === botPt.y) && (pt.x >= botPt.x))) continue;
        if (a === Number.MAX_VALUE) {
          a = ClipperOffset.area(paths[i]);
          if (a === 0) break; // invalid closed path so break from inner loop
          isNegArea = a < 0;
        }
        idx = i;
        botPt.x = pt.x;
        botPt.y = pt.y;
      }
    }
    return { idx, isNegArea };
  }

  private static translatePoint(pt: PointD, dx: number, dy: number): PointD {
    return { x: pt.x + dx, y: pt.y + dy, z: pt.z };
  }

  private static reflectPoint(pt: PointD, pivot: PointD): PointD {
    return { x: pivot.x + (pivot.x - pt.x), y: pivot.y + (pivot.y - pt.y), z: pt.z };
  }

  private static almostZero(value: number, epsilon: number = 0.001): boolean {
    return Math.abs(value) < epsilon;
  }

  private static hypotenuse(x: number, y: number): number {
    return Math.sqrt(x * x + y * y);
  }

  private static normalizeVector(vec: PointD): PointD {
    const h = ClipperOffset.hypotenuse(vec.x, vec.y);
    if (ClipperOffset.almostZero(h)) return { x: 0, y: 0 };
    const inverseHypot = 1 / h;
    return { x: vec.x * inverseHypot, y: vec.y * inverseHypot };
  }

  private static getAvgUnitVector(vec1: PointD, vec2: PointD): PointD {
    return ClipperOffset.normalizeVector({ x: vec1.x + vec2.x, y: vec1.y + vec2.y });
  }

  // Intersection of the cap segment pt1..pt2 with the line through pt3 and pt4,
  // clamped to the cap segment as in C++ (GetLineIntersectPt).
  // The lines are only parallel for collinear edges, which offsetPoint
  // sends to doMiter, so the ptQ fallback is a safeguard.
  private static squareIntersect(pt1: PointD, pt2: PointD, pt3: PointD, pt4: PointD, ptQ: PointD): PointD {
    const res = InternalClipper.getLineIntersectPtD(pt1, pt2, pt3, pt4);
    const pt = res.success ? res.ip : { x: ptQ.x, y: ptQ.y };
    pt.z = ptQ.z;
    return pt;
  }

  private getPerpendic(pt: Point64, norm: PointD): Point64 {
    return {
      x: InternalClipper.roundAwayFromZero(pt.x + norm.x * this.groupDelta),
      y: InternalClipper.roundAwayFromZero(pt.y + norm.y * this.groupDelta),
      z: (pt.z || 0)
    };
  }

  private getPerpendicD(pt: Point64, norm: PointD): PointD {
    return {
      x: pt.x + norm.x * this.groupDelta,
      y: pt.y + norm.y * this.groupDelta,
      z: (pt.z || 0)
    };
  }

  private doBevel(path: Path64, j: number, k: number): void {
    let pt1: Point64, pt2: Point64;
    const pjz = (path[j].z || 0);
    if (j === k) {
      const absDelta = Math.abs(this.groupDelta);
      pt1 = {
        x: InternalClipper.roundAwayFromZero(path[j].x - absDelta * this.normals[j].x),
        y: InternalClipper.roundAwayFromZero(path[j].y - absDelta * this.normals[j].y),
        z: pjz
      };
      pt2 = {
        x: InternalClipper.roundAwayFromZero(path[j].x + absDelta * this.normals[j].x),
        y: InternalClipper.roundAwayFromZero(path[j].y + absDelta * this.normals[j].y),
        z: pjz
      };
    } else {
      pt1 = {
        x: InternalClipper.roundAwayFromZero(path[j].x + this.groupDelta * this.normals[k].x),
        y: InternalClipper.roundAwayFromZero(path[j].y + this.groupDelta * this.normals[k].y),
        z: pjz
      };
      pt2 = {
        x: InternalClipper.roundAwayFromZero(path[j].x + this.groupDelta * this.normals[j].x),
        y: InternalClipper.roundAwayFromZero(path[j].y + this.groupDelta * this.normals[j].y),
        z: pjz
      };
    }
    this.pathOut.push(pt1);
    this.pathOut.push(pt2);
  }

  private doSquare(path: Path64, j: number, k: number): void {
    let vec: PointD;
    if (j === k) {
      vec = { x: this.normals[j].y, y: -this.normals[j].x };
    } else {
      vec = ClipperOffset.getAvgUnitVector(
        { x: -this.normals[k].y, y: this.normals[k].x },
        { x: this.normals[j].y, y: -this.normals[j].x }
      );
    }

    const absDelta = Math.abs(this.groupDelta);

    // now offset the original vertex delta units along unit vector
    let ptQ: PointD = { x: path[j].x, y: path[j].y, z: (path[j].z || 0) };
    ptQ = ClipperOffset.translatePoint(ptQ, absDelta * vec.x, absDelta * vec.y);

    // get perpendicular vertices
    const pt1 = ClipperOffset.translatePoint(ptQ, this.groupDelta * vec.y, this.groupDelta * -vec.x);
    const pt2 = ClipperOffset.translatePoint(ptQ, this.groupDelta * -vec.y, this.groupDelta * vec.x);
    // get 2 vertices along one edge offset
    const pt3 = this.getPerpendicD(path[k], this.normals[k]);

    if (j === k) {
      const pt4: PointD = {
        x: pt3.x + vec.x * this.groupDelta,
        y: pt3.y + vec.y * this.groupDelta
      };
      const pt = ClipperOffset.squareIntersect(pt1, pt2, pt3, pt4, ptQ);
      //get the second intersect point through reflecion
      this.pathOut.push(Point64Utils.fromPointD(ClipperOffset.reflectPoint(pt, ptQ)));
      this.pathOut.push(Point64Utils.fromPointD(pt));
    } else {
      const pt4 = this.getPerpendicD(path[j], this.normals[k]);
      const pt = ClipperOffset.squareIntersect(pt1, pt2, pt3, pt4, ptQ);
      this.pathOut.push(Point64Utils.fromPointD(pt));
      //get the second intersect point through reflecion
      this.pathOut.push(Point64Utils.fromPointD(ClipperOffset.reflectPoint(pt, ptQ)));
    }
  }

  private doMiter(path: Path64, j: number, k: number, cosA: number): void {
    const q = this.groupDelta / (cosA + 1);
    this.pathOut.push({
      x: InternalClipper.roundAwayFromZero(path[j].x + (this.normals[k].x + this.normals[j].x) * q),
      y: InternalClipper.roundAwayFromZero(path[j].y + (this.normals[k].y + this.normals[j].y) * q),
      z: (path[j].z || 0)
    });
  }

  private setArcSteps(delta: number): void {
    // calculate the number of steps required to approximate a circle
    // arcTol - when arcTolerance is undefined (0) then curve imprecision
    // will be relative to the size of the offset (delta). Obviously very
    // large offsets will almost always require much less precision.
    // As in C++, the tolerance is capped at delta and the steps at delta * PI,
    // so that a small circle isn't given more vertices than it has units of circumference
    const absDelta = Math.abs(delta);
    const arcTol = this.arcTolerance > ClipperOffset.Tolerance ?
      Math.min(absDelta, this.arcTolerance) : absDelta * ClipperOffset.arc_const;
    const stepsPer360 = Math.min(Math.PI / Math.acos(1 - arcTol / absDelta), absDelta * Math.PI);
    this.stepSin = Math.sin((2 * Math.PI) / stepsPer360);
    this.stepCos = Math.cos((2 * Math.PI) / stepsPer360);
    if (delta < 0.0) this.stepSin = -this.stepSin;
    this.stepsPerRad = stepsPer360 / (2 * Math.PI);
  }

  private doRound(path: Path64, j: number, k: number, angle: number): void {
    // when deltaCallback is assigned, groupDelta won't be constant,
    // so the arc steps need recalculating for *every* vertex.
    if (this.deltaCallback !== null) this.setArcSteps(this.groupDelta);

    const pt = path[j];
    const ptz = (pt.z || 0);
    let offsetVec: PointD = { x: this.normals[k].x * this.groupDelta, y: this.normals[k].y * this.groupDelta };
    if (j === k) PointDUtils.negate(offsetVec);
    
    this.pathOut.push({
      x: InternalClipper.roundAwayFromZero(pt.x + offsetVec.x),
      y: InternalClipper.roundAwayFromZero(pt.y + offsetVec.y),
      z: ptz
    });
    
    const steps = Math.ceil(this.stepsPerRad * Math.abs(angle));
    for (let i = 1; i < steps; i++) { // ie 1 less than steps
      offsetVec = {
        x: offsetVec.x * this.stepCos - this.stepSin * offsetVec.y,
        y: offsetVec.x * this.stepSin + offsetVec.y * this.stepCos
      };
      this.pathOut.push({
        x: InternalClipper.roundAwayFromZero(pt.x + offsetVec.x),
        y: InternalClipper.roundAwayFromZero(pt.y + offsetVec.y),
        z: ptz
      });
    }
    this.pathOut.push(this.getPerpendic(path[j], this.normals[j]));
  }

  private buildNormals(path: Path64): void {
    const cnt = path.length;
    this.normals.length = 0;
    if (cnt === 0) return;
    
    for (let i = 0; i < cnt - 1; i++) {
      this.normals.push(ClipperOffset.getUnitNormal(path[i], path[i + 1]));
    }
    this.normals.push(ClipperOffset.getUnitNormal(path[cnt - 1], path[0]));
  }

  private offsetPoint(group: Group, path: Path64, j: number, k: number): void {
    if (Point64Utils.equals(path[j], path[k])) return;

    // Let A = change in angle where edges join
    // A == 0: ie no change in angle (flat join)
    // A == PI: edges 'spike'
    // sin(A) < 0: right turning
    // cos(A) < 0: change in angle is more than 90 degree
    let sinA = InternalClipper.crossProductD(this.normals[j], this.normals[k]);
    const cosA = InternalClipper.dotProductD(this.normals[j], this.normals[k]);
    if (sinA > 1.0) sinA = 1.0;
    else if (sinA < -1.0) sinA = -1.0;

    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, j, k);
      if (group.pathsReversed) this.groupDelta = -this.groupDelta;
    }
    if (Math.abs(this.groupDelta) <= ClipperOffset.Tolerance) {
      this.pathOut.push(path[j]);
      return;
    }

    if (cosA > -0.999 && (sinA * this.groupDelta < 0)) { // test for concavity first (#593)
      // is concave
      // by far the simplest way to construct concave joins, especially those joining very 
      // short segments, is to insert 3 points that produce negative regions. These regions 
      // will be removed later by the finishing union operation. This is also the best way 
      // to ensure that path reversals (ie over-shrunk paths) are removed.
      this.pathOut.push(this.getPerpendic(path[j], this.normals[k]));
      this.pathOut.push(path[j]); // (#405, #873, #916)
      this.pathOut.push(this.getPerpendic(path[j], this.normals[j]));
    } else if ((cosA > 0.999) && (this.joinType !== JoinType.Round)) {
      // almost straight - less than 2.5 degree (#424, #482, #526 & #724) 
      this.doMiter(path, j, k, cosA);
    } else {
      switch (this.joinType) {
        // miter unless the angle is sufficiently acute to exceed ML
        case JoinType.Miter:
          if (cosA > this.mitLimSqr - 1) {
            this.doMiter(path, j, k, cosA);
          } else {
            this.doSquare(path, j, k);
          }
          break;
        case JoinType.Round:
          this.doRound(path, j, k, Math.atan2(sinA, cosA));
          break;
        case JoinType.Bevel:
          this.doBevel(path, j, k);
          break;
        default:
          this.doSquare(path, j, k);
          break;
      }
    }
  }

  private offsetPolygon(group: Group, path: Path64): void {
    this.pathOut = [];
    const cnt = path.length;
    let prev = cnt - 1;
    for (let i = 0; i < cnt; i++) {
      this.offsetPoint(group, path, i, prev);
      prev = i;
    }

    // a reversed group's outers come out negative, but the solution's outers are always positive
    if (group.pathsReversed) this.pathOut.reverse();

    // pathOut is freshly allocated per call, so push directly (no spread clone needed)
    this.solution.push(this.pathOut);
  }

  private offsetOpenJoined(group: Group, path: Path64): void {
    this.offsetPolygon(group, path);
    const reversePath = [...path].reverse();
    this.buildNormals(reversePath);
    this.offsetPolygon(group, reversePath);
  }

  private offsetOpenPath(group: Group, path: Path64, endType: EndType): void {
    this.pathOut = [];
    const highI = path.length - 1;

    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, 0, 0);
    }

    // do the line start cap
    if (Math.abs(this.groupDelta) < ClipperOffset.Tolerance) {
      this.pathOut.push(path[0]);
    } else {
      switch (endType) {
        case EndType.Butt:
          this.doBevel(path, 0, 0);
          break;
        case EndType.Round:
          this.doRound(path, 0, 0, Math.PI);
          break;
        default:
          this.doSquare(path, 0, 0);
          break;
      }
    }

    // offset the left side going forward
    for (let i = 1, k = 0; i < highI; i++) {
      this.offsetPoint(group, path, i, k);
      k = i;
    }

    // reverse normals ...
    for (let i = highI; i > 0; i--) {
      this.normals[i] = { x: -this.normals[i - 1].x, y: -this.normals[i - 1].y };
    }
    this.normals[0] = this.normals[highI];

    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, highI, highI);
    }
    
    // do the line end cap
    if (Math.abs(this.groupDelta) < ClipperOffset.Tolerance) {
      this.pathOut.push(path[highI]);
    } else {
      switch (endType) {
        case EndType.Butt:
          this.doBevel(path, highI, highI);
          break;
        case EndType.Round:
          this.doRound(path, highI, highI, Math.PI);
          break;
        default:
          this.doSquare(path, highI, highI);
          break;
      }
    }

    // offset the left side going back
    for (let i = highI - 1, k = highI; i > 0; i--) {
      this.offsetPoint(group, path, i, k);
      k = i;
    }

    // pathOut is freshly allocated per call, so push directly (no spread clone needed)
    this.solution.push(this.pathOut);
  }

  private doGroupOffset(group: Group): void {
    if (group.endType === EndType.Polygon) {
      // a straight path (2 points) can now also be 'polygon' offset 
      // where the ends will be treated as (180 deg.) joins
      // (the sign of this.delta is kept for the groups that follow)
      const delta = group.outerSign !== 0 ? this.delta : Math.abs(this.delta);
      this.groupDelta = group.pathsReversed ? -delta : delta;
    } else {
      this.groupDelta = Math.abs(this.delta);
    }

    this.joinType = group.joinType;

    if (group.joinType === JoinType.Round || group.endType === EndType.Round) {
      this.setArcSteps(this.groupDelta);
    }

    for (let pathIdx = 0; pathIdx < group.inPaths.length; pathIdx++) {
      if (group.isStrayPath(pathIdx)) continue;

      const pathIn = group.inPaths[pathIdx];
      this.pathOut = [];
      const cnt = pathIn.length;
      if (cnt === 0) continue;
      this.buildNormals(pathIn);

      if (cnt === 1) {
        // single point
        const pt = pathIn[0];
        let pointDelta = (group.endType === EndType.Polygon) ? this.delta : Math.abs(this.delta);

        if (this.deltaCallback !== null) {
          pointDelta = this.deltaCallback(pathIn, this.normals, 0, 0);
          this.groupDelta = group.pathsReversed ? -pointDelta : pointDelta;
        }

        // a point can only grow, so the caller's delta decides and not the group's orientation
        if (pointDelta < 1) continue;
        // single vertex so build a circle or square ...
        const ptz = (pt.z || 0);
        if (group.joinType === JoinType.Round) {
          // doRound may have left the arc steps of another path's delta
          if (this.deltaCallback !== null) this.setArcSteps(this.groupDelta);
          const steps = Math.ceil(this.stepsPerRad * 2 * Math.PI);
          this.pathOut = ClipperOffset.ellipse(pt, Math.abs(this.groupDelta), Math.abs(this.groupDelta), steps);
          if (ptz !== 0) for (let i = 0; i < this.pathOut.length; i++) this.pathOut[i].z = ptz;
        } else {
          const d = Math.ceil(Math.abs(this.groupDelta));
          const r = { left: pt.x - d, top: pt.y - d, right: pt.x + d, bottom: pt.y + d };
          this.pathOut = [
            { x: r.left, y: r.top, z: ptz },
            { x: r.right, y: r.top, z: ptz },
            { x: r.right, y: r.bottom, z: ptz },
            { x: r.left, y: r.bottom, z: ptz }
          ];
        }
        // pathOut is freshly allocated per call, so push directly (no spread clone needed)
        this.solution.push(this.pathOut);
        continue; // end of offsetting a single point
      }

      // a 2 point joined path gets open path ends, for this path only
      let endType = group.endType;
      if (cnt === 2 && endType === EndType.Joined) {
        endType = (group.joinType === JoinType.Round) ?
          EndType.Round :
          EndType.Square;
      }

      switch (endType) {
        case EndType.Polygon: {
          // a path without area can only grow, so a negative delta erodes it to nothing
          const flat = isFlat(pathIn);
          if (flat && this.deltaCallback === null && this.delta < 0) break;

          this.offsetPolygon(group, pathIn);

          // a callback can grow some vertices and erode others, so keep only what grew
          if (flat && this.deltaCallback !== null) this.keepGrownRegions();
          break;
        }
        case EndType.Joined:
          this.offsetOpenJoined(group, pathIn);
          break;
        default:
          this.offsetOpenPath(group, pathIn, endType);
          break;
      }
    }
  }

  public static stripDuplicates(path: Path64, isClosedPath: boolean): Path64 {
    const cnt = path.length;
    const result: Path64 = [];
    if (cnt === 0) return result;
    
    let lastPt = path[0];
    result.push(lastPt);
    for (let i = 1; i < cnt; i++) {
      if (!Point64Utils.equals(lastPt, path[i])) {
        lastPt = path[i];
        result.push(lastPt);
      }
    }
    // (a single point is kept, as in C++)
    if (isClosedPath && result.length > 1 && Point64Utils.equals(lastPt, result[0])) {
      result.pop();
    }
    return result;
  }

  public static area(path: Path64): number {
    return InternalClipper.area(path);
  }

  public static sqr(val: number): number {
    return val * val;
  }

  public static ellipse(center: Point64, radiusX: number, radiusY: number = 0, steps: number = 0): Path64 {
    if (radiusX <= 0) return [];
    if (radiusY <= 0) radiusY = radiusX;
    if (steps <= 2) {
      steps = Math.trunc(Math.PI * Math.sqrt((radiusX + radiusY) / 2)); // truncated, as in C++
    }

    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result: Path64 = [{ x: InternalClipper.roundAwayFromZero(center.x + radiusX), y: center.y }];
    
    for (let i = 1; i < steps; ++i) {
      result.push({
        x: InternalClipper.roundAwayFromZero(center.x + radiusX * dx),
        y: InternalClipper.roundAwayFromZero(center.y + radiusY * dy)
      });
      const x = dx * co - dy * si;
      dy = dy * co + dx * si;
      dx = x;
    }
    return result;
  }
}
