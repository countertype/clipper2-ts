/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  11 October 2025                                                 *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Path Offset (Inflate/Shrink)                                    *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import {
  Point64, PointD, Path64, PathD, Paths64, PathsD,
  ClipType, FillRule,
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

class Group {
  public inPaths: Paths64;
  public joinType: JoinType;
  public endType: EndType;
  public pathsReversed: boolean;
  public lowestPathIdx: number;

  constructor(paths: Paths64, joinType: JoinType, endType: EndType = EndType.Polygon) {
    this.joinType = joinType;
    this.endType = endType;

    const isJoined = (endType === EndType.Polygon) || (endType === EndType.Joined);
    this.inPaths = [];
    for (const path of paths) {
      this.inPaths.push(ClipperOffset.stripDuplicates(path, isJoined));
    }

    if (endType === EndType.Polygon) {
      const lowestInfo = ClipperOffset.getLowestPathInfo(this.inPaths);
      this.lowestPathIdx = lowestInfo.idx;
      // the lowermost path must be an outer path, so if its orientation is negative,
      // then flag that the whole group is 'reversed' (will negate delta etc.)
      // as this is much more efficient than reversing every path.
      this.pathsReversed = (this.lowestPathIdx >= 0) && lowestInfo.isNegArea;
    } else {
      this.lowestPathIdx = -1;
      this.pathsReversed = false;
    }
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
  private endType: EndType = EndType.Polygon;

  public arcTolerance: number = 0;
  public mergeGroups: boolean = true;
  public miterLimit: number = 2.0;
  public preserveCollinear: boolean = false;
  public reverseSolution: boolean = false;

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

  private checkPathsReversed(): boolean {
    let result = false;
    for (const g of this.groupList) {
      if (g.endType === EndType.Polygon) {
        result = g.pathsReversed;
        break;
      }
    }
    return result;
  }

  private executeInternal(delta: number): void {
    if (this.groupList.length === 0) return;
    
    // make sure the offset delta is significant
    if (Math.abs(delta) < 0.5) {
      for (const group of this.groupList) {
        for (const path of group.inPaths) {
          this.solution.push(path);
        }
      }
      return;
    }

    this.delta = delta;
    this.mitLimSqr = (this.miterLimit <= 1 ?
      2.0 : 2.0 / ClipperOffset.sqr(this.miterLimit));

    for (const group of this.groupList) {
      this.doGroupOffset(group);
    }

    if (this.groupList.length === 0) return;

    const pathsReversed = this.checkPathsReversed();
    const fillRule = pathsReversed ? FillRule.Negative : FillRule.Positive;

    // clean up self-intersections ...
    const c = new Clipper64();
    c.preserveCollinear = this.preserveCollinear;
    c.reverseSolution = this.reverseSolution !== pathsReversed;
    c.addSubject(this.solution);
    
    if (this.solutionTree !== null) {
      c.execute(ClipType.Union, fillRule, this.solutionTree);
    } else {
      c.execute(ClipType.Union, fillRule, this.solution);
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
    let botPt: Point64 = { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER };
    
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
    return { x: pt.x + dx, y: pt.y + dy };
  }

  private static reflectPoint(pt: PointD, pivot: PointD): PointD {
    return { x: pivot.x + (pivot.x - pt.x), y: pivot.y + (pivot.y - pt.y) };
  }

  private static almostZero(value: number, epsilon: number = 0.001): boolean {
    return Math.abs(value) < epsilon;
  }

  private static hypotenuse(x: number, y: number): number {
    return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
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

  private static intersectPoint(pt1a: PointD, pt1b: PointD, pt2a: PointD, pt2b: PointD): PointD {
    if (InternalClipper.isAlmostZero(pt1a.x - pt1b.x)) { // vertical
      if (InternalClipper.isAlmostZero(pt2a.x - pt2b.x)) return { x: 0, y: 0 };
      const m2 = (pt2b.y - pt2a.y) / (pt2b.x - pt2a.x);
      const b2 = pt2a.y - m2 * pt2a.x;
      return { x: pt1a.x, y: m2 * pt1a.x + b2 };
    }

    if (InternalClipper.isAlmostZero(pt2a.x - pt2b.x)) { // vertical
      const m1 = (pt1b.y - pt1a.y) / (pt1b.x - pt1a.x);
      const b1 = pt1a.y - m1 * pt1a.x;
      return { x: pt2a.x, y: m1 * pt2a.x + b1 };
    } else {
      const m1 = (pt1b.y - pt1a.y) / (pt1b.x - pt1a.x);
      const b1 = pt1a.y - m1 * pt1a.x;
      const m2 = (pt2b.y - pt2a.y) / (pt2b.x - pt2a.x);
      const b2 = pt2a.y - m2 * pt2a.x;
      if (InternalClipper.isAlmostZero(m1 - m2)) return { x: 0, y: 0 };
      const x = (b2 - b1) / (m1 - m2);
      return { x: x, y: m1 * x + b1 };
    }
  }

  private getPerpendic(pt: Point64, norm: PointD): Point64 {
    return {
      x: Math.round(pt.x + norm.x * this.groupDelta),
      y: Math.round(pt.y + norm.y * this.groupDelta)
    };
  }

  private getPerpendicD(pt: Point64, norm: PointD): PointD {
    return {
      x: pt.x + norm.x * this.groupDelta,
      y: pt.y + norm.y * this.groupDelta
    };
  }

  private doBevel(path: Path64, j: number, k: number): void {
    let pt1: Point64, pt2: Point64;
    if (j === k) {
      const absDelta = Math.abs(this.groupDelta);
      pt1 = {
        x: Math.round(path[j].x - absDelta * this.normals[j].x),
        y: Math.round(path[j].y - absDelta * this.normals[j].y)
      };
      pt2 = {
        x: Math.round(path[j].x + absDelta * this.normals[j].x),
        y: Math.round(path[j].y + absDelta * this.normals[j].y)
      };
    } else {
      pt1 = {
        x: Math.round(path[j].x + this.groupDelta * this.normals[k].x),
        y: Math.round(path[j].y + this.groupDelta * this.normals[k].y)
      };
      pt2 = {
        x: Math.round(path[j].x + this.groupDelta * this.normals[j].x),
        y: Math.round(path[j].y + this.groupDelta * this.normals[j].y)
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
    let ptQ: PointD = { x: path[j].x, y: path[j].y };
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
      const pt = ClipperOffset.intersectPoint(pt1, pt2, pt3, pt4);
      //get the second intersect point through reflecion
      this.pathOut.push(Point64Utils.fromPointD(ClipperOffset.reflectPoint(pt, ptQ)));
      this.pathOut.push(Point64Utils.fromPointD(pt));
    } else {
      const pt4 = this.getPerpendicD(path[j], this.normals[k]);
      const pt = ClipperOffset.intersectPoint(pt1, pt2, pt3, pt4);
      this.pathOut.push(Point64Utils.fromPointD(pt));
      //get the second intersect point through reflecion
      this.pathOut.push(Point64Utils.fromPointD(ClipperOffset.reflectPoint(pt, ptQ)));
    }
  }

  private doMiter(path: Path64, j: number, k: number, cosA: number): void {
    const q = this.groupDelta / (cosA + 1);
    this.pathOut.push({
      x: Math.round(path[j].x + (this.normals[k].x + this.normals[j].x) * q),
      y: Math.round(path[j].y + (this.normals[k].y + this.normals[j].y) * q)
    });
  }

  private doRound(path: Path64, j: number, k: number, angle: number): void {
    if (this.deltaCallback !== null) {
      // when deltaCallback is assigned, groupDelta won't be constant,
      // so we'll need to do the following calculations for *every* vertex.
      const absDelta = Math.abs(this.groupDelta);
      const arcTol = this.arcTolerance > 0.01 ? this.arcTolerance : absDelta * ClipperOffset.arc_const;
      const stepsPer360 = Math.PI / Math.acos(1 - arcTol / absDelta);
      this.stepSin = Math.sin((2 * Math.PI) / stepsPer360);
      this.stepCos = Math.cos((2 * Math.PI) / stepsPer360);
      if (this.groupDelta < 0.0) this.stepSin = -this.stepSin;
      this.stepsPerRad = stepsPer360 / (2 * Math.PI);
    }

    const pt = path[j];
    let offsetVec: PointD = { x: this.normals[k].x * this.groupDelta, y: this.normals[k].y * this.groupDelta };
    if (j === k) PointDUtils.negate(offsetVec);
    
    this.pathOut.push({
      x: Math.round(pt.x + offsetVec.x),
      y: Math.round(pt.y + offsetVec.y)
    });
    
    const steps = Math.ceil(this.stepsPerRad * Math.abs(angle));
    for (let i = 1; i < steps; i++) { // ie 1 less than steps
      offsetVec = {
        x: offsetVec.x * this.stepCos - this.stepSin * offsetVec.y,
        y: offsetVec.x * this.stepSin + offsetVec.y * this.stepCos
      };
      this.pathOut.push({
        x: Math.round(pt.x + offsetVec.x),
        y: Math.round(pt.y + offsetVec.y)
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
    if (Math.abs(this.groupDelta) < ClipperOffset.Tolerance) {
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
    this.solution.push([...this.pathOut]);
  }

  private offsetOpenJoined(group: Group, path: Path64): void {
    this.offsetPolygon(group, path);
    const reversePath = [...path].reverse();
    this.buildNormals(reversePath);
    this.offsetPolygon(group, reversePath);
  }

  private offsetOpenPath(group: Group, path: Path64): void {
    this.pathOut = [];
    const highI = path.length - 1;

    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, 0, 0);
    }

    // do the line start cap
    if (Math.abs(this.groupDelta) < ClipperOffset.Tolerance) {
      this.pathOut.push(path[0]);
    } else {
      switch (this.endType) {
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
      switch (this.endType) {
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

    this.solution.push([...this.pathOut]);
  }

  private doGroupOffset(group: Group): void {
    if (group.endType === EndType.Polygon) {
      // a straight path (2 points) can now also be 'polygon' offset 
      // where the ends will be treated as (180 deg.) joins
      if (group.lowestPathIdx < 0) this.delta = Math.abs(this.delta);
      this.groupDelta = group.pathsReversed ? -this.delta : this.delta;
    } else {
      this.groupDelta = Math.abs(this.delta);
    }

    const absDelta = Math.abs(this.groupDelta);

    this.joinType = group.joinType;
    this.endType = group.endType;

    if (group.joinType === JoinType.Round || group.endType === EndType.Round) {
      const arcTol = this.arcTolerance > 0.01 ? this.arcTolerance : absDelta * ClipperOffset.arc_const;
      const stepsPer360 = Math.PI / Math.acos(1 - arcTol / absDelta);
      this.stepSin = Math.sin((2 * Math.PI) / stepsPer360);
      this.stepCos = Math.cos((2 * Math.PI) / stepsPer360);
      if (this.groupDelta < 0.0) this.stepSin = -this.stepSin;
      this.stepsPerRad = stepsPer360 / (2 * Math.PI);
    }

    for (const pathIn of group.inPaths) {
      this.pathOut = [];
      const cnt = pathIn.length;

      if (cnt === 1) {
        // single point
        const pt = pathIn[0];

        if (this.deltaCallback !== null) {
          this.groupDelta = this.deltaCallback(pathIn, this.normals, 0, 0);
          if (group.pathsReversed) this.groupDelta = -this.groupDelta;
        }

        // single vertex so build a circle or square ...
        if (group.endType === EndType.Round) {
          const steps = Math.ceil(this.stepsPerRad * 2 * Math.PI);
          this.pathOut = ClipperOffset.ellipse(pt, Math.abs(this.groupDelta), Math.abs(this.groupDelta), steps);
        } else {
          const d = Math.ceil(Math.abs(this.groupDelta));
          const r = { left: pt.x - d, top: pt.y - d, right: pt.x + d, bottom: pt.y + d };
          this.pathOut = [
            { x: r.left, y: r.top },
            { x: r.right, y: r.top },
            { x: r.right, y: r.bottom },
            { x: r.left, y: r.bottom }
          ];
        }
        this.solution.push([...this.pathOut]);
        continue; // end of offsetting a single point
      }

      if (cnt === 2 && group.endType === EndType.Joined) {
        this.endType = (group.joinType === JoinType.Round) ?
          EndType.Round :
          EndType.Square;
      }

      this.buildNormals(pathIn);
      switch (this.endType) {
        case EndType.Polygon:
          this.offsetPolygon(group, pathIn);
          break;
        case EndType.Joined:
          this.offsetOpenJoined(group, pathIn);
          break;
        default:
          this.offsetOpenPath(group, pathIn);
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
    if (isClosedPath && Point64Utils.equals(lastPt, result[0])) {
      result.pop();
    }
    return result;
  }

  public static area(path: Path64): number {
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

  public static sqr(val: number): number {
    return val * val;
  }

  public static ellipse(center: Point64, radiusX: number, radiusY: number = 0, steps: number = 0): Path64 {
    if (radiusX <= 0) return [];
    if (radiusY <= 0) radiusY = radiusX;
    if (steps <= 2) {
      steps = Math.ceil(Math.PI * Math.sqrt((radiusX + radiusY) / 2));
    }

    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result: Path64 = [{ x: Math.round(center.x + radiusX), y: center.y }];
    
    for (let i = 1; i < steps; ++i) {
      result.push({
        x: Math.round(center.x + radiusX * dx),
        y: Math.round(center.y + radiusY * dy)
      });
      const x = dx * co - dy * si;
      dy = dy * co + dx * si;
      dx = x;
    }
    return result;
  }
}
