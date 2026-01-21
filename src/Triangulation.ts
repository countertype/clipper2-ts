/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  13 December 2025                                                *
* Release   :  BETA RELEASE                                                    *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Constrained Delaunay Triangulation                              *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import { Point64, Path64, Paths64, InternalClipper } from './Core.js';

export enum TriangulateResult {
  success,
  fail,
  noPolygons,
  pathsIntersect
}

// -------------------------------------------------------------------------
// Internal triangulation helpers
// -------------------------------------------------------------------------

enum EdgeKind { loose, ascend, descend } // ascend & descend are 'fixed' edges
enum IntersectKind { none, collinear, intersect }
enum EdgeContainsResult { neither, left, right }

class Vertex2 {
  pt: Point64;
  edges: Edge[] = [];
  innerLM: boolean = false;

  constructor(p64: Point64) {
    this.pt = p64;
  }
}

class Edge {
  vL: Vertex2 = null!;
  vR: Vertex2 = null!;
  vB: Vertex2 = null!;
  vT: Vertex2 = null!;
  kind: EdgeKind = EdgeKind.loose;
  triA: Triangle | null = null;
  triB: Triangle | null = null;
  isActive: boolean = false;
  nextE: Edge | null = null;
  prevE: Edge | null = null;
}

class Triangle {
  edges: Edge[] = new Array(3);

  constructor(e1: Edge, e2: Edge, e3: Edge) {
    this.edges[0] = e1;
    this.edges[1] = e2;
    this.edges[2] = e3;
  }
}

// -------------------------------------------------------------------------
// Delaunay class declaration & implementation
// -------------------------------------------------------------------------

export class Delaunay {
  private readonly allVertices: Vertex2[] = [];
  private readonly allEdges: Edge[] = [];
  private readonly allTriangles: Triangle[] = [];
  private readonly pendingDelaunayStack: Edge[] = [];
  private readonly horzEdgeStack: Edge[] = [];
  private readonly locMinStack: Vertex2[] = [];
  private readonly useDelaunay: boolean;
  private firstActive: Edge | null = null;
  private lowermostVertex: Vertex2 | null = null;

  constructor(delaunay: boolean = true) {
    this.useDelaunay = delaunay;
  }

  private addPath(path: Path64): void {
    const len = path.length;
    if (len === 0) return;

    let i0 = 0;
    let iPrev: number;
    let iNext: number;

    const foundIdx = Delaunay.findLocMinIdx(path, len, i0);
    if (!foundIdx.found) return;
    i0 = foundIdx.idx;

    iPrev = Delaunay.prev(i0, len);
    while (path[iPrev].x === path[i0].x && path[iPrev].y === path[i0].y)
      iPrev = Delaunay.prev(iPrev, len);

    iNext = Delaunay.next(i0, len);

    let i = i0;
    while (InternalClipper.crossProductSign(path[iPrev], path[i], path[iNext]) === 0) {
      const result = Delaunay.findLocMinIdx(path, len, i);
      if (!result.found) return; // entirely collinear path
      i = result.idx;
      iPrev = Delaunay.prev(i, len);
      while (path[iPrev].x === path[i].x && path[iPrev].y === path[i].y)
        iPrev = Delaunay.prev(iPrev, len);
      iNext = Delaunay.next(i, len);
    }

    const vert_cnt = this.allVertices.length;
    const v0 = new Vertex2(path[i]);
    this.allVertices.push(v0);

    if (Delaunay.leftTurning(path[iPrev], path[i], path[iNext]))
      v0.innerLM = true;

    let vPrev = v0;
    i = iNext;

    for (; ;) {
      // vPrev is a locMin here
      this.locMinStack.push(vPrev);
      // ? update lowermostVertex ...
      if (this.lowermostVertex === null ||
        vPrev.pt.y > this.lowermostVertex.pt.y ||
        (vPrev.pt.y === this.lowermostVertex.pt.y &&
          vPrev.pt.x < this.lowermostVertex.pt.x))
        this.lowermostVertex = vPrev;

      iNext = Delaunay.next(i, len);
      if (InternalClipper.crossProductSign(vPrev.pt, path[i], path[iNext]) === 0) {
        i = iNext;
        continue;
      }

      // ascend up next bound to LocMax
      while (path[i].y <= vPrev.pt.y) {
        const v = new Vertex2(path[i]);
        this.allVertices.push(v);
        this.createEdge(vPrev, v, EdgeKind.ascend);
        vPrev = v;
        i = iNext;
        iNext = Delaunay.next(i, len);

        while (InternalClipper.crossProductSign(vPrev.pt, path[i], path[iNext]) === 0) {
          i = iNext;
          iNext = Delaunay.next(i, len);
        }
      }

      // Now at a locMax, so descend to next locMin
      const vPrevPrev = vPrev;
      while (i !== i0 && path[i].y >= vPrev.pt.y) {
        const v = new Vertex2(path[i]);
        this.allVertices.push(v);
        this.createEdge(v, vPrev, EdgeKind.descend);
        vPrev = v;
        i = iNext;
        iNext = Delaunay.next(i, len);

        while (InternalClipper.crossProductSign(vPrev.pt, path[i], path[iNext]) === 0) {
          i = iNext;
          iNext = Delaunay.next(i, len);
        }
      }

      // now at the next locMin
      if (i === i0) break;
      if (Delaunay.leftTurning(vPrevPrev.pt, vPrev.pt, path[i]))
        vPrev.innerLM = true;
    }

    this.createEdge(v0, vPrev, EdgeKind.descend);

    // finally, ignore this path if is not a polygon or too small
    const pathLen = this.allVertices.length - vert_cnt;
    const idx = vert_cnt;
    if (pathLen < 3 || (pathLen === 3 &&
      ((Delaunay.distSqr(this.allVertices[idx].pt, this.allVertices[idx + 1].pt) <= 1) ||
        (Delaunay.distSqr(this.allVertices[idx + 1].pt, this.allVertices[idx + 2].pt) <= 1) ||
        (Delaunay.distSqr(this.allVertices[idx + 2].pt, this.allVertices[idx].pt) <= 1)))) {
      for (let j = vert_cnt; j < this.allVertices.length; ++j)
        this.allVertices[j].edges = []; // flag to ignore
    }
  }

