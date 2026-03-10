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
const icv = new Float64Array(4);
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
export function adaptiveOrient2dSign(
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
export function adaptiveIncircleSign(
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
