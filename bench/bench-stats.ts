import { performance } from 'node:perf_hooks';

const DEFAULT_SAMPLES = Number(process.env.BENCH_SAMPLES ?? '500');
const DEFAULT_WARMUP = Number(process.env.BENCH_WARMUP ?? '200');
const PAD = 48;

function mean(arr: Float64Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr: Float64Array, m: number): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) { const d = arr[i] - m; s += d * d; }
  return s / (arr.length - 1);
}

// Abramowitz & Stegun 7.1.26
function normCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sgn = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sgn * y);
}

// Cornish-Fisher approximation, accurate for df > 5
function tCDF(t: number, df: number): number {
  const g1 = 1 / (4 * df);
  return normCDF(t * (1 - g1));
}

// Expects equal-length sample arrays
function pairedTest(a: Float64Array, b: Float64Array): {
  meanDiff: number; ci: number; t: number; df: number; p: number; se: number;
} {
  const n = a.length;
  const diffs = new Float64Array(n);
  for (let i = 0; i < n; i++) diffs[i] = a[i] - b[i];
  const m = mean(diffs);
  const v = variance(diffs, m);
  const se = Math.sqrt(v / n);
  const t = se > 0 ? m / se : 0;
  const df = n - 1;
  const p = 2 * (1 - tCDF(Math.abs(t), df));
  const tCrit = 1.96 + 2.4 / df;
  const ci = tCrit * se;
  return { meanDiff: m, ci, t, df, p, se };
}

function time(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

export function logBenchStatsHeader(
  samples: number = DEFAULT_SAMPLES,
  warmup: number = DEFAULT_WARMUP
): void {
  console.log(
    `[bench] ${warmup} warmup + ${samples} samples | paired t-test`
  );
}

// Runs fn as both A and B with paired, alternating-order sampling.
// Significance (*, **, ***) indicates measurement drift, not a real difference
export function runStabilityCheck(
  name: string,
  fn: () => void,
  samples: number = DEFAULT_SAMPLES,
  warmup: number = DEFAULT_WARMUP
): void {
  for (let i = 0; i < warmup; i++) { fn(); fn(); }

  const tA = new Float64Array(samples);
  const tB = new Float64Array(samples);

  // Alternate order to cancel out thermal and JIT drift
  for (let i = 0; i < samples; i++) {
    if (i & 1) { tB[i] = time(fn); tA[i] = time(fn); }
    else       { tA[i] = time(fn); tB[i] = time(fn); }
  }

  const mA = mean(tA), mB = mean(tB);
  const res = pairedTest(tA, tB);
  const pct = mA === 0 ? 0 : ((mB - mA) / mA * 100);
  const sig = res.p < 0.001 ? '***' : res.p < 0.01 ? '**' : res.p < 0.05 ? '*' : ' ns';
  const pStr = res.p < 0.0001 ? '<0.0001' : res.p.toFixed(4);
  const loCI = ((res.meanDiff - res.ci) * 1000).toFixed(1);
  const hiCI = ((res.meanDiff + res.ci) * 1000).toFixed(1);

  console.log(
    `  ${name.padEnd(PAD)}` +
    `  A ${(mA * 1000).toFixed(0).padStart(6)}μs` +
    `  B ${(mB * 1000).toFixed(0).padStart(6)}μs` +
    `  ${pct > 0 ? '+' : ''}${pct.toFixed(1).padStart(5)}%` +
    `  p=${pStr.padEnd(7)} ${sig}` +
    `  CI:[${loCI},${hiCI}]μs`
  );
}