  private addPaths(paths: Paths64): boolean {
    let totalVertexCount = 0;
    for (const path of paths)
      totalVertexCount += path.length;
    if (totalVertexCount === 0) return false;

    for (const path of paths)
      this.addPath(path);

    return this.allVertices.length > 2;
  }

  private cleanUp(): void {
    this.allVertices.length = 0;
    this.allEdges.length = 0;
    this.allTriangles.length = 0;
    this.pendingDelaunayStack.length = 0;
    this.horzEdgeStack.length = 0;
    this.locMinStack.length = 0;

    this.firstActive = null;
    this.lowermostVertex = null;
  }

  private fixupEdgeIntersects(): boolean {
    // precondition - edgeList must be sorted - ascending on edge.vL.pt.x

    for (let i1 = 0; i1 < this.allEdges.length; ++i1) {
      const e1 = this.allEdges[i1];
      for (let i2 = i1 + 1; i2 < this.allEdges.length; ++i2) {
        const e2 = this.allEdges[i2];
        if (e2.vL.pt.x >= e1.vR.pt.x)
          break;

        if (e2.vT.pt.y < e1.vB.pt.y && e2.vB.pt.y > e1.vT.pt.y &&
          Delaunay.segsIntersect(e2.vL.pt, e2.vR.pt, e1.vL.pt, e1.vR.pt) === IntersectKind.intersect) {
          if (!this.removeIntersection(e2, e1))
            return false;
        }
      }
    }
    return true;
  }

  private mergeDupOrCollinearVertices(): void {
    if (this.allVertices.length < 2) return;

    let v1Index = 0;
    for (let v2Index = 1; v2Index < this.allVertices.length; ++v2Index) {
      const v1 = this.allVertices[v1Index];
      const v2 = this.allVertices[v2Index];

      if (!(v1.pt.x === v2.pt.x && v1.pt.y === v2.pt.y)) {
        v1Index = v2Index;
        continue;
      }

      // merge v1 & v2
      if (!v1.innerLM || !v2.innerLM)
        v1.innerLM = false;

      for (const e of v2.edges) {
        if (e.vB === v2) e.vB = v1; else e.vT = v1;
        if (e.vL === v2) e.vL = v1; else e.vR = v1;
      }

      v1.edges.push(...v2.edges);
      v2.edges = [];

      // excluding horizontals, if pv.edges contains two edges
      // that are collinear and share the same bottom coords
      // but have different lengths, split the longer edge at
      // the top of the shorter edge ...
      for (let iE = 0; iE < v1.edges.length; ++iE) {
        const e1 = v1.edges[iE];
        if (Delaunay.isHorizontal(e1) || e1.vB !== v1) continue;

        for (let iE2 = iE + 1; iE2 < v1.edges.length; ++iE2) {
          const e2 = v1.edges[iE2];
          if (e2.vB !== v1 || e1.vT.pt.y === e2.vT.pt.y ||
            InternalClipper.crossProductSign(e1.vT.pt, v1.pt, e2.vT.pt) !== 0)
            continue;

          // parallel edges from v1 up
          if (e1.vT.pt.y < e2.vT.pt.y) this.splitEdge(e1, e2);
          else this.splitEdge(e2, e1);
          break; // only two can be collinear
        }
      }
    }
  }

