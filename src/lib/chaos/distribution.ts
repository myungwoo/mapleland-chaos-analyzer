import { kernelOf } from './item';
import type { ChaosProblem, Outcome } from './types';

/**
 * 총지출의 분포.
 *
 * 정책이 정해지면 한 사이클의 결과는 (바른 장수 j, 성공 여부) 뿐이다. 실패 사이클의 지출은
 * P + c·j − S, 성공 사이클은 P + c·j 로 정해져 있으므로 총지출은
 *
 *     T = (실패 사이클 K−1 번의 합) + (마지막 성공 사이클)
 *
 * 이다. 실패 횟수가 기하분포라 K 가 수만까지 갈 수 있어서, 사이클을 하나씩 더해 가는
 * 대신 금액 격자 위에서 **배가법**으로 등비급수 H = Σ F^{*m} 을 합친다.
 *
 *     H_{2n} = H_n + F^{*n} * H_n,   F^{*2n} = F^{*n} * F^{*n}
 *
 * 금액을 격자에 올릴 때는 양 옆 칸에 거리 비례로 나눠 싣는다. 그러면 평균이 정확히 보존되고,
 * 합성곱은 칸 번호의 합이라 이후 연산은 더 이상 반올림 오차를 쌓지 않는다.
 */
export interface CostDistribution {
  /** 격자 한 칸의 금액 */
  tick: number;
  /** cdf[i] = P(총지출 ≤ i·tick) */
  cdf: Float64Array;
  quantile: (p: number) => number;
  /** P(총지출 ≤ budget) */
  probabilityWithin: (budget: number) => number;
  /** 격자에서 다시 잰 평균 (검산용) */
  mean: number;
}

const GRID = 1024;

export function costDistribution(
  problem: ChaosProblem,
  cycles: { succ: Float64Array; fail: Float64Array },
  expectedCost: number,
): CostDistribution | null {
  const { itemPrice: P, scrollPrice: c, salvage: S } = problem;
  const q = cycles.succ.reduce((a, b) => a + b, 0);
  if (!(q > 0) || !Number.isFinite(expectedCost)) return null;

  const maxCycle = P + c * (cycles.succ.length - 1);
  // 총지출의 꼬리는 대략 지수분포라 평균의 14배면 1e-6 밖이다. 한 사이클이 그보다 클 수는 있다.
  const top = Math.max(expectedCost * 14, maxCycle * 2, 1);
  const tick = top / (GRID - 1);

  const place = (arr: Float64Array, value: number, mass: number) => {
    const x = value / tick;
    const i = Math.floor(x);
    const f = x - i;
    if (i < GRID) arr[i] += mass * (1 - f);
    if (i + 1 < GRID) arr[i + 1] += mass * f;
  };

  const F = new Float64Array(GRID);
  const Sd = new Float64Array(GRID);
  for (let j = 0; j < cycles.succ.length; j++) {
    if (cycles.fail[j] > 0) place(F, P + c * j - S, cycles.fail[j]);
    if (cycles.succ[j] > 0) place(Sd, P + c * j, cycles.succ[j]);
  }

  // H = Σ_{m≥0} F^{*m}
  const H = new Float64Array(GRID);
  H[0] = 1;
  let Fn: Float64Array = F;
  for (let round = 0; round < 64; round++) {
    const massF = Fn.reduce((a, b) => a + b, 0);
    if (massF < 1e-13) break;
    const add = convolve(Fn, H);
    for (let i = 0; i < GRID; i++) H[i] += add[i];
    Fn = convolve(Fn, Fn);
  }
  const T = convolve(H, Sd);

  const cdf = new Float64Array(GRID);
  let acc = 0;
  let mean = 0;
  for (let i = 0; i < GRID; i++) {
    acc += T[i];
    mean += T[i] * i * tick;
    cdf[i] = Math.min(1, acc);
  }

  const quantile = (p: number) => {
    for (let i = 0; i < GRID; i++) {
      if (cdf[i] >= p) {
        if (i === 0) return 0;
        const prev = cdf[i - 1];
        const f = cdf[i] > prev ? (p - prev) / (cdf[i] - prev) : 1;
        return (i - 1 + f) * tick;
      }
    }
    return Infinity;
  };

  const probabilityWithin = (budget: number) => {
    if (!(budget >= 0)) return 0;
    const x = budget / tick;
    if (x >= GRID - 1) return cdf[GRID - 1];
    const i = Math.floor(x);
    const f = x - i;
    return cdf[i] * (1 - f) + cdf[i + 1] * f;
  };

  return { tick, cdf, quantile, probabilityWithin, mean };
}

/** 격자 밖으로 넘어가는 질량은 버린다 (꼬리 확률이 그만큼 cdf 끝에서 1 에 못 미친다). */
function convolve(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(GRID);
  let lastB = GRID - 1;
  while (lastB > 0 && b[lastB] === 0) lastB--;
  for (let i = 0; i < GRID; i++) {
    const ai = a[i];
    if (ai === 0) continue;
    const lim = Math.min(lastB, GRID - 1 - i);
    for (let j = 0; j <= lim; j++) out[i + j] += ai * b[j];
  }
  return out;
}

/** 아이템이 기하분포로 소모될 때, 확률 p 로 이 개수 안에 끝난다. */
export function itemsQuantile(successPerItem: number, p: number): number {
  if (successPerItem >= 1) return 1;
  if (!(successPerItem > 0)) return Infinity;
  return Math.max(1, Math.ceil(Math.log(1 - p) / Math.log(1 - successPerItem)));
}

/**
 * 능력치 하나에 업횟을 전부 혼줌으로 채웠을 때의 최종 수치 분포 (목표·손절 무시).
 *
 * 능력치끼리는 성공 여부를 공유해서 독립이 아니지만, 한 능력치만 보면 1차원으로 정확히
 * 나온다. 0 이하로 떨어지면 사라져 0 에 머문다.
 */
export function finalStatDistribution(
  problem: Pick<ChaosProblem, 'successRate' | 'deltas'>,
  stat: { start: number; step: number },
  slots: number,
): Outcome[] {
  const kernel = kernelOf(problem.deltas);
  const p = problem.successRate;
  let dist = new Map<number, number>([[Math.max(0, stat.start), 1]]);
  for (let s = 0; s < slots; s++) {
    const next = new Map<number, number>();
    const add = (v: number, m: number) => next.set(v, (next.get(v) ?? 0) + m);
    for (const [v, m] of dist) {
      if (v <= 0) {
        add(0, m);
        continue;
      }
      add(v, (1 - p) * m);
      for (let i = 0; i < kernel.values.length; i++) {
        const nv = v + kernel.values[i] * stat.step;
        add(nv <= 0 ? 0 : nv, p * m * kernel.weights[i]);
      }
    }
    dist = next;
  }
  return [...dist.entries()]
    .map(([value, probability]) => ({ value, probability }))
    .sort((a, b) => a.value - b.value);
}
