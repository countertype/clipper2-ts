/*******************************************************************************
* Author    :  Angus Johnson                                                   *
* Date      :  13 December 2025                                                *
* Release   :  BETA RELEASE                                                    *
* Website   :  https://www.angusj.com                                          *
* Copyright :  Angus Johnson 2010-2025                                         *
* Purpose   :  Constrained Delaunay Triangulation                              *
* License   :  https://www.boost.org/LICENSE_1_0.txt                           *
*******************************************************************************/

import { Point64, Path64, Paths64 } from './Core.js';

// Adaptive precision geometric predicates ported from
// Jonathan Richard Shewchuk's predicates.c (public domain).
// https://www.cs.cmu.edu/~quake/robust.html

const EPSILON = 1.1102230246251565e-16; // 2^-53
const SPLITTER = 134217729; // 2^27 + 1

const resulterrbound = (3 + 8 * EPSILON) * EPSILON;
const ccwerrboundA = (3 + 16 * EPSILON) * EPSILON;
const ccwerrboundB = (2 + 12 * EPSILON) * EPSILON;
const ccwerrboundC = (9 + 64 * EPSILON) * EPSILON * EPSILON;
const iccerrboundA = (10 + 96 * EPSILON) * EPSILON;
const iccerrboundB = (4 + 48 * EPSILON) * EPSILON;
const iccerrboundC = (44 + 576 * EPSILON) * EPSILON * EPSILON;

// Pre-allocated working arrays
const o2dB = new Float64Array(4);
const o2dC1 = new Float64Array(8);
const o2dC2 = new Float64Array(12);
const o2dD = new Float64Array(16);
const o2du = new Float64Array(4);

const icbc = new Float64Array(4);
const icca = new Float64Array(4);
const icab = new Float64Array(4);
const icaa = new Float64Array(4);
const icbb = new Float64Array(4);
const iccc = new Float64Array(4);
const icu = new Float64Array(4);

const icaxtbc = new Float64Array(8);
const icaytbc = new Float64Array(8);
const icbxtca = new Float64Array(8);
const icbytca = new Float64Array(8);
const iccxtab = new Float64Array(8);
const iccytab = new Float64Array(8);
const icabt = new Float64Array(8);
const icbct = new Float64Array(8);
const iccat = new Float64Array(8);
const icabtt = new Float64Array(4);
const icbctt = new Float64Array(4);
const iccatt = new Float64Array(4);

const ic8 = new Float64Array(8);
const ic16 = new Float64Array(16);
const ic16b = new Float64Array(16);
const ic16c = new Float64Array(16);
const ic32 = new Float64Array(32);
const ic32b = new Float64Array(32);
const ic48 = new Float64Array(48);
const ic64 = new Float64Array(64);
let icfin = new Float64Array(1152);
let icfin2 = new Float64Array(1152);

// fast_expansion_sum_zeroelim from predicates.c
function expansionSum(
  elen: number, e: Float64Array,
  flen: number, f: Float64Array,
  h: Float64Array
): number {
  let Q: number, Qnew: number, hh: number, bvirt: number;
  let enow = e[0];
  let fnow = f[0];
  let eindex = 0;
  let findex = 0;

  if ((fnow > enow) === (fnow > -enow)) {
    Q = enow; enow = e[++eindex];
  } else {
    Q = fnow; fnow = f[++findex];
  }

  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if ((fnow > enow) === (fnow > -enow)) {
      Qnew = enow + Q; hh = Q - (Qnew - enow); enow = e[++eindex];
    } else {
      Qnew = fnow + Q; hh = Q - (Qnew - fnow); fnow = f[++findex];
    }
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;

    while (eindex < elen && findex < flen) {
      if ((fnow > enow) === (fnow > -enow)) {
        Qnew = Q + enow; bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt); enow = e[++eindex];
      } else {
        Qnew = Q + fnow; bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt); fnow = f[++findex];
      }
      Q = Qnew;
      if (hh !== 0) h[hindex++] = hh;
    }
  }

  while (eindex < elen) {
    Qnew = Q + enow; bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt); enow = e[++eindex];
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }

  while (findex < flen) {
    Qnew = Q + fnow; bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt); fnow = f[++findex];
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }

  if (Q !== 0 || hindex === 0) h[hindex++] = Q;
  return hindex;
}

// scale_expansion_zeroelim from predicates.c
function scaleExpansion(
  elen: number, e: Float64Array, b: number, h: Float64Array
): number {
  let Q: number, sum: number, hh: number, product1: number, product0: number;
  let bvirt: number, c: number, ahi: number, alo: number, bhi: number, blo: number;

  c = SPLITTER * b; bhi = c - (c - b); blo = b - bhi;
  let enow = e[0];
  Q = enow * b;
  c = SPLITTER * enow; ahi = c - (c - enow); alo = enow - ahi;
  hh = alo * blo - (Q - ahi * bhi - alo * bhi - ahi * blo);

  let hindex = 0;
  if (hh !== 0) h[hindex++] = hh;

  for (let i = 1; i < elen; i++) {
    enow = e[i];
    product1 = enow * b;
    c = SPLITTER * enow; ahi = c - (c - enow); alo = enow - ahi;
    product0 = alo * blo - (product1 - ahi * bhi - alo * bhi - ahi * blo);

    sum = Q + product0; bvirt = sum - Q;
    hh = Q - (sum - bvirt) + (product0 - bvirt);
    if (hh !== 0) h[hindex++] = hh;

    Q = product1 + sum; hh = sum - (Q - product1);
    if (hh !== 0) h[hindex++] = hh;
  }

  if (Q !== 0 || hindex === 0) h[hindex++] = Q;
  return hindex;
}

function estimate(elen: number, e: Float64Array): number {
  let Q = e[0];
  for (let i = 1; i < elen; i++) Q += e[i];
  return Q;
}

// orient2d