  private splitEdge(longE: Edge, shortE: Edge): void {
    const oldT = longE.vT;
    const newT = shortE.vT;

    Delaunay.removeEdgeFromVertex(oldT, longE);

    longE.vT = newT;
    if (longE.vL === oldT) longE.vL = newT; else longE.vR = newT;

    newT.edges.push(longE);

    this.createEdge(newT, oldT, longE.kind);
  }

  private removeIntersection(e1: Edge, e2: Edge): boolean {
    let v = e1.vL;
    let tmpE = e2;

    let d = Delaunay.shortestDistFromSegment(e1.vL.pt, e2.vL.pt, e2.vR.pt);
    let d2 = Delaunay.shortestDistFromSegment(e1.vR.pt, e2.vL.pt, e2.vR.pt);
    if (d2 < d) { d = d2; v = e1.vR; }

    d2 = Delaunay.shortestDistFromSegment(e2.vL.pt, e1.vL.pt, e1.vR.pt);
    if (d2 < d) { d = d2; tmpE = e1; v = e2.vL; }

    d2 = Delaunay.shortestDistFromSegment(e2.vR.pt, e1.vL.pt, e1.vR.pt);
    if (d2 < d) { d = d2; tmpE = e1; v = e2.vR; }

    if (d > 1.0)
      return false; // not a simple rounding intersection

    const v2 = tmpE.vT;
    Delaunay.removeEdgeFromVertex(v2, tmpE);

    if (tmpE.vL === v2) tmpE.vL = v; else tmpE.vR = v;
    tmpE.vT = v;
    v.edges.push(tmpE);
    v.innerLM = false;

    if (tmpE.vB.innerLM && Delaunay.getLocMinAngle(tmpE.vB) <= 0)
      tmpE.vB.innerLM = false;

    this.createEdge(v, v2, tmpE.kind);
    return true;
  }

  private createEdge(v1: Vertex2, v2: Vertex2, k: EdgeKind): Edge {
    const res = new Edge();
    this.allEdges.push(res);

    if (v1.pt.y === v2.pt.y) {
      res.vB = v1;
      res.vT = v2;
    } else if (v1.pt.y < v2.pt.y) {
      res.vB = v2;
      res.vT = v1;
    } else {
      res.vB = v1;
      res.vT = v2;
    }

    if (v1.pt.x <= v2.pt.x) {
      res.vL = v1;
      res.vR = v2;
    } else {
      res.vL = v2;
      res.vR = v1;
    }

    res.kind = k;
    v1.edges.push(res);
    v2.edges.push(res);

    if (k === EdgeKind.loose) {
      this.pendingDelaunayStack.push(res);
      this.addEdgeToActives(res);
    }

    return res;
  }

  private createTriangle(e1: Edge, e2: Edge, e3: Edge): Triangle {
    const tri = new Triangle(e1, e2, e3);
    this.allTriangles.push(tri);

    for (let i = 0; i < 3; ++i) {
      const e = tri.edges[i];
      if (e.triA !== null) {
        e.triB = tri;
        this.removeEdgeFromActives(e);
      } else {
        e.triA = tri;
        if (!Delaunay.isLooseEdge(e))
          this.removeEdgeFromActives(e);
      }
    }
    return tri;
  }

