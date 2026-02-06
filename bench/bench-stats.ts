import { performance } from 'node:perf_hooks';

const DEFAULT_SAMPLE_COUNT = Number(process.env.BENCH_SAMPLES ?? '25');
const DEFAULT_WARMUP_COUNT = Number(process.env.BENCH_WARMUP ?? '5');
const DEFAULT_ALPHA = Number(process.env.BENCH_ALPHA ?? '0.05');

type Samples = number[];

export function logBenchStatsHeader(
  sampleCount: number = DEFAULT_SAMPLE_COUNT,
  warmupCount: number = DEFAULT_WARMUP_COUNT,
  alpha: number = DEFAULT_ALPHA
): void {
  console.log(
    `[bench] samples=${sampleCount} warmup=${warmupCount} alpha=${alpha}`
  );
}

export function runStabilityCheck(
  name: string,
  fn: () => void,
  sampleCount: number = DEFAULT_SAMPLE_COUNT,
  warmupCount: number = DEFAULT_WARMUP_COUNT,
  alpha: number = DEFAULT_ALPHA
): void {
  const a = collectSamples(fn, warmupCount, sampleCount);
  const b = collectSamples(fn, warmupCount, sampleCount);
  const report = welchTTest(a, b);

  const meanA = mean(a);
  const meanB = mean(b);
  const diff = meanB - meanA;
  const rel = meanA === 0 ? 0 : (diff / meanA) * 100;
  const sig = report.pValue < alpha ? 'sig' : 'ns';

  console.log(
    `[stat] ${name} A=${meanA.toFixed(3)}ms B=${meanB.toFixed(3)}ms ` +
      `diff=${diff.toFixed(3)}ms (${rel.toFixed(2)}%) t=${report.t.toFixed(2)} ` +
      `p=${report.pValue.toFixed(4)} ${sig}`
  );
}

function collectSamples(fn: () => void, warmup: number, samples: number): Samples {
  for (let i = 0; i < warmup; i++) fn();

  const data: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    data.push(end - start);
  }
  return data;
}

function mean(values: Samples): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

function variance(values: Samples, m: number): number {
  if (values.length < 2) return 0;
  let total = 0;
  for (const v of values) {
    const d = v - m;
    total += d * d;
  }
  return total / (values.length - 1);
}

function welchTTest(a: Samples, b: Samples): { t: number; df: number; pValue: number } {
  const meanA = mean(a);
  const meanB = mean(b);
  const varA = variance(a, meanA);
  const varB = variance(b, meanB);

  const nA = a.length;
  const nB = b.length;
  const se = Math.sqrt(varA / nA + varB / nB);

  if (!Number.isFinite(se) || se === 0) {
    return { t: 0, df: Math.max(0, nA + nB - 2), pValue: 1 };
  }

  const t = (meanA - meanB) / se;
  const df =
    Math.pow(varA / nA + varB / nB, 2) /
    (Math.pow(varA / nA, 2) / (nA - 1) + Math.pow(varB / nB, 2) / (nB - 1));

  // Normal approximation for p-value
  const p = 2 * (1 - normalCdf(Math.abs(t)));

  return { t, df, pValue: clamp(p, 0, 1) };
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Abramowitz and Stegun approximation
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-absX * absX);
  return sign * y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