function orient2dadapt(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, detsum: number
): number {
  let bvirt: number, c: number, ahi: number, alo: number, bhi: number, blo: number;
  let _i: number, _j: number, _0: number, s1: number, s0: number, t1: number, t0: number, u3: number;
  let acxtail: number, acytail: number, bcxtail: number, bcytail: number;

  const acx = ax - cx, bcx = bx - cx, acy = ay - cy, bcy = by - cy;

  s1 = acx * bcy; c = SPLITTER * acx; ahi = c - (c - acx); alo = acx - ahi;
  c = SPLITTER * bcy; bhi = c - (c - bcy); blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx; c = SPLITTER * acy; ahi = c - (c - acy); alo = acy - ahi;
  c = SPLITTER * bcx; bhi = c - (c - bcx); blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);

  _i = s0 - t0; bvirt = s0 - _i;
  o2dB[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  o2dB[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  o2dB[2] = _j - (u3 - bvirt) + (_i - bvirt);
  o2dB[3] = u3;

  let det = estimate(4, o2dB);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) return det;

  bvirt = ax - acx; acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx; bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy; acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy; bcytail = by - (bcy + bvirt) + (bvirt - cy);

  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) return det;

  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += (acx * bcytail + bcy * acxtail) - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;

  s1 = acxtail * bcy; c = SPLITTER * acxtail; ahi = c - (c - acxtail); alo = acxtail - ahi;
  c = SPLITTER * bcy; bhi = c - (c - bcy); blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx; c = SPLITTER * acytail; ahi = c - (c - acytail); alo = acytail - ahi;
  c = SPLITTER * bcx; bhi = c - (c - bcx); blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i;
  o2du[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  o2du[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  o2du[2] = _j - (u3 - bvirt) + (_i - bvirt); o2du[3] = u3;
  const C1len = expansionSum(4, o2dB, 4, o2du, o2dC1);

  s1 = acx * bcytail; c = SPLITTER * acx; ahi = c - (c - acx); alo = acx - ahi;
  c = SPLITTER * bcytail; bhi = c - (c - bcytail); blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail; c = SPLITTER * acy; ahi = c - (c - acy); alo = acy - ahi;
  c = SPLITTER * bcxtail; bhi = c - (c - bcxtail); blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i;
  o2du[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  o2du[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  o2du[2] = _j - (u3 - bvirt) + (_i - bvirt); o2du[3] = u3;
  const C2len = expansionSum(C1len, o2dC1, 4, o2du, o2dC2);

  s1 = acxtail * bcytail; c = SPLITTER * acxtail; ahi = c - (c - acxtail); alo = acxtail - ahi;
  c = SPLITTER * bcytail; bhi = c - (c - bcytail); blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail; c = SPLITTER * acytail; ahi = c - (c - acytail); alo = acytail - ahi;
  c = SPLITTER * bcxtail; bhi = c - (c - bcxtail); blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i;
  o2du[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  o2du[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  o2du[2] = _j - (u3 - bvirt) + (_i - bvirt); o2du[3] = u3;
  const Dlen = expansionSum(C2len, o2dC2, 4, o2du, o2dD);

  return o2dD[Dlen - 1];
}

// orient2d sign, with adaptive exact fallback
function adaptiveOrient2dSign(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number
): number {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;

  if (detleft > 0) { if (detright <= 0) return det > 0 ? 1 : det < 0 ? -1 : 0; }
  else if (detleft < 0) { if (detright >= 0) return det > 0 ? 1 : det < 0 ? -1 : 0; }
  else { return det > 0 ? 1 : det < 0 ? -1 : 0; }

  const detsum = detleft > 0 ? detleft + detright : -detleft - detright;
  const errbound = ccwerrboundA * detsum;
  if (det >= errbound || -det >= errbound) return det > 0 ? 1 : -1;

  const result = orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
  return result > 0 ? 1 : result < 0 ? -1 : 0;
}

// incircle

function icFinadd(finlen: number, alen: number, a: Float64Array): number {
  finlen = expansionSum(finlen, icfin, alen, a, icfin2);
  const tmp = icfin; icfin = icfin2; icfin2 = tmp;
  return finlen;
}

function incircleadapt(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
  permanent: number
): number {
  let bvirt: number, c: number, ahi: number, alo: number, bhi: number, blo: number;
  let _i: number, _j: number, _0: number, s1: number, s0: number, t1: number, t0: number, u3: number;
  let finlen: number;
  let adxtail: number, bdxtail: number, cdxtail: number;
  let adytail: number, bdytail: number, cdytail: number;
  let axtbclen = 0, aytbclen = 0, bxtcalen = 0, bytcalen = 0, cxtablen = 0, cytablen = 0;
  let n1: number, n0: number;

  const adx = ax - dx, bdx = bx - dx, cdx = cx - dx;
  const ady = ay - dy, bdy = by - dy, cdy = cy - dy;

  // bc = bdx*cdy - cdx*bdy as exact expansion
  s1 = bdx * cdy; c = SPLITTER * bdx; ahi = c - (c - bdx); alo = bdx - ahi;
  c = SPLITTER * cdy; bhi = c - (c - cdy); blo = cdy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = cdx * bdy; c = SPLITTER * cdx; ahi = c - (c - cdx); alo = cdx - ahi;
  c = SPLITTER * bdy; bhi = c - (c - bdy); blo = bdy - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i;
  icbc[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  icbc[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  icbc[2] = _j - (u3 - bvirt) + (_i - bvirt); icbc[3] = u3;

  // ca = cdx*ady - adx*cdy
  s1 = cdx * ady; c = SPLITTER * cdx; ahi = c - (c - cdx); alo = cdx - ahi;
  c = SPLITTER * ady; bhi = c - (c - ady); blo = ady - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = adx * cdy; c = SPLITTER * adx; ahi = c - (c - adx); alo = adx - ahi;
  c = SPLITTER * cdy; bhi = c - (c - cdy); blo = cdy - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i;
  icca[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  icca[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  icca[2] = _j - (u3 - bvirt) + (_i - bvirt); icca[3] = u3;

  // ab = adx*bdy - bdx*ady
  s1 = adx * bdy; c = SPLITTER * adx; ahi = c - (c - adx); alo = adx - ahi;
  c = SPLITTER * bdy; bhi = c - (c - bdy); blo = bdy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = bdx * ady; c = SPLITTER * bdx; ahi = c - (c - bdx); alo = bdx - ahi;
  c = SPLITTER * ady; bhi = c - (c - ady); blo = ady - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i;
  icab[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i;
  icab[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j;
  icab[2] = _j - (u3 - bvirt) + (_i - bvirt); icab[3] = u3;

  finlen = expansionSum(
    expansionSum(
      expansionSum(
        scaleExpansion(scaleExpansion(4, icbc, adx, ic8), ic8, adx, ic16), ic16,
        scaleExpansion(scaleExpansion(4, icbc, ady, ic8), ic8, ady, ic16b), ic16b, ic32
      ), ic32,
      expansionSum(
        scaleExpansion(scaleExpansion(4, icca, bdx, ic8), ic8, bdx, ic16), ic16,
        scaleExpansion(scaleExpansion(4, icca, bdy, ic8), ic8, bdy, ic16b), ic16b, ic32b
      ), ic32b, ic64
    ), ic64,
    expansionSum(
      scaleExpansion(scaleExpansion(4, icab, cdx, ic8), ic8, cdx, ic16), ic16,
      scaleExpansion(scaleExpansion(4, icab, cdy, ic8), ic8, cdy, ic16b), ic16b, ic32
    ), ic32, icfin
  );

  let det = estimate(finlen, icfin);
  let errbound = iccerrboundB * permanent;
  if (det >= errbound || -det >= errbound) return det;

  bvirt = ax - adx; adxtail = ax - (adx + bvirt) + (bvirt - dx);
  bvirt = ay - ady; adytail = ay - (ady + bvirt) + (bvirt - dy);
  bvirt = bx - bdx; bdxtail = bx - (bdx + bvirt) + (bvirt - dx);
  bvirt = by - bdy; bdytail = by - (bdy + bvirt) + (bvirt - dy);
  bvirt = cx - cdx; cdxtail = cx - (cdx + bvirt) + (bvirt - dx);
  bvirt = cy - cdy; cdytail = cy - (cdy + bvirt) + (bvirt - dy);

  if (adxtail === 0 && bdxtail === 0 && cdxtail === 0 &&
      adytail === 0 && bdytail === 0 && cdytail === 0) return det;

  errbound = iccerrboundC * permanent + resulterrbound * Math.abs(det);
  det += ((adx * adx + ady * ady) * ((bdx * cdytail + cdy * bdxtail) - (bdy * cdxtail + cdx * bdytail)) +
      2 * (adx * adxtail + ady * adytail) * (bdx * cdy - bdy * cdx)) +
      ((bdx * bdx + bdy * bdy) * ((cdx * adytail + ady * cdxtail) - (cdy * adxtail + adx * cdytail)) +
      2 * (bdx * bdxtail + bdy * bdytail) * (cdx * ady - cdy * adx)) +
      ((cdx * cdx + cdy * cdy) * ((adx * bdytail + bdy * adxtail) - (ady * bdxtail + bdx * adytail)) +
      2 * (cdx * cdxtail + cdy * cdytail) * (adx * bdy - ady * bdx));
  if (det >= errbound || -det >= errbound) return det;

  // Stage C: full exact arithmetic with tail terms
  if (bdxtail !== 0 || bdytail !== 0 || cdxtail !== 0 || cdytail !== 0) {
    s1 = adx * adx; c = SPLITTER * adx; ahi = c - (c - adx); alo = adx - ahi;
    s0 = alo * alo - (s1 - ahi * ahi - (ahi + ahi) * alo);
    t1 = ady * ady; c = SPLITTER * ady; ahi = c - (c - ady); alo = ady - ahi;
    t0 = alo * alo - (t1 - ahi * ahi - (ahi + ahi) * alo);
    _i = s0 + t0; bvirt = _i - s0; icaa[0] = s0 - (_i - bvirt) + (t0 - bvirt);
    _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 + t1; bvirt = _i - _0; icaa[1] = _0 - (_i - bvirt) + (t1 - bvirt);
    u3 = _j + _i; bvirt = u3 - _j; icaa[2] = _j - (u3 - bvirt) + (_i - bvirt); icaa[3] = u3;
  }
  if (cdxtail !== 0 || cdytail !== 0 || adxtail !== 0 || adytail !== 0) {
    s1 = bdx * bdx; c = SPLITTER * bdx; ahi = c - (c - bdx); alo = bdx - ahi;
    s0 = alo * alo - (s1 - ahi * ahi - (ahi + ahi) * alo);
    t1 = bdy * bdy; c = SPLITTER * bdy; ahi = c - (c - bdy); alo = bdy - ahi;
    t0 = alo * alo - (t1 - ahi * ahi - (ahi + ahi) * alo);
    _i = s0 + t0; bvirt = _i - s0; icbb[0] = s0 - (_i - bvirt) + (t0 - bvirt);
    _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 + t1; bvirt = _i - _0; icbb[1] = _0 - (_i - bvirt) + (t1 - bvirt);
    u3 = _j + _i; bvirt = u3 - _j; icbb[2] = _j - (u3 - bvirt) + (_i - bvirt); icbb[3] = u3;
  }
  if (adxtail !== 0 || adytail !== 0 || bdxtail !== 0 || bdytail !== 0) {
    s1 = cdx * cdx; c = SPLITTER * cdx; ahi = c - (c - cdx); alo = cdx - ahi;
    s0 = alo * alo - (s1 - ahi * ahi - (ahi + ahi) * alo);
    t1 = cdy * cdy; c = SPLITTER * cdy; ahi = c - (c - cdy); alo = cdy - ahi;
    t0 = alo * alo - (t1 - ahi * ahi - (ahi + ahi) * alo);
    _i = s0 + t0; bvirt = _i - s0; iccc[0] = s0 - (_i - bvirt) + (t0 - bvirt);
    _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 + t1; bvirt = _i - _0; iccc[1] = _0 - (_i - bvirt) + (t1 - bvirt);
    u3 = _j + _i; bvirt = u3 - _j; iccc[2] = _j - (u3 - bvirt) + (_i - bvirt); iccc[3] = u3;
  }

  const sum3 = (al: number, a: Float64Array, bl: number, b: Float64Array, cl: number, cv: Float64Array): number => {
    const tl = expansionSum(al, a, bl, b, ic32);
    return expansionSum(tl, ic32, cl, cv, ic48);
  };

  if (adxtail !== 0) {
    axtbclen = scaleExpansion(4, icbc, adxtail, icaxtbc);
    finlen = icFinadd(finlen, sum3(
      scaleExpansion(axtbclen, icaxtbc, 2 * adx, ic16), ic16,
      scaleExpansion(scaleExpansion(4, iccc, adxtail, ic8), ic8, bdy, ic16b), ic16b,
      scaleExpansion(scaleExpansion(4, icbb, adxtail, ic8), ic8, -cdy, ic16c), ic16c), ic48);
  }
  if (adytail !== 0) {
    aytbclen = scaleExpansion(4, icbc, adytail, icaytbc);
    finlen = icFinadd(finlen, sum3(
      scaleExpansion(aytbclen, icaytbc, 2 * ady, ic16), ic16,
      scaleExpansion(scaleExpansion(4, icbb, adytail, ic8), ic8, cdx, ic16b), ic16b,
      scaleExpansion(scaleExpansion(4, iccc, adytail, ic8), ic8, -bdx, ic16c), ic16c), ic48);
  }
  if (bdxtail !== 0) {
    bxtcalen = scaleExpansion(4, icca, bdxtail, icbxtca);
    finlen = icFinadd(finlen, sum3(
      scaleExpansion(bxtcalen, icbxtca, 2 * bdx, ic16), ic16,
      scaleExpansion(scaleExpansion(4, icaa, bdxtail, ic8), ic8, cdy, ic16b), ic16b,
      scaleExpansion(scaleExpansion(4, iccc, bdxtail, ic8), ic8, -ady, ic16c), ic16c), ic48);
  }
  if (bdytail !== 0) {
    bytcalen = scaleExpansion(4, icca, bdytail, icbytca);
    finlen = icFinadd(finlen, sum3(
      scaleExpansion(bytcalen, icbytca, 2 * bdy, ic16), ic16,
      scaleExpansion(scaleExpansion(4, iccc, bdytail, ic8), ic8, adx, ic16b), ic16b,
      scaleExpansion(scaleExpansion(4, icaa, bdytail, ic8), ic8, -cdx, ic16c), ic16c), ic48);
  }
  if (cdxtail !== 0) {
    cxtablen = scaleExpansion(4, icab, cdxtail, iccxtab);
    finlen = icFinadd(finlen, sum3(
      scaleExpansion(cxtablen, iccxtab, 2 * cdx, ic16), ic16,
      scaleExpansion(scaleExpansion(4, icbb, cdxtail, ic8), ic8, ady, ic16b), ic16b,
      scaleExpansion(scaleExpansion(4, icaa, cdxtail, ic8), ic8, -bdy, ic16c), ic16c), ic48);
  }
  if (cdytail !== 0) {
    cytablen = scaleExpansion(4, icab, cdytail, iccytab);
    finlen = icFinadd(finlen, sum3(
      scaleExpansion(cytablen, iccytab, 2 * cdy, ic16), ic16,
      scaleExpansion(scaleExpansion(4, icaa, cdytail, ic8), ic8, bdx, ic16b), ic16b,
      scaleExpansion(scaleExpansion(4, icbb, cdytail, ic8), ic8, -adx, ic16c), ic16c), ic48);
  }

  // Cross-tail terms
  const icv = new Float64Array(4);
  let bctlen: number, catlen: number, abtlen: number;
  let bcttlen: number, cattlen: number, abttlen: number;

  if (adxtail !== 0 || adytail !== 0) {
    if (bdxtail !== 0 || bdytail !== 0 || cdxtail !== 0 || cdytail !== 0) {
      s1 = bdxtail * cdy; c = SPLITTER * bdxtail; ahi = c - (c - bdxtail); alo = bdxtail - ahi;
      c = SPLITTER * cdy; bhi = c - (c - cdy); blo = cdy - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = bdx * cdytail; c = SPLITTER * bdx; ahi = c - (c - bdx); alo = bdx - ahi;
      c = SPLITTER * cdytail; bhi = c - (c - cdytail); blo = cdytail - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 + t0; bvirt = _i - s0; icu[0] = s0 - (_i - bvirt) + (t0 - bvirt);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 + t1; bvirt = _i - _0; icu[1] = _0 - (_i - bvirt) + (t1 - bvirt);
      u3 = _j + _i; bvirt = u3 - _j; icu[2] = _j - (u3 - bvirt) + (_i - bvirt); icu[3] = u3;

      n1 = -bdy; n0 = -bdytail;
      s1 = cdxtail * n1; c = SPLITTER * cdxtail; ahi = c - (c - cdxtail); alo = cdxtail - ahi;
      c = SPLITTER * n1; bhi = c - (c - n1); blo = n1 - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = cdx * n0; c = SPLITTER * cdx; ahi = c - (c - cdx); alo = cdx - ahi;
      c = SPLITTER * n0; bhi = c - (c - n0); blo = n0 - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 + t0; bvirt = _i - s0; icv[0] = s0 - (_i - bvirt) + (t0 - bvirt);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 + t1; bvirt = _i - _0; icv[1] = _0 - (_i - bvirt) + (t1 - bvirt);
      u3 = _j + _i; bvirt = u3 - _j; icv[2] = _j - (u3 - bvirt) + (_i - bvirt); icv[3] = u3;
      bctlen = expansionSum(4, icu, 4, icv, icbct);

      s1 = bdxtail * cdytail; c = SPLITTER * bdxtail; ahi = c - (c - bdxtail); alo = bdxtail - ahi;
      c = SPLITTER * cdytail; bhi = c - (c - cdytail); blo = cdytail - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = cdxtail * bdytail; c = SPLITTER * cdxtail; ahi = c - (c - cdxtail); alo = cdxtail - ahi;
      c = SPLITTER * bdytail; bhi = c - (c - bdytail); blo = bdytail - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 - t0; bvirt = s0 - _i;
      icbctt[0] = s0 - (_i + bvirt) + (bvirt - t0);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 - t1; bvirt = _0 - _i;
      icbctt[1] = _0 - (_i + bvirt) + (bvirt - t1);
      u3 = _j + _i; bvirt = u3 - _j; icbctt[2] = _j - (u3 - bvirt) + (_i - bvirt); icbctt[3] = u3;
      bcttlen = 4;
    } else { icbct[0] = 0; bctlen = 1; icbctt[0] = 0; bcttlen = 1; }

    if (adxtail !== 0) {
      const len = scaleExpansion(bctlen, icbct, adxtail, ic16c);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(axtbclen, icaxtbc, adxtail, ic16), ic16,
        scaleExpansion(len, ic16c, 2 * adx, ic32), ic32, ic48), ic48);
      const len2 = scaleExpansion(bcttlen, icbctt, adxtail, ic8);
      const t32bl = expansionSum(scaleExpansion(len2, ic8, 2 * adx, ic16), ic16,
        scaleExpansion(len2, ic8, adxtail, ic16b), ic16b, ic32b);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(len, ic16c, adxtail, ic32), ic32, t32bl, ic32b, ic64), ic64);
      if (bdytail !== 0) finlen = icFinadd(finlen, scaleExpansion(scaleExpansion(4, iccc, adxtail, ic8), ic8, bdytail, ic16), ic16);
      if (cdytail !== 0) finlen = icFinadd(finlen, scaleExpansion(scaleExpansion(4, icbb, -adxtail, ic8), ic8, cdytail, ic16), ic16);
    }
    if (adytail !== 0) {
      const len = scaleExpansion(bctlen, icbct, adytail, ic16c);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(aytbclen, icaytbc, adytail, ic16), ic16,
        scaleExpansion(len, ic16c, 2 * ady, ic32), ic32, ic48), ic48);
      const len2 = scaleExpansion(bcttlen, icbctt, adytail, ic8);
      const t32bl = expansionSum(scaleExpansion(len2, ic8, 2 * ady, ic16), ic16,
        scaleExpansion(len2, ic8, adytail, ic16b), ic16b, ic32b);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(len, ic16c, adytail, ic32), ic32, t32bl, ic32b, ic64), ic64);
    }
  }

  if (bdxtail !== 0 || bdytail !== 0) {
    if (cdxtail !== 0 || cdytail !== 0 || adxtail !== 0 || adytail !== 0) {
      s1 = cdxtail * ady; c = SPLITTER * cdxtail; ahi = c - (c - cdxtail); alo = cdxtail - ahi;
      c = SPLITTER * ady; bhi = c - (c - ady); blo = ady - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = cdx * adytail; c = SPLITTER * cdx; ahi = c - (c - cdx); alo = cdx - ahi;
      c = SPLITTER * adytail; bhi = c - (c - adytail); blo = adytail - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 + t0; bvirt = _i - s0; icu[0] = s0 - (_i - bvirt) + (t0 - bvirt);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 + t1; bvirt = _i - _0; icu[1] = _0 - (_i - bvirt) + (t1 - bvirt);
      u3 = _j + _i; bvirt = u3 - _j; icu[2] = _j - (u3 - bvirt) + (_i - bvirt); icu[3] = u3;

      n1 = -cdy; n0 = -cdytail;
      s1 = adxtail * n1; c = SPLITTER * adxtail; ahi = c - (c - adxtail); alo = adxtail - ahi;
      c = SPLITTER * n1; bhi = c - (c - n1); blo = n1 - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = adx * n0; c = SPLITTER * adx; ahi = c - (c - adx); alo = adx - ahi;
      c = SPLITTER * n0; bhi = c - (c - n0); blo = n0 - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 + t0; bvirt = _i - s0; icv[0] = s0 - (_i - bvirt) + (t0 - bvirt);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 + t1; bvirt = _i - _0; icv[1] = _0 - (_i - bvirt) + (t1 - bvirt);
      u3 = _j + _i; bvirt = u3 - _j; icv[2] = _j - (u3 - bvirt) + (_i - bvirt); icv[3] = u3;
      catlen = expansionSum(4, icu, 4, icv, iccat);

      s1 = cdxtail * adytail; c = SPLITTER * cdxtail; ahi = c - (c - cdxtail); alo = cdxtail - ahi;
      c = SPLITTER * adytail; bhi = c - (c - adytail); blo = adytail - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = adxtail * cdytail; c = SPLITTER * adxtail; ahi = c - (c - adxtail); alo = adxtail - ahi;
      c = SPLITTER * cdytail; bhi = c - (c - cdytail); blo = cdytail - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 - t0; bvirt = s0 - _i;
      iccatt[0] = s0 - (_i + bvirt) + (bvirt - t0);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 - t1; bvirt = _0 - _i;
      iccatt[1] = _0 - (_i + bvirt) + (bvirt - t1);
      u3 = _j + _i; bvirt = u3 - _j; iccatt[2] = _j - (u3 - bvirt) + (_i - bvirt); iccatt[3] = u3;
      cattlen = 4;
    } else { iccat[0] = 0; catlen = 1; iccatt[0] = 0; cattlen = 1; }

    if (bdxtail !== 0) {
      const len = scaleExpansion(catlen, iccat, bdxtail, ic16c);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(bxtcalen, icbxtca, bdxtail, ic16), ic16,
        scaleExpansion(len, ic16c, 2 * bdx, ic32), ic32, ic48), ic48);
      const len2 = scaleExpansion(cattlen, iccatt, bdxtail, ic8);
      const t32bl = expansionSum(scaleExpansion(len2, ic8, 2 * bdx, ic16), ic16,
        scaleExpansion(len2, ic8, bdxtail, ic16b), ic16b, ic32b);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(len, ic16c, bdxtail, ic32), ic32, t32bl, ic32b, ic64), ic64);
      if (cdytail !== 0) finlen = icFinadd(finlen, scaleExpansion(scaleExpansion(4, icaa, bdxtail, ic8), ic8, cdytail, ic16), ic16);
      if (adytail !== 0) finlen = icFinadd(finlen, scaleExpansion(scaleExpansion(4, iccc, -bdxtail, ic8), ic8, adytail, ic16), ic16);
    }
    if (bdytail !== 0) {
      const len = scaleExpansion(catlen, iccat, bdytail, ic16c);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(bytcalen, icbytca, bdytail, ic16), ic16,
        scaleExpansion(len, ic16c, 2 * bdy, ic32), ic32, ic48), ic48);
      const len2 = scaleExpansion(cattlen, iccatt, bdytail, ic8);
      const t32bl = expansionSum(scaleExpansion(len2, ic8, 2 * bdy, ic16), ic16,
        scaleExpansion(len2, ic8, bdytail, ic16b), ic16b, ic32b);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(len, ic16c, bdytail, ic32), ic32, t32bl, ic32b, ic64), ic64);
    }
  }

  if (cdxtail !== 0 || cdytail !== 0) {
    if (adxtail !== 0 || adytail !== 0 || bdxtail !== 0 || bdytail !== 0) {
      s1 = adxtail * bdy; c = SPLITTER * adxtail; ahi = c - (c - adxtail); alo = adxtail - ahi;
      c = SPLITTER * bdy; bhi = c - (c - bdy); blo = bdy - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = adx * bdytail; c = SPLITTER * adx; ahi = c - (c - adx); alo = adx - ahi;
      c = SPLITTER * bdytail; bhi = c - (c - bdytail); blo = bdytail - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 + t0; bvirt = _i - s0; icu[0] = s0 - (_i - bvirt) + (t0 - bvirt);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 + t1; bvirt = _i - _0; icu[1] = _0 - (_i - bvirt) + (t1 - bvirt);
      u3 = _j + _i; bvirt = u3 - _j; icu[2] = _j - (u3 - bvirt) + (_i - bvirt); icu[3] = u3;

      n1 = -ady; n0 = -adytail;
      s1 = bdxtail * n1; c = SPLITTER * bdxtail; ahi = c - (c - bdxtail); alo = bdxtail - ahi;
      c = SPLITTER * n1; bhi = c - (c - n1); blo = n1 - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = bdx * n0; c = SPLITTER * bdx; ahi = c - (c - bdx); alo = bdx - ahi;
      c = SPLITTER * n0; bhi = c - (c - n0); blo = n0 - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 + t0; bvirt = _i - s0; icv[0] = s0 - (_i - bvirt) + (t0 - bvirt);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 + t1; bvirt = _i - _0; icv[1] = _0 - (_i - bvirt) + (t1 - bvirt);
      u3 = _j + _i; bvirt = u3 - _j; icv[2] = _j - (u3 - bvirt) + (_i - bvirt); icv[3] = u3;
      abtlen = expansionSum(4, icu, 4, icv, icabt);

      s1 = adxtail * bdytail; c = SPLITTER * adxtail; ahi = c - (c - adxtail); alo = adxtail - ahi;
      c = SPLITTER * bdytail; bhi = c - (c - bdytail); blo = bdytail - bhi;
      s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
      t1 = bdxtail * adytail; c = SPLITTER * bdxtail; ahi = c - (c - bdxtail); alo = bdxtail - ahi;
      c = SPLITTER * adytail; bhi = c - (c - adytail); blo = adytail - bhi;
      t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
      _i = s0 - t0; bvirt = s0 - _i;
      icabtt[0] = s0 - (_i + bvirt) + (bvirt - t0);
      _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
      _i = _0 - t1; bvirt = _0 - _i;
      icabtt[1] = _0 - (_i + bvirt) + (bvirt - t1);
      u3 = _j + _i; bvirt = u3 - _j; icabtt[2] = _j - (u3 - bvirt) + (_i - bvirt); icabtt[3] = u3;
      abttlen = 4;
    } else { icabt[0] = 0; abtlen = 1; icabtt[0] = 0; abttlen = 1; }

    if (cdxtail !== 0) {
      const len = scaleExpansion(abtlen, icabt, cdxtail, ic16c);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(cxtablen, iccxtab, cdxtail, ic16), ic16,
        scaleExpansion(len, ic16c, 2 * cdx, ic32), ic32, ic48), ic48);
      const len2 = scaleExpansion(abttlen, icabtt, cdxtail, ic8);
      const t32bl = expansionSum(scaleExpansion(len2, ic8, 2 * cdx, ic16), ic16,
        scaleExpansion(len2, ic8, cdxtail, ic16b), ic16b, ic32b);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(len, ic16c, cdxtail, ic32), ic32, t32bl, ic32b, ic64), ic64);
      if (adytail !== 0) finlen = icFinadd(finlen, scaleExpansion(scaleExpansion(4, icbb, cdxtail, ic8), ic8, adytail, ic16), ic16);
      if (bdytail !== 0) finlen = icFinadd(finlen, scaleExpansion(scaleExpansion(4, icaa, -cdxtail, ic8), ic8, bdytail, ic16), ic16);
    }
    if (cdytail !== 0) {
      const len = scaleExpansion(abtlen, icabt, cdytail, ic16c);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(cytablen, iccytab, cdytail, ic16), ic16,
        scaleExpansion(len, ic16c, 2 * cdy, ic32), ic32, ic48), ic48);
      const len2 = scaleExpansion(abttlen, icabtt, cdytail, ic8);
      const t32bl = expansionSum(scaleExpansion(len2, ic8, 2 * cdy, ic16), ic16,
        scaleExpansion(len2, ic8, cdytail, ic16b), ic16b, ic32b);
      finlen = icFinadd(finlen, expansionSum(
        scaleExpansion(len, ic16c, cdytail, ic32), ic32, t32bl, ic32b, ic64), ic64);
    }
  }

  return icfin[finlen - 1];
}