  private forceLegal(edge: Edge): void {
    if (edge.triA === null || edge.triB === null) return;

    let vertA: Vertex2 | null = null;
    let vertB: Vertex2 | null = null;

    const edgesA: (Edge | null)[] = [null, null, null];
    const edgesB: (Edge | null)[] = [null, null, null];

    for (let i = 0; i < 3; ++i) {
      if (edge.triA!.edges[i] === edge) continue;
      const e = edge.triA!.edges[i];
      const containsResult = Delaunay.edgeContains(e, edge.vL);
      if (containsResult === EdgeContainsResult.left) {
        edgesA[1] = e;
        vertA = e.vR;
      } else if (containsResult === EdgeContainsResult.right) {
        edgesA[1] = e;
        vertA = e.vL;
      } else {
        edgesB[1] = e;
      }
    }

    for (let i = 0; i < 3; ++i) {
      if (edge.triB!.edges[i] === edge) continue;
      const e = edge.triB!.edges[i];
      const containsResult = Delaunay.edgeContains(e, edge.vL);
      if (containsResult === EdgeContainsResult.left) {
        edgesA[2] = e;
        vertB = e.vR;
      } else if (containsResult === EdgeContainsResult.right) {
        edgesA[2] = e;
        vertB = e.vL;
      } else {
        edgesB[2] = e;
      }
    }

    if (vertA === null || vertB === null) return;

    if (InternalClipper.crossProductSign(vertA.pt, edge.vL.pt, edge.vR.pt) === 0)
      return;

    const ictResult = Delaunay.inCircleTest(vertA.pt, edge.vL.pt, edge.vR.pt, vertB.pt);
    if (ictResult === 0 ||
      (Delaunay.rightTurning(vertA.pt, edge.vL.pt, edge.vR.pt) === (ictResult < 0)))
      return;

    edge.vL = vertA;
    edge.vR = vertB;

    edge.triA!.edges[0] = edge;
    for (let i = 1; i < 3; ++i) {
      const eAi = edgesA[i]!;
      edge.triA!.edges[i] = eAi;
      if (Delaunay.isLooseEdge(eAi))
        this.pendingDelaunayStack.push(eAi);

      if (eAi.triA === edge.triA || eAi.triB === edge.triA) continue;

      if (eAi.triA === edge.triB)
        eAi.triA = edge.triA;
      else if (eAi.triB === edge.triB)
        eAi.triB = edge.triA;
      else
        throw new Error('Triangulation internal error');
    }

    edge.triB!.edges[0] = edge;
    for (let i = 1; i < 3; ++i) {
      const eBi = edgesB[i]!;
      edge.triB!.edges[i] = eBi;
      if (Delaunay.isLooseEdge(eBi))
        this.pendingDelaunayStack.push(eBi);

      if (eBi.triA === edge.triB || eBi.triB === edge.triB) continue;

      if (eBi.triA === edge.triA)
        eBi.triA = edge.triB;
      else if (eBi.triB === edge.triA)
        eBi.triB = edge.triB;
      else
        throw new Error('Triangulation internal error');
    }
  }

  private createInnerLocMinLooseEdge(vAbove: Vertex2): Edge | null {
    if (this.firstActive === null) return null;

    const xAbove = vAbove.pt.x;
    const yAbove = vAbove.pt.y;

    let e: Edge | null = this.firstActive;
    let eBelow: Edge | null = null;
    let bestD = -1.0;

    while (e !== null) {
      if (e.vL.pt.x <= xAbove && e.vR.pt.x >= xAbove &&
        e.vB.pt.y >= yAbove && e.vB !== vAbove && e.vT !== vAbove &&
        !Delaunay.leftTurning(e.vL.pt, vAbove.pt, e.vR.pt)) {
        const d = Delaunay.shortestDistFromSegment(vAbove.pt, e.vL.pt, e.vR.pt);
        if (eBelow === null || d < bestD) {
          eBelow = e;
          bestD = d;
        }
      }
      e = e.nextE;
    }

    if (eBelow === null) return null;

    let vBest = (eBelow.vT.pt.y <= yAbove) ? eBelow.vB : eBelow.vT;
    let xBest = vBest.pt.x;
    let yBest = vBest.pt.y;

    e = this.firstActive;
    if (xBest < xAbove) {
      while (e !== null) {
        if (e.vR.pt.x > xBest && e.vL.pt.x < xAbove &&
          e.vB.pt.y > yAbove && e.vT.pt.y < yBest &&
          Delaunay.segsIntersect(e.vB.pt, e.vT.pt, vBest.pt, vAbove.pt) === IntersectKind.intersect) {
          vBest = (e.vT.pt.y > yAbove) ? e.vT : e.vB;
          xBest = vBest.pt.x;
          yBest = vBest.pt.y;
        }
        e = e.nextE;
      }
    } else {
      while (e !== null) {
        if (e.vR.pt.x < xBest && e.vL.pt.x > xAbove &&
          e.vB.pt.y > yAbove && e.vT.pt.y < yBest &&
          Delaunay.segsIntersect(e.vB.pt, e.vT.pt, vBest.pt, vAbove.pt) === IntersectKind.intersect) {
          vBest = (e.vT.pt.y > yAbove) ? e.vT : e.vB;
          xBest = vBest.pt.x;
          yBest = vBest.pt.y;
        }
        e = e.nextE;
      }
    }

    return this.createEdge(vBest, vAbove, EdgeKind.loose);
  }

