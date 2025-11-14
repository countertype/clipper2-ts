/*******************************************************************************
* Author    :  Angus Johnson 
* Date      :  2025
* Website   :  https://www.angusj.com
* Copyright :  Angus Johnson 2010-2025
* License   :  https://www.boost.org/LICENSE_1_0.txt
*******************************************************************************/

// Export core types and interfaces
export {
  Point64,
  PointD,
  Path64,
  PathD,
  Paths64,
  PathsD,
  Rect64,
  RectD,
  ClipType,
  PathType,
  FillRule,
  PointInPolygonResult,
  InternalClipper,
  Point64Utils,
  PointDUtils,
  Rect64Utils,
  RectDUtils,
  PathUtils,
  PathsUtils,
  InvalidRect64,
  InvalidRectD
} from './Core';

// Export engine classes
export {
  VertexFlags,
  Vertex,
  LocalMinima,
  createLocalMinima, // deprecated: use new LocalMinima() directly
  IntersectNode,
  createIntersectNode,
  OutPt,
  JoinWith,
  HorzPosition,
  OutRec,
  HorzSegment,
  HorzJoin,
  Active,
  ClipperEngine,
  ReuseableDataContainer64,
  PolyPathBase,
  PolyPath64,
  PolyPathD,
  PolyTree64,
  PolyTreeD,
  ClipperBase,
  Clipper64,
  ClipperD
} from './Engine';

// Export offset functionality
export {
  JoinType,
  EndType,
  ClipperOffset
} from './Offset';

// Export rect clipping
export {
  OutPt2,
  RectClip64,
  RectClipLines64
} from './RectClip';

// Export Minkowski operations
export {
  Minkowski
} from './Minkowski';

// Export main Clipper namespace with convenience functions
export { Clipper } from './Clipper';

// Re-export main functions for convenience
import { Clipper } from './Clipper';

export const {
  intersect,
  intersectD,
  union,
  unionD,
  difference,
  differenceD,
  xor,
  xorD,
  booleanOp,
  booleanOpWithPolyTree,
  booleanOpD,
  booleanOpDWithPolyTree,
  inflatePaths,
  inflatePathsD,
  rectClip,
  rectClipLines,
  minkowskiSum,
  minkowskiSumD,
  minkowskiDiff,
  minkowskiDiffD,
  area,
  areaPaths,
  areaD,
  areaPathsD,
  isPositive,
  isPositiveD,
  getBounds,
  getBoundsPaths,
  getBoundsD,
  getBoundsPathsD,
  makePath,
  makePathD,
  scalePath64,
  scalePaths64,
  scalePathD,
  scalePathsD,
  translatePath,
  translatePaths,
  translatePathD,
  translatePathsD,
  reversePath,
  reversePathD,
  reversePaths,
  reversePathsD,
  stripDuplicates,
  trimCollinear,
  trimCollinearD,
  pointInPolygon,
  pointInPolygonD,
  ellipse,
  ellipseD,
  simplifyPath,
  simplifyPaths,
  simplifyPathD,
  simplifyPathsD,
  ramerDouglasPeucker,
  ramerDouglasPeuckerPaths,
  ramerDouglasPeuckerD,
  ramerDouglasPeuckerPathsD
} = Clipper;
