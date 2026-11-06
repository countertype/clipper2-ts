import { describe, it, expect } from 'vitest';
import { Clipper } from '../src/Clipper';
import { TriangulateResult, Paths64 } from '../src/index';

describe('Issue #1075 - Triangulate fail with useDelaunay=true', () => {
  // https://github.com/AngusJohnson/Clipper2/issues/1075
  // Bug: collinear vertex at local minimum causes duplicate locMinStack push,
  // double-flipping innerLM flag, leading to TriangulateResult.fail

  const polygon: Paths64 = [[
    { x: 148846174, y: -8532576, z: 603510 },
    { x: 147360289, y: -8327287, z: 602403 },
    { x: 145874404, y: -8121997, z: 600407 },
    { x: 144388521, y: -7916708, z: 597649 },
    { x: 142902639, y: -7711419, z: 594286 },
    { x: 141416758, y: -7506130, z: 590414 },
    { x: 139930879, y: -7300841, z: 586196 },
    { x: 138445000, y: -7095553, z: 581741 },
    { x: 136959121, y: -6890264, z: 577183 },
    { x: 135473242, y: -6684975, z: 572672 },
    { x: 133987362, y: -6479687, z: 568306 },
    { x: 132501482, y: -6274398, z: 564248 },
    { x: 131015601, y: -6069109, z: 560606 },
    { x: 129529718, y: -5863820, z: 557515 },
    { x: 128043835, y: -5658530, z: 555124 },
    { x: 126557950, y: -5453241, z: 553536 },
    { x: 125072064, y: -5247951, z: 552906 },
    { x: 123574419, y: -5178904, z: 551926 },
    { x: 122075337, y: -5126544, z: 548716 },
    { x: 120576260, y: -5074184, z: 543579 },
    { x: 119077190, y: -5021824, z: 536748 },
    { x: 117578126, y: -4969465, z: 528607 },
    { x: 116079069, y: -4917105, z: 519403 },
    { x: 114580016, y: -4864746, z: 509450 },
    { x: 113080966, y: -4812387, z: 499089 },
    { x: 111581917, y: -4760028, z: 488553 },
    { x: 110082866, y: -4707670, z: 478217 },
    { x: 108583813, y: -4655310, z: 468330 },
    { x: 107084755, y: -4602951, z: 459208 },
    { x: 105585691, y: -4550592, z: 451191 },
    { x: 104086620, y: -4498232, z: 444507 },
    { x: 102587542, y: -4445872, z: 439546 },
    { x: 101088459, y: -4393512, z: 436548 },
    { x: 99899974, y: -4352000, z: 435773 },
    { x: 99949948, y: -2865903, z: 616698 },
    { x: 99996073, y: -1494267, z: 777064 },
    { x: 101495224, y: -1544722, z: 776713 },
    { x: 102994375, y: -1595177, z: 775718 },
    { x: 104493526, y: -1645631, z: 774178 },
    { x: 105992675, y: -1696086, z: 772160 },
    { x: 107491825, y: -1746541, z: 769771 },
    { x: 108990974, y: -1796996, z: 767094 },
    { x: 110490122, y: -1847450, z: 764209 },
    { x: 111989270, y: -1897905, z: 761223 },
    { x: 113488418, y: -1948360, z: 758203 },
    { x: 114987567, y: -1998815, z: 755250 },
    { x: 116486715, y: -2049270, z: 752454 },
    { x: 117985864, y: -2099724, z: 749890 },
    { x: 119485014, y: -2150179, z: 747665 },
    { x: 120984164, y: -2200634, z: 745847 },
    { x: 122483315, y: -2251089, z: 744541 },
    { x: 123982466, y: -2301544, z: 743833 },
    { x: 125461110, y: -2496226, z: 743416 },
    { x: 126914912, y: -2865621, z: 740880 },
    { x: 128368708, y: -3235015, z: 735929 },
    { x: 129822497, y: -3604407, z: 728937 },
    { x: 131276276, y: -3973797, z: 720249 },
    { x: 132730048, y: -4343185, z: 710158 },
    { x: 134183812, y: -4712571, z: 699074 },
    { x: 135637571, y: -5081955, z: 687237 },
    { x: 137091327, y: -5451339, z: 675069 },
    { x: 138545083, y: -5820723, z: 662846 },
    { x: 139998841, y: -6190107, z: 650917 },
    { x: 141452605, y: -6559493, z: 639659 },
    { x: 142906374, y: -6928880, z: 629326 },
    { x: 144360152, y: -7298269, z: 620348 },
    { x: 145813939, y: -7667661, z: 612965 },
    { x: 147267734, y: -8037054, z: 607587 },
    { x: 148721535, y: -8406450, z: 604531 },
    { x: 149312960, y: -8556724, z: 603862 },
  ]];

  it('should succeed with useDelaunay=true', () => {
    const { result, solution } = Clipper.triangulate(polygon, true);
    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);
    for (const tri of solution) {
      expect(tri).toHaveLength(3);
    }
  });

  it('should succeed with useDelaunay=false', () => {
    const { result, solution } = Clipper.triangulate(polygon, false);
    expect(result).toBe(TriangulateResult.success);
    expect(solution.length).toBeGreaterThan(0);
    for (const tri of solution) {
      expect(tri).toHaveLength(3);
    }
  });

  it('triangles cover the polygon exactly', () => {
    const polygonArea = Math.abs(Clipper.areaPaths(polygon));
    for (const useDelaunay of [true, false]) {
      const { result, solution } = Clipper.triangulate(polygon, useDelaunay);
      expect(result).toBe(TriangulateResult.success);
      // integer coordinates, so the signed areas sum exactly
      let triangleArea = 0;
      for (const tri of solution) triangleArea += Math.abs(Clipper.area(tri));
      expect(triangleArea).toBe(polygonArea);
      // a simple polygon with n vertices has n - 2 triangles once collinear
      // vertices are dropped, so never more than that
      expect(solution.length).toBeLessThanOrEqual(polygon[0].length - 2);
    }
  });
});