  private horizontalBetween(v1: Vertex2, v2: Vertex2): Edge | null {
    const y = v1.pt.y;
    let l: number;
    let r: number;

    if (v1.pt.x > v2.pt.x) {
      l = v2.pt.x;
      r = v1.pt.x;
    } else {
      l = v1.pt.x;
      r = v2.pt.x;
    }

    let res: Edge | null = this.firstActive;
    while (res !== null) {
      if (res.vL.pt.y === y && res.vR.pt.y === y &&
        res.vL.pt.x >= l && res.vR.pt.x <= r &&
        (res.vL.pt.x !== l || res.vL.pt.x !== r))
        break;

      res = res.nextE;
    }
    return res;
  }

  private doTriangulateLeft(edge: Edge, pivot: Vertex2, minY: number): void {
    let vAlt: Vertex2 | null = null;
    let eAlt: Edge | null = null;

    const v = (edge.vB === pivot) ? edge.vT : edge.vB;

    for (const e of pivot.edges) {
      if (e === edge || !e.isActive) continue;

      const vX = (e.vT === pivot) ? e.vB : e.vT;
      if (vX === v) continue;

      const cps = InternalClipper.crossProductSign(v.pt, pivot.pt, vX.pt);
      if (cps === 0) {
        if ((v.pt.x > pivot.pt.x) === (pivot.pt.x > vX.pt.x)) continue;
      } else if (cps > 0 || (vAlt !== null && !Delaunay.leftTurning(vX.pt, pivot.pt, vAlt.pt)))
        continue;

      vAlt = vX;
      eAlt = e;
    }

    if (vAlt === null || vAlt.pt.y < minY || eAlt === null) return;

    if (vAlt.pt.y < pivot.pt.y) {
      if (Delaunay.isLeftEdge(eAlt)) return;
    } else if (vAlt.pt.y > pivot.pt.y) {
      if (Delaunay.isRightEdge(eAlt)) return;
    }

    let eX = Delaunay.findLinkingEdge(vAlt, v, (vAlt.pt.y < v.pt.y));
    if (eX === null) {
      if (vAlt.pt.y === v.pt.y && v.pt.y === minY &&
        this.horizontalBetween(vAlt, v) !== null)
        return;

      eX = this.createEdge(vAlt, v, EdgeKind.loose);
    }

    this.createTriangle(edge, eAlt, eX);

    if (!Delaunay.edgeCompleted(eX))
      this.doTriangulateLeft(eX, vAlt, minY);
  }

  private doTriangulateRight(edge: Edge, pivot: Vertex2, minY: number): void {
    let vAlt: Vertex2 | null = null;
    let eAlt: Edge | null = null;

    const v = (edge.vB === pivot) ? edge.vT : edge.vB;

    for (const e of pivot.edges) {
      if (e === edge || !e.isActive) continue;

      const vX = (e.vT === pivot) ? e.vB : e.vT;
      if (vX === v) continue;

      const cps = InternalClipper.crossProductSign(v.pt, pivot.pt, vX.pt);
      if (cps === 0) {
        if ((v.pt.x > pivot.pt.x) === (pivot.pt.x > vX.pt.x)) continue;
      } else if (cps < 0 || (vAlt !== null && !Delaunay.rightTurning(vX.pt, pivot.pt, vAlt.pt)))
        continue;

      vAlt = vX;
      eAlt = e;
    }

    if (vAlt === null || vAlt.pt.y < minY || eAlt === null) return;

    if (vAlt.pt.y < pivot.pt.y) {
      if (Delaunay.isRightEdge(eAlt)) return;
    } else if (vAlt.pt.y > pivot.pt.y) {
      if (Delaunay.isLeftEdge(eAlt)) return;
    }

    let eX = Delaunay.findLinkingEdge(vAlt, v, (vAlt.pt.y > v.pt.y));
    if (eX === null) {
      if (vAlt.pt.y === v.pt.y && v.pt.y === minY &&
        this.horizontalBetween(vAlt, v) !== null)
        return;

      eX = this.createEdge(vAlt, v, EdgeKind.loose);
    }

    this.createTriangle(edge, eX, eAlt);

    if (!Delaunay.edgeCompleted(eX))
      this.doTriangulateRight(eX, vAlt, minY);
  }

