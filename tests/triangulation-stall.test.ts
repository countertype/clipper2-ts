// Edges that block each other's bridge used to keep createInnerLocMinLooseEdge
// restarting for ever. The search is bounded now, and triangulate returns fail.
// The paths are a union of random polygons on a coarse grid.
import { test, expect } from 'vitest';
import { Clipper, triangulate, TriangulateResult } from '../src';

const paths = [
  [129,117, 132,120, 135,119, 142,121, 134,122, 190,190, 121,126, 125,125, 120,125, 107,113, 120,120, 108,112],
  [89,165, 90,170, 106,172, 50,180, 67,159],
  [170,180, 130,175, 140,180, 117,173, 106,172, 110,171, 89,165, 85,152],
  [190,130, 180,170, 173,128, 172,124],
  [68,95, 67,95, 71,96, 78,98, 80,98, 78,97, 82,97, 83,96, 85,96, 88,95, 89,96, 87,97, 86,97, 87,98, 86,98, 89,99, 90,99, 92,99, 98,104, 108,108, 106,110, 108,112, 105,111, 107,113, 105,112, 88,133, 120,125, 121,126, 84,148, 82,141, 67,159, 24,147, 80,134, 72,107, 77,104, 71,103, 70,102, 69,102, 61,100, 55,106, 53,107, 58,99, 56,99, 62,95, 63,94],
  [85,152, 80,150, 84,148],
  [24,147, 10,150, 15,144],
  [15,144, 0,140, 31,126],
  [173,128, 142,121, 147,120],
  [71,103, 72,107, 31,126, 46,108, 53,107, 50,110, 55,106, 69,102],
  [172,124, 155,118, 171,114],
  [155,118, 147,120, 138,117, 144,114],
  [138,117, 135,119, 129,117, 126,113],
  [146,107, 150,110, 144,114, 119,105, 117,102],
  [190,110, 171,114, 170,110, 146,107, 125,87, 150,80, 125,86, 170,30],
  [119,105, 126,113, 108,108, 112,102],
  [46,108, 40,110, 51,102],
  [56,99, 51,102, 54,98],
  [117,102, 113,102, 114,99],
  [95,96, 108,101, 92,99, 91,98, 90,99, 85,98, 87,97, 89,97, 89,96, 92,95, 93,96, 101,93],
  [124,86, 125,86, 125,87, 124,87, 114,99, 108,91, 101,93, 106,91, 107,91, 121,84],
  [58,94, 54,98, 30,90],
  [78,97, 71,96, 68,95, 70,92],
  [86,93, 83,96, 73,89],
  [47,80, 63,88, 65,86, 68,87, 66,90, 67,91, 63,93, 62,95, 58,94, 59,92, 20,80, 29,73],
  [90,95, 88,95, 86,93],
  [92,95, 90,95, 97,93],
  [97,79, 86,93, 78,86, 93,73],
  [107,91, 106,91, 97,93, 106,90],
  [75,85, 76,84, 78,86, 77,87, 74,89, 70,92, 67,91, 71,88, 68,87, 69,86, 71,88, 75,85, 72,82, 73,82],
  [121,84, 106,90, 97,79, 105,69],
  [66,47, 52,57, 62,69, 62,71, 71,79, 70,80, 61,71, 60,80, 66,84, 65,86, 47,80, 32,71, 29,73, 20,70, 43,47, 51,56, 66,45],
  [72,82, 69,86, 66,84, 70,80],
  [85,65, 90,60, 86,65, 92,73, 76,84, 73,81, 73,82, 71,80, 71,79, 62,69, 66,47, 69,45],
  [109,60, 120,50, 105,69, 102,66, 100,67, 101,66, 81,47],
  [55,35, 43,47, 20,20],
  [74,41, 81,47, 71,43, 69,45, 68,43, 70,42, 67,41, 66,42, 65,40, 55,35, 58,32, 40,10, 61,29, 70,20, 68,35, 73,40, 130,0],
  [68,43, 66,45, 66,42],
].map(coords => Clipper.makePath(coords));

test('triangulate returns when two edges block each other\'s bridge', () => {
  expect(triangulate(paths).result).toBe(TriangulateResult.fail);
  expect(triangulate(paths, false).result).toBe(TriangulateResult.fail);
});

// A path with every vertex on one sloped or vertical line kept addPath looking for a
// local minimum for ever. C++ returns from that loop once it comes back round.
// (The horizontal one never had a local minimum to find, and is here for completeness.)
test('an entirely collinear path is skipped', () => {
  const square = Clipper.makePath([0,0, 100,0, 100,100, 0,100]);
  const flats = [[200,10, 210,20, 220,30], [200,10, 200,20, 200,30], [200,10, 250,10, 300,10]];

  for (const flat of flats) {
    const { result, solution } = triangulate([square, Clipper.makePath(flat)]);
    expect(result).toBe(TriangulateResult.success);
    expect(solution).toHaveLength(2);
    // alone, there is nothing to triangulate
    expect(triangulate([Clipper.makePath(flat)]).result).toBe(TriangulateResult.noPolygons);
  }
});