// incircle sign, with adaptive exact fallback
function adaptiveIncircleSign(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): number {
  const adx = ax - dx, bdx = bx - dx, cdx = cx - dx;
  const ady = ay - dy, bdy = by - dy, cdy = cy - dy;

  const bdxcdy = bdx * cdy, cdxbdy = cdx * bdy;
  const alift = adx * adx + ady * ady;
  const cdxady = cdx * ady, adxcdy = adx * cdy;
  const blift = bdx * bdx + bdy * bdy;
  const adxbdy = adx * bdy, bdxady = bdx * ady;
  const clift = cdx * cdx + cdy * cdy;

  const det = alift * (bdxcdy - cdxbdy) + blift * (cdxady - adxcdy) + clift * (adxbdy - bdxady);
  const permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * alift +
    (Math.abs(cdxady) + Math.abs(adxcdy)) * blift +
    (Math.abs(adxbdy) + Math.abs(bdxady)) * clift;

  const errbound = iccerrboundA * permanent;
  if (det > errbound || -det > errbound) return det > 0 ? 1 : -1;

  const result = incircleadapt(ax, ay, bx, by, cx, cy, dx, dy, permanent);
  return result > 0 ? 1 : result < 0 ? -1 : 0;
}

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
  pendingDelaunay: boolean = false;
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
  private fastMath: boolean = false;

  constructor(delaunay: boolean = true) {
    this.useDelaunay = delaunay;
  }

  private updateFastMath(paths: Paths64): void {
    let hasPoint = false;
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    let safe = true;

    for (const path of paths) {
      for (const pt of path) {
        if (!Number.isSafeInteger(pt.x) || !Number.isSafeInteger(pt.y)) {
          safe = false;
          break;
        }
        if (!hasPoint) {
          hasPoint = true;
          minX = pt.x;
          maxX = pt.x;
          minY = pt.y;
          maxY = pt.y;
        } else {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
      if (!safe) break;
    }

    if (!safe || !hasPoint) {
      this.fastMath = false;
      return;
    }

    const maxDeltaX = maxX - minX;
    const maxDeltaY = maxY - minY;
    this.fastMath = Math.max(maxDeltaX, maxDeltaY) <= Delaunay.maxSafeDelta;
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
    while (this.crossProductSign(path[iPrev], path[i], path[iNext]) === 0) {
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

    if (this.leftTurning(path[iPrev], path[i], path[iNext]))
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
      if (this.crossProductSign(vPrev.pt, path[i], path[iNext]) === 0) {
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

        while (this.crossProductSign(vPrev.pt, path[i], path[iNext]) === 0) {
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

        while (this.crossProductSign(vPrev.pt, path[i], path[iNext]) === 0) {
          i = iNext;
          iNext = Delaunay.next(i, len);
        }
      }

      // now at the next locMin
      if (i === i0) break;
      if (this.leftTurning(vPrevPrev.pt, vPrev.pt, path[i]))
        vPrev.innerLM = true;
    }

    this.createEdge(v0, vPrev, EdgeKind.descend);

    // finally, ignore this path if is not a polygon or too small
    const pathLen = this.allVertices.length - vert_cnt;
    const idx = vert_cnt;
    if (pathLen < 3 || (pathLen === 3 &&
      ((this.distSqr(this.allVertices[idx].pt, this.allVertices[idx + 1].pt) <= 1) ||
        (this.distSqr(this.allVertices[idx + 1].pt, this.allVertices[idx + 2].pt) <= 1) ||
        (this.distSqr(this.allVertices[idx + 2].pt, this.allVertices[idx].pt) <= 1)))) {
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
      const e1vR = e1.vR.pt.x;
      const e1vB = e1.vB.pt.y;
      const e1vT = e1.vT.pt.y;
      for (let i2 = i1 + 1; i2 < this.allEdges.length; ++i2) {
        const e2 = this.allEdges[i2];
        if (e2.vL.pt.x >= e1vR)
          break;

        if (e2.vT.pt.y < e1vB && e2.vB.pt.y > e1vT &&
          this.segsIntersect(e2.vL.pt, e2.vR.pt, e1.vL.pt, e1.vR.pt) === IntersectKind.intersect) {
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
            this.crossProductSign(e1.vT.pt, v1.pt, e2.vT.pt) !== 0)
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

    let d = this.shortestDistFromSegment(e1.vL.pt, e2.vL.pt, e2.vR.pt);
    let d2 = this.shortestDistFromSegment(e1.vR.pt, e2.vL.pt, e2.vR.pt);
    if (d2 < d) { d = d2; v = e1.vR; }

    d2 = this.shortestDistFromSegment(e2.vL.pt, e1.vL.pt, e1.vR.pt);
    if (d2 < d) { d = d2; tmpE = e1; v = e2.vL; }

    d2 = this.shortestDistFromSegment(e2.vR.pt, e1.vL.pt, e1.vR.pt);
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
      this.queuePendingDelaunay(res);
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

    const cpsA = this.crossProductSign(vertA.pt, edge.vL.pt, edge.vR.pt);
    if (cpsA === 0)
      return;

    const cpsB = this.crossProductSign(vertB.pt, edge.vL.pt, edge.vR.pt);
    if (cpsB === 0 || cpsA === cpsB)
      return;

    const ictResult = this.inCircleTest(vertA.pt, edge.vL.pt, edge.vR.pt, vertB.pt);
    if (ictResult === 0 ||
      (this.rightTurning(vertA.pt, edge.vL.pt, edge.vR.pt) === (ictResult < 0)))
      return;

    edge.vL = vertA;
    edge.vR = vertB;

    edge.triA!.edges[0] = edge;
    for (let i = 1; i < 3; ++i) {
      const eAi = edgesA[i]!;
      edge.triA!.edges[i] = eAi;
      if (Delaunay.isLooseEdge(eAi))
        this.queuePendingDelaunay(eAi);

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
        this.queuePendingDelaunay(eBi);

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
        !this.leftTurning(e.vL.pt, vAbove.pt, e.vR.pt)) {
        const d = this.shortestDistFromSegment(vAbove.pt, e.vL.pt, e.vR.pt);
        if (eBelow === null || d < bestD) {
          eBelow = e;
          bestD = d;
        }
      }
      e = e.nextE;
    }

    if (eBelow === null) return null;

    let vBest = (eBelow.vT.pt.y <= yAbove) ? eBelow.vB : eBelow.vT;

    // Iterate until no blocking edge is found for the current bridge vBest->vAbove.
    // We must restart the search whenever vBest changes because edges checked earlier
    // might now intersect the new bridge.
    let changed = true;
    while (changed) {
      changed = false;
      e = this.firstActive;
      while (e !== null) {
        // Skip edges that share a vertex with the bridge (not a true intersection)
        if (e.vB !== vBest && e.vT !== vBest && e.vB !== vAbove && e.vT !== vAbove) {
          if (this.segsIntersect(e.vB.pt, e.vT.pt, vBest.pt, vAbove.pt) === IntersectKind.intersect) {
            // Found a blocking edge - use the vertex closer to yAbove as new vBest
            vBest = (e.vT.pt.y > yAbove) ? e.vT : e.vB;
            changed = true;
            break; // restart search with new vBest
          }
        }
        e = e.nextE;
      }
    }

    return this.createEdge(vBest, vAbove, EdgeKind.loose);
  }


  private doTriangulateLeft(edge: Edge, pivot: Vertex2, minY: number): void {
    let vAlt: Vertex2 | null = null;
    let eAlt: Edge | null = null;

    const v = (edge.vB === pivot) ? edge.vT : edge.vB;

    for (const e of pivot.edges) {
      if (e === edge || !e.isActive) continue;

      const vX = (e.vT === pivot) ? e.vB : e.vT;
      if (vX === v) continue;

    const cps = this.crossProductSign(v.pt, pivot.pt, vX.pt);
      if (cps === 0) {
        if ((v.pt.x > pivot.pt.x) === (pivot.pt.x > vX.pt.x)) continue;
      } else if (cps > 0 || (vAlt !== null && !this.leftTurning(vX.pt, pivot.pt, vAlt.pt)))
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

    const cps = this.crossProductSign(v.pt, pivot.pt, vX.pt);
      if (cps === 0) {
        if ((v.pt.x > pivot.pt.x) === (pivot.pt.x > vX.pt.x)) continue;
      } else if (cps < 0 || (vAlt !== null && !this.rightTurning(vX.pt, pivot.pt, vAlt.pt)))
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

  private queuePendingDelaunay(edge: Edge): void {
    if (edge.pendingDelaunay) return;
    edge.pendingDelaunay = true;
    this.pendingDelaunayStack.push(edge);
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

    this.updateFastMath(paths);

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
        e.pendingDelaunay = false;
        this.forceLegal(e);
      }
    }

    for (const tri of this.allTriangles) {
      const p = Delaunay.pathFromTriangle(tri);
      const cps = this.crossProductSign(p[0], p[1], p[2]);
      if (cps === 0) continue;
      if (cps < 0) p.reverse();
      sol.push(p);
    }

    this.cleanUp();
    return { result: TriangulateResult.success, solution: sol };
  }

  private crossProductSign(p1: Point64, p2: Point64, p3: Point64): number {
    if (this.fastMath) {
      const prod1 = (p2.x - p1.x) * (p3.y - p2.y);
      const prod2 = (p2.y - p1.y) * (p3.x - p2.x);
      return (prod1 > prod2) ? 1 : (prod1 < prod2) ? -1 : 0;
    }
    return -adaptiveOrient2dSign(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  }

  private distSqr(pt1: Point64, pt2: Point64): number {
    return this.distanceSqr(pt1, pt2);
  }

  private distanceSqr(a: Point64, b: Point64): number {
    if (!this.fastMath)
      return Delaunay.distanceSqr(a, b);

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  private shortestDistFromSegment(pt: Point64, segPt1: Point64, segPt2: Point64): number {
    if (!this.fastMath)
      return Delaunay.shortestDistFromSegment(pt, segPt1, segPt2);

    const dx = segPt2.x - segPt1.x;
    const dy = segPt2.y - segPt1.y;
    const ax = pt.x - segPt1.x;
    const ay = pt.y - segPt1.y;
    const qNum = ax * dx + ay * dy;
    const denom = dx * dx + dy * dy;

    if (qNum < 0) return this.distanceSqr(pt, segPt1);
    if (qNum > denom) return this.distanceSqr(pt, segPt2);

    const cross = ax * dy - dx * ay;
    return (cross * cross) / denom;
  }

  private segsIntersect(s1a: Point64, s1b: Point64, s2a: Point64, s2b: Point64): IntersectKind {
    if (!this.fastMath)
      return Delaunay.segsIntersect(s1a, s1b, s2a, s2b);

    // ignore segments sharing an end-point
    if ((s1a.x === s2a.x && s1a.y === s2a.y) ||
        (s1a.x === s2b.x && s1a.y === s2b.y) ||
        (s1b.x === s2b.x && s1b.y === s2b.y)) return IntersectKind.none;

    const dy1 = s1b.y - s1a.y;
    const dx1 = s1b.x - s1a.x;
    const dy2 = s2b.y - s2a.y;
    const dx2 = s2b.x - s2a.x;
    const dxs = s1a.x - s2a.x;
    const dys = s1a.y - s2a.y;

    const cp = dy1 * dx2 - dy2 * dx1;
    if (cp === 0) return IntersectKind.collinear;

    let t = dxs * dy2 - dys * dx2;

    // nb: testing for t === 0 is unreliable due to float imprecision
    if (t >= 0) {
      if (cp < 0 || t >= cp) return IntersectKind.none;
    } else {
      if (cp > 0 || t <= cp) return IntersectKind.none;
    }

    t = dxs * dy1 - dys * dx1;

    if (t >= 0) {
      if (cp > 0 && t < cp) return IntersectKind.intersect;
    } else {
      if (cp < 0 && t > cp) return IntersectKind.intersect;
    }

    return IntersectKind.none;
  }

  private inCircleTest(ptA: Point64, ptB: Point64, ptC: Point64, ptD: Point64): number {
    if (this.fastMath) {
      const ax = ptA.x - ptD.x, ay = ptA.y - ptD.y;
      const bx = ptB.x - ptD.x, by = ptB.y - ptD.y;
      const cx = ptC.x - ptD.x, cy = ptC.y - ptD.y;
      const det = (ax * ax + ay * ay) * (bx * cy - cx * by) +
                  (bx * bx + by * by) * (cx * ay - ax * cy) +
                  (cx * cx + cy * cy) * (ax * by - bx * ay);
      return det > 0 ? 1 : det < 0 ? -1 : 0;
    }
    return adaptiveIncircleSign(ptA.x, ptA.y, ptB.x, ptB.y, ptC.x, ptC.y, ptD.x, ptD.y);
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

  private leftTurning(p1: Point64, p2: Point64, p3: Point64): boolean {
    return this.crossProductSign(p1, p2, p3) < 0;
  }

  private rightTurning(p1: Point64, p2: Point64, p3: Point64): boolean {
    return this.crossProductSign(p1, p2, p3) > 0;
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
    // Swap-with-last-and-pop: O(1) instead of O(n) splice.
    // Edge order in the array doesn't matter.
    const last = vert.edges.length - 1;
    if (idx !== last) vert.edges[idx] = vert.edges[last];
    vert.edges.pop();
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

  private static readonly maxSafeDelta = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER / 2));

  private static areSafeDeltas(...vals: number[]): boolean {
    for (const v of vals) {
      if (Math.abs(v) > Delaunay.maxSafeDelta) return false;
    }
    return true;
  }

  private static inCircleTest(ptA: Point64, ptB: Point64, ptC: Point64, ptD: Point64): number {
    return adaptiveIncircleSign(ptA.x, ptA.y, ptB.x, ptB.y, ptC.x, ptC.y, ptD.x, ptD.y);
  }

  private static shortestDistFromSegment(pt: Point64, segPt1: Point64, segPt2: Point64): number {
    const dx = segPt2.x - segPt1.x;
    const dy = segPt2.y - segPt1.y;
    const ax = pt.x - segPt1.x;
    const ay = pt.y - segPt1.y;

    if (Delaunay.areSafeDeltas(dx, dy, ax, ay)) {
      const qNum = ax * dx + ay * dy;
      const denom = dx * dx + dy * dy;
      if (qNum < 0) return Delaunay.distanceSqr(pt, segPt1);
      if (qNum > denom) return Delaunay.distanceSqr(pt, segPt2);
      return (ax * dy - dx * ay) * (ax * dy - dx * ay) / denom;
    }

    const dxB = BigInt(segPt2.x) - BigInt(segPt1.x);
    const dyB = BigInt(segPt2.y) - BigInt(segPt1.y);
    const axB = BigInt(pt.x) - BigInt(segPt1.x);
    const ayB = BigInt(pt.y) - BigInt(segPt1.y);
    const qNum = axB * dxB + ayB * dyB;
    const denom = dxB * dxB + dyB * dyB;
    const B0 = BigInt(0);

    if (qNum < B0) return Delaunay.distanceSqr(pt, segPt1);
    if (qNum > denom) return Delaunay.distanceSqr(pt, segPt2);

    const cross = axB * dyB - dxB * ayB;
    return Number(cross * cross) / Number(denom);
  }

  private static segsIntersect(s1a: Point64, s1b: Point64, s2a: Point64, s2b: Point64): IntersectKind {
    if ((s1a.x === s2a.x && s1a.y === s2a.y) ||
        (s1a.x === s2b.x && s1a.y === s2b.y) ||
        (s1b.x === s2b.x && s1b.y === s2b.y)) return IntersectKind.none;

    const d1 = adaptiveOrient2dSign(s2a.x, s2a.y, s2b.x, s2b.y, s1a.x, s1a.y);
    const d2 = adaptiveOrient2dSign(s2a.x, s2a.y, s2b.x, s2b.y, s1b.x, s1b.y);

    if (d1 === 0 && d2 === 0) return IntersectKind.collinear;
    if (d1 === 0 || d2 === 0 || d1 === d2) return IntersectKind.none;

    const d3 = adaptiveOrient2dSign(s1a.x, s1a.y, s1b.x, s1b.y, s2a.x, s2a.y);
    const d4 = adaptiveOrient2dSign(s1a.x, s1a.y, s1b.x, s1b.y, s2b.x, s2b.y);

    if (d3 === 0 || d4 === 0 || d3 === d4) return IntersectKind.none;

    return IntersectKind.intersect;
  }

  private static distSqr(pt1: Point64, pt2: Point64): number {
    return Delaunay.distanceSqr(pt1, pt2);
  }

  private static distanceSqr(a: Point64, b: Point64): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    if (Delaunay.areSafeDeltas(dx, dy)) {
      const dist = dx * dx + dy * dy;
      if (dist <= Number.MAX_SAFE_INTEGER) return dist;
    }

    const dxB = BigInt(a.x) - BigInt(b.x);
    const dyB = BigInt(a.y) - BigInt(b.y);
    return Number(dxB * dxB + dyB * dyB);
  }
}