  private addEdgeToActives(edge: Edge): void {
    if (edge.isActive) return;

    edge.prevE = null;
    edge.nextE = this.firstActive;
    edge.isActive = true;

    if (this.firstActive !== null)
      this.firstActive.prevE = edge;

    this.firstActive = edge;
  }

  private removeEdgeFromActives(edge: Edge): void {
    Delaunay.removeEdgeFromVertex(edge.vB, edge);
    Delaunay.removeEdgeFromVertex(edge.vT, edge);

    const prev = edge.prevE;
    const next = edge.nextE;

    if (next !== null) next.prevE = prev;
    if (prev !== null) prev.nextE = next;

    edge.isActive = false;
    if (this.firstActive === edge) this.firstActive = next;
  }

  execute(paths: Paths64): { result: TriangulateResult, solution: Paths64 } {
    const sol: Paths64 = [];

    if (!this.addPaths(paths)) {
      return { result: TriangulateResult.noPolygons, solution: sol };
    }

    // if necessary fix path orientation because the algorithm 
    // expects clockwise outer paths and counter-clockwise inner paths
    if (this.lowermostVertex!.innerLM) {
      // the orientation of added paths must be wrong, so
      // 1. reverse innerLM flags ...
      while (this.locMinStack.length > 0) {
        const lm = this.locMinStack.pop()!;
        lm.innerLM = !lm.innerLM;
      }
      // 2. swap edge kinds
      for (const e of this.allEdges) {
        if (e.kind === EdgeKind.ascend)
          e.kind = EdgeKind.descend;
        else if (e.kind === EdgeKind.descend)
          e.kind = EdgeKind.ascend;
      }
    } else {
      // path orientation is fine so ...
      this.locMinStack.length = 0;
    }

    this.allEdges.sort((a, b) => {
      if (a.vL.pt.x < b.vL.pt.x) return -1;
      if (a.vL.pt.x > b.vL.pt.x) return 1;
      return 0;
    });

    if (!this.fixupEdgeIntersects()) {
      this.cleanUp();
      return { result: TriangulateResult.pathsIntersect, solution: sol };
    }

    this.allVertices.sort((a, b) => {
      if (a.pt.y === b.pt.y) {
        if (a.pt.x < b.pt.x) return -1;
        if (a.pt.x > b.pt.x) return 1;
        return 0;
      }
      if (b.pt.y < a.pt.y) return -1;
      return 1;
    });

    this.mergeDupOrCollinearVertices();

    let currY = this.allVertices[0].pt.y;

    for (const v of this.allVertices) {
      if (v.edges.length === 0) continue;

      if (v.pt.y !== currY) {
        while (this.locMinStack.length > 0) {
          const lm = this.locMinStack.pop()!;
          const e = this.createInnerLocMinLooseEdge(lm);
          if (e === null) {
            this.cleanUp();
            return { result: TriangulateResult.fail, solution: sol };
          }

          if (Delaunay.isHorizontal(e)) {
            if (e.vL === e.vB)
              this.doTriangulateLeft(e, e.vB, currY);
            else
              this.doTriangulateRight(e, e.vB, currY);
          } else {
            this.doTriangulateLeft(e, e.vB, currY);
            if (!Delaunay.edgeCompleted(e))
              this.doTriangulateRight(e, e.vB, currY);
          }

          this.addEdgeToActives(lm.edges[0]);
          this.addEdgeToActives(lm.edges[1]);
        }

        while (this.horzEdgeStack.length > 0) {
          const e = this.horzEdgeStack.pop()!;
          if (Delaunay.edgeCompleted(e)) continue;

          if (e.vB === e.vL) {
            if (Delaunay.isLeftEdge(e))
              this.doTriangulateLeft(e, e.vB, currY);
          } else {
            if (Delaunay.isRightEdge(e))
              this.doTriangulateRight(e, e.vB, currY);
          }
        }

        currY = v.pt.y;
      }

      for (let i = v.edges.length - 1; i >= 0; --i) {
        if (i >= v.edges.length) continue;

        const e = v.edges[i];
        if (Delaunay.edgeCompleted(e) || Delaunay.isLooseEdge(e)) continue;

        if (v === e.vB) {
          if (Delaunay.isHorizontal(e))
            this.horzEdgeStack.push(e);

          if (!v.innerLM)
            this.addEdgeToActives(e);
        } else {
          if (Delaunay.isHorizontal(e))
            this.horzEdgeStack.push(e);
          else if (Delaunay.isLeftEdge(e))
            this.doTriangulateLeft(e, e.vB, v.pt.y);
          else
            this.doTriangulateRight(e, e.vB, v.pt.y);
        }
      }

      if (v.innerLM)
        this.locMinStack.push(v);
    }

    while (this.horzEdgeStack.length > 0) {
      const e = this.horzEdgeStack.pop()!;
      if (!Delaunay.edgeCompleted(e) && e.vB === e.vL)
        this.doTriangulateLeft(e, e.vB, currY);
    }

    if (this.useDelaunay) {
      while (this.pendingDelaunayStack.length > 0) {
        const e = this.pendingDelaunayStack.pop()!;
        this.forceLegal(e);
      }
    }

    for (const tri of this.allTriangles) {
      const p = Delaunay.pathFromTriangle(tri);
      const cps = InternalClipper.crossProductSign(p[0], p[1], p[2]);
      if (cps === 0) continue;
      if (cps < 0) p.reverse();
      sol.push(p);
    }

    this.cleanUp();
    return { result: TriangulateResult.success, solution: sol };
  }

  // ---------------------------------------------------------------------
  // Static / helper functions
  // ---------------------------------------------------------------------

  private static isLooseEdge(e: Edge): boolean {
    return e.kind === EdgeKind.loose;
  }

  private static isLeftEdge(e: Edge): boolean {
    return e.kind === EdgeKind.ascend;
  }

  private static isRightEdge(e: Edge): boolean {
    return e.kind === EdgeKind.descend;
  }

  private static isHorizontal(e: Edge): boolean {
    return e.vB.pt.y === e.vT.pt.y;
  }

  private static leftTurning(p1: Point64, p2: Point64, p3: Point64): boolean {
    return InternalClipper.crossProductSign(p1, p2, p3) < 0;
  }

  private static rightTurning(p1: Point64, p2: Point64, p3: Point64): boolean {
    return InternalClipper.crossProductSign(p1, p2, p3) > 0;
  }

  private static edgeCompleted(edge: Edge): boolean {
    if (edge.triA === null) return false;
    if (edge.triB !== null) return true;
    return edge.kind !== EdgeKind.loose;
  }

  private static edgeContains(edge: Edge, v: Vertex2): EdgeContainsResult {
    if (edge.vL === v) return EdgeContainsResult.left;
    if (edge.vR === v) return EdgeContainsResult.right;
    return EdgeContainsResult.neither;
  }

  private static getAngle(a: Point64, b: Point64, c: Point64): number {
    const abx = Number(b.x - a.x);
    const aby = Number(b.y - a.y);
    const bcx = Number(b.x - c.x);
    const bcy = Number(b.y - c.y);
    const dp = abx * bcx + aby * bcy;
    const cp = abx * bcy - aby * bcx;
    return Math.atan2(cp, dp);
  }

  private static getLocMinAngle(v: Vertex2): number {
    let asc: number;
    let des: number;
    if (v.edges[0].kind === EdgeKind.ascend) {
      asc = 0;
      des = 1;
    } else {
      des = 0;
      asc = 1;
    }
    return Delaunay.getAngle(v.edges[des].vT.pt, v.pt, v.edges[asc].vT.pt);
  }

  private static removeEdgeFromVertex(vert: Vertex2, edge: Edge): void {
    const idx = vert.edges.indexOf(edge);
    if (idx < 0) throw new Error('Edge not found in vertex');
    vert.edges.splice(idx, 1);
  }

  private static findLocMinIdx(path: Path64, len: number, idx: number): { found: boolean, idx: number } {
    if (len < 3) return { found: false, idx };
    const i0 = idx;
    let n = (idx + 1) % len;

    while (path[n].y <= path[idx].y) {
      idx = n;
      n = (n + 1) % len;
      if (idx === i0) return { found: false, idx };
    }

    while (path[n].y >= path[idx].y) {
      idx = n;
      n = (n + 1) % len;
    }

    return { found: true, idx };
  }

  private static prev(idx: number, len: number): number {
    if (idx === 0) return len - 1;
    return idx - 1;
  }

  private static next(idx: number, len: number): number {
    return (idx + 1) % len;
  }

  private static findLinkingEdge(vert1: Vertex2, vert2: Vertex2, preferAscending: boolean): Edge | null {
    let res: Edge | null = null;
    for (const e of vert1.edges) {
      if (e.vL === vert2 || e.vR === vert2) {
        if (e.kind === EdgeKind.loose ||
          ((e.kind === EdgeKind.ascend) === preferAscending))
          return e;
        res = e;
      }
    }
    return res;
  }

  private static pathFromTriangle(tri: Triangle): Path64 {
    const res: Path64 = [
      tri.edges[0].vL.pt,
      tri.edges[0].vR.pt
    ];
    const e = tri.edges[1];
    if ((e.vL.pt.x === res[0].x && e.vL.pt.y === res[0].y) ||
      (e.vL.pt.x === res[1].x && e.vL.pt.y === res[1].y))
      res.push(e.vR.pt);
    else
      res.push(e.vL.pt);
    return res;
  }

  private static inCircleTest(ptA: Point64, ptB: Point64, ptC: Point64, ptD: Point64): number {
    const m00 = Number(ptA.x - ptD.x);
    const m01 = Number(ptA.y - ptD.y);
    const m02 = m00 * m00 + m01 * m01;

    const m10 = Number(ptB.x - ptD.x);
    const m11 = Number(ptB.y - ptD.y);
    const m12 = m10 * m10 + m11 * m11;

    const m20 = Number(ptC.x - ptD.x);
    const m21 = Number(ptC.y - ptD.y);
    const m22 = m20 * m20 + m21 * m21;

    return m00 * (m11 * m22 - m21 * m12) -
      m10 * (m01 * m22 - m21 * m02) +
      m20 * (m01 * m12 - m11 * m02);
  }

  private static shortestDistFromSegment(pt: Point64, segPt1: Point64, segPt2: Point64): number {
    const dx = Number(segPt2.x - segPt1.x);
    const dy = Number(segPt2.y - segPt1.y);

    const ax = Number(pt.x - segPt1.x);
    const ay = Number(pt.y - segPt1.y);

    const qNum = ax * dx + ay * dy;
    const denom = dx * dx + dy * dy;

    if (qNum < 0)
      return Delaunay.distanceSqr(pt, segPt1);
    if (qNum > denom)
      return Delaunay.distanceSqr(pt, segPt2);

    return (ax * dy - dx * ay) * (ax * dy - dx * ay) / denom;
  }

  private static segsIntersect(s1a: Point64, s1b: Point64, s2a: Point64, s2b: Point64): IntersectKind {
    // ignore segments sharing an end-point
    if ((s1a.x === s2a.x && s1a.y === s2a.y) ||
        (s1a.x === s2b.x && s1a.y === s2b.y) ||
        (s1b.x === s2b.x && s1b.y === s2b.y)) return IntersectKind.none;

    const dy1 = Number(s1b.y - s1a.y);
    const dx1 = Number(s1b.x - s1a.x);
    const dy2 = Number(s2b.y - s2a.y);
    const dx2 = Number(s2b.x - s2a.x);

    const cp = dy1 * dx2 - dy2 * dx1;
    if (cp === 0) return IntersectKind.collinear;

    let t = (Number(s1a.x - s2a.x) * dy2 -
      Number(s1a.y - s2a.y) * dx2);

    // nb: testing for t === 0 is unreliable due to float imprecision
    if (t >= 0) {
      if (cp < 0 || t >= cp) return IntersectKind.none;
    } else {
      if (cp > 0 || t <= cp) return IntersectKind.none;
    }

    t = (Number(s1a.x - s2a.x) * dy1 -
      Number(s1a.y - s2a.y) * dx1);

    if (t >= 0) {
      if (cp > 0 && t < cp) return IntersectKind.intersect;
    } else {
      if (cp < 0 && t > cp) return IntersectKind.intersect;
    }

    return IntersectKind.none;
  }

  private static distSqr(pt1: Point64, pt2: Point64): number {
    const dx = Number(pt1.x - pt2.x);
    const dy = Number(pt1.y - pt2.y);
    return dx * dx + dy * dy;
  }

  private static distanceSqr(a: Point64, b: Point64): number {
    const dx = Number(a.x - b.x);
    const dy = Number(a.y - b.y);
    return dx * dx + dy * dy;
  }
}
