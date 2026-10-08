import type { ChaosProblem, Outcome } from './types';

/**
 * 아이템 1개의 최적 정지 문제.
 *
 * 상태는 (남은 업횟 u, 목표 능력치마다의 위치 r) 이다. 위치는 **목표까지 남은 단위 수의
 * 음수**로 잡는다 — r ≥ 0 이면 그 능력치는 만족이다. 목표가 없는 능력치는 굴림이 서로
 * 독립이라 결정에 영향을 주지 않으므로 상태에서 뺀다.
 *
 * 매 상태에서 고를 수 있는 것은 둘뿐이다.
 *   - 혼줌을 한 장 더 바른다 (비용 c)
 *   - 이 아이템을 포기한다 (가치 A — 바깥 반복이 정해 준다)
 *
 * ## 격자를 줄이는 두 가지 사실
 *
 * 남은 업횟이 u 이면 앞으로 움직일 수 있는 폭이 [mn·u, mx·u] 로 묶인다
 * (mn, mx = 한 번 굴림의 최소·최대, 0 포함).
 *
 *   - r < −mx·u 이면 전부 최대로 떠도 못 닿는다 → 가망 없음. 포기와 같다.
 *   - r ≥ −mn·u 이면 전부 최소로 떠도 안 떨어진다 → 그 위는 전부 같은 상태다.
 *
 * 그래서 남은 업횟 u 에서 한 축의 폭은 많아야 (mx−mn)·u+1 이고, 시작점에서 j 번 굴린
 * 도달 범위와 겹치는 부분만 남기면 업횟 10 에서도 축당 51칸을 넘지 않는다.
 * 축마다 0번 칸을 "실패" 자리로 비워 두면, 어느 한 축이라도 실패한 상태가 하나의
 * 상수로 모여 기대값 계산이 축별 1차원 합성곱으로 쪼개진다.
 */

export const ACT_FAIL = 0; // 업횟 소진·능력치 소멸·가망 없음 — 손절 말고 할 게 없다
export const ACT_CONTINUE = 1;
export const ACT_GOAL = 2;
export const ACT_ABANDON = 3; // 아직 가망은 있지만 손절이 낫다

export type Action = typeof ACT_FAIL | typeof ACT_CONTINUE | typeof ACT_GOAL | typeof ACT_ABANDON;

/** 한 번 굴림의 분포를 확률이 있는 점만 남겨 정규화한 것. */
export interface Kernel {
  values: number[];
  weights: number[];
  /** min(굴림 최소, 0) — 실패(변화 없음)도 움직임의 일부라 0 을 포함한다 */
  mn: number;
  /** max(굴림 최대, 0) */
  mx: number;
}

export function kernelOf(deltas: Outcome[]): Kernel {
  const merged = new Map<number, number>();
  for (const d of deltas) {
    if (!(d.probability > 0) || !Number.isFinite(d.probability)) continue;
    if (!Number.isInteger(d.value)) throw new Error(`변화량은 정수여야 합니다: ${d.value}`);
    merged.set(d.value, (merged.get(d.value) ?? 0) + d.probability);
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error('변화량 확률이 전부 0 입니다');
  const values = [...merged.keys()].sort((a, b) => a - b);
  return {
    values,
    weights: values.map((v) => merged.get(v)! / total),
    mn: Math.min(0, values[0]),
    mx: Math.max(0, values[values.length - 1]),
  };
}

/** 한 축(능력치)의 좌표계. */
export interface Axis {
  label: string;
  /** 이 풀이의 출발 수치 */
  start: number;
  target: number;
  step: number;
  /** 목표까지 필요한 단위 수. r = k − need (k = 출발에서 움직인 단위 수) */
  need: number;
  /** 이 위치 이하이면 수치가 0 이하 — 능력치가 사라진다 */
  deadR: number;
  /** 출발 위치 (안전 상한으로 접은 값) */
  r0: number;
}

export interface Layer {
  u: number;
  /** 축마다 실제로 들고 있는 위치 범위. lo > hi 이면 그 축은 전부 실패다. */
  lo: number[];
  hi: number[];
  /** 출발점에서 도달 가능한 범위 (가망 없음으로 잘리기 전). 화면이 "닿지 않는 칸"을 가리는 데 쓴다. */
  reachLo: number[];
  reachHi: number[];
  /** 이 위치 이상이면 앞으로 무슨 일이 있어도 만족 — 그 위는 hi 칸 하나로 접혀 있다 */
  safe: number[];
  /** 축마다 칸 수 (0번 = 실패 자리). 빈 축이면 1. */
  size: number[];
  stride: number[];
  length: number;
  /** 이 상태에서 앞으로 들 기대비용 (포기 가치 A 를 포함한 값) */
  J: Float64Array;
  /** 이 아이템으로 목표를 이룰 확률 (정한 정책을 따를 때) */
  Q: Float64Array;
  /** 이 아이템에 앞으로 바를 혼줌 기대 장수 */
  N: Float64Array;
  act: Uint8Array;
}

export interface ItemSolution {
  axes: Axis[];
  slots: number;
  /** layers[u] = 남은 업횟 u */
  layers: Layer[];
  abandonValue: number;
  start: { J: number; Q: number; N: number; act: Action };
}

export interface SolveItemOptions {
  /** 포기했을 때의 가치 (메소, 비용 쪽 부호). 보통 (새로 시작하는 기대비용 − 회수가). */
  abandonValue: number;
  /** 가망이 있는 한 손절하지 않고 끝까지 바른다 (기준선 전략용) */
  forceContinue?: boolean;
}

/** 격자 크기 상한. 메인 스레드에서 푸므로 1~2초 안쪽으로 묶는다 (목표 3개·업횟 20, 4개·업횟 8 정도). */
export const MAX_STATES = 1_500_000;

export class TooLargeError extends Error {
  constructor(public readonly states: number) {
    super(`상태 수 ${states.toLocaleString()} 개 — 너무 큽니다`);
  }
}

export function makeAxes(problem: ChaosProblem, current: number[], slots: number, kernel: Kernel): Axis[] {
  return problem.stats.map((s, i) => {
    const start = current[i];
    const need = Math.ceil((s.target - start) / s.step);
    // start + step·(r + need) ≤ 0  ⇔  r ≤ −start/step − need
    const deadR = Math.floor(-start / s.step) - need;
    const r0 = Math.min(-need, -kernel.mn * slots);
    return { label: s.label, start, target: s.target, step: s.step, need, deadR, r0 };
  });
}

function emptyLayer(u: number, slots: number, axes: Axis[], kernel: Kernel): Layer {
  const j = slots - u;
  const lo: number[] = [];
  const hi: number[] = [];
  const reachLo: number[] = [];
  const reachHi: number[] = [];
  const safe: number[] = [];
  const size: number[] = [];
  for (const a of axes) {
    const sf = -kernel.mn * u;
    const rl = Math.min(a.r0 + kernel.mn * j, sf);
    const rh = Math.min(a.r0 + kernel.mx * j, sf);
    const l = Math.max(-kernel.mx * u, a.deadR + 1, rl);
    lo.push(l);
    hi.push(rh);
    reachLo.push(rl);
    reachHi.push(rh);
    safe.push(sf);
    size.push(l <= rh ? rh - l + 2 : 1);
  }
  const stride = new Array<number>(axes.length);
  let length = 1;
  for (let i = axes.length - 1; i >= 0; i--) {
    stride[i] = length;
    length *= size[i];
  }
  return {
    u,
    lo,
    hi,
    reachLo,
    reachHi,
    safe,
    size,
    stride,
    length,
    J: new Float64Array(length),
    Q: new Float64Array(length),
    N: new Float64Array(length),
    act: new Uint8Array(length),
  };
}

/** 위치 r 이 이 층의 축 i 에서 몇 번 칸인지. 범위 아래는 실패(0), 위는 안전 칸으로 접는다. */
export function indexIn(layer: Layer, i: number, r: number): number {
  if (layer.size[i] === 1 || r < layer.lo[i]) return 0;
  if (r > layer.hi[i]) return layer.size[i] - 1;
  return r - layer.lo[i] + 1;
}

/** 위치 벡터 → 층 안의 평탄 인덱스. */
export function flatIndex(layer: Layer, r: number[]): number {
  let idx = 0;
  for (let i = 0; i < r.length; i++) idx += indexIn(layer, i, r[i]) * layer.stride[i];
  return idx;
}

/** 지금까지 쓴 격자 크기를 미리 센다 (풀기 전에 너무 큰지 판단하려고). */
export function countStates(problem: ChaosProblem, current: number[], slots: number): number {
  const kernel = kernelOf(problem.deltas);
  const axes = makeAxes(problem, current, slots, kernel);
  let total = 0;
  for (let u = 0; u <= slots; u++) total += emptyLayer(u, slots, axes, kernel).length;
  return total;
}

/**
 * 출발 수치 `current`, 남은 업횟 `slots` 인 아이템 하나를 끝까지 푼다.
 *
 * 업횟 오름차순으로 한 번 훑으면 끝난다. 각 층의 기대값은 아래 층에서
 *   (1−p) · 그대로 + p · (축마다 굴림 합성곱)
 * 으로 얻는다.
 */
export function solveItem(
  problem: ChaosProblem,
  current: number[],
  slots: number,
  options: SolveItemOptions,
): ItemSolution {
  const kernel = kernelOf(problem.deltas);
  const axes = makeAxes(problem, current, slots, kernel);
  const k = axes.length;
  const A = options.abandonValue;
  const c = problem.scrollPrice;
  const p = problem.successRate;

  const layers: Layer[] = [];
  let states = 0;
  for (let u = 0; u <= slots; u++) {
    const layer = emptyLayer(u, slots, axes, kernel);
    states += layer.length;
    if (states > MAX_STATES) throw new TooLargeError(states);
    layers.push(layer);
  }

  const coord = new Int32Array(k);
  const r = new Int32Array(k);

  for (let u = 0; u <= slots; u++) {
    const cur = layers[u];
    const next = u > 0 ? layers[u - 1] : null;

    // 다음 층 기준 기대값. 성공 쪽은 축별 합성곱, 실패 쪽은 같은 위치를 다음 층에서 읽는다.
    let succ: { J: Float64Array; Q: Float64Array; N: Float64Array } | null = null;
    let stay: Int32Array[] | null = null;
    if (next) {
      succ = convolveDown(cur, next, kernel);
      stay = stayMap(cur, next);
    }

    coord.fill(0);
    for (let idx = 0; idx < cur.length; idx++) {
      // 다차원 카운터를 평탄 인덱스와 같이 굴린다 (행 우선, 마지막 축이 가장 빠름)
      if (idx > 0) {
        for (let i = k - 1; i >= 0; i--) {
          if (++coord[i] < cur.size[i]) break;
          coord[i] = 0;
        }
      }
      let sentinel = false;
      let goal = true;
      for (let i = 0; i < k; i++) {
        if (coord[i] === 0) {
          sentinel = true;
          break;
        }
        r[i] = cur.lo[i] + coord[i] - 1;
        if (r[i] < 0) goal = false;
      }

      if (sentinel || (!goal && !next)) {
        cur.J[idx] = A;
        cur.act[idx] = ACT_FAIL;
        continue;
      }
      if (goal) {
        cur.Q[idx] = 1;
        cur.act[idx] = ACT_GOAL;
        continue;
      }

      let s = 0;
      for (let i = 0; i < k; i++) s += stay![i][coord[i]] * next!.stride[i];
      const contJ = c + (1 - p) * next!.J[s] + p * succ!.J[idx];
      if (options.forceContinue || contJ < A - 1e-9 * Math.max(1, Math.abs(A))) {
        cur.J[idx] = contJ;
        cur.Q[idx] = (1 - p) * next!.Q[s] + p * succ!.Q[idx];
        cur.N[idx] = 1 + (1 - p) * next!.N[s] + p * succ!.N[idx];
        cur.act[idx] = ACT_CONTINUE;
      } else {
        cur.J[idx] = A;
        cur.act[idx] = ACT_ABANDON;
      }
    }
  }

  const top = layers[slots];
  const startIdx = flatIndex(
    top,
    axes.map((a) => a.r0),
  );
  return {
    axes,
    slots,
    layers,
    abandonValue: A,
    start: {
      J: top.J[startIdx],
      Q: top.Q[startIdx],
      N: top.N[startIdx],
      act: top.act[startIdx] as Action,
    },
  };
}

/** 축마다, 이번 층의 칸 → 굴림이 실패(그대로)했을 때 다음 층의 칸. */
function stayMap(cur: Layer, next: Layer): Int32Array[] {
  return cur.size.map((size, i) => {
    const out = new Int32Array(size);
    for (let cc = 1; cc < size; cc++) out[cc] = indexIn(next, i, cur.lo[i] + cc - 1);
    return out;
  });
}

/**
 * 성공했을 때의 기대값을 이번 층의 모든 칸에 대해 구한다.
 *
 * 축마다 독립으로 굴리므로 다차원 합 Σ_d Π w(d_i) f(x+d) 를 축 하나씩 1차원 합으로
 * 바꿔 가며 풀 수 있다. 중간 배열은 앞쪽 축은 이번 층, 뒤쪽 축은 다음 층 크기를 갖는다.
 * 실패 자리(0번 칸)는 어느 축이든 같은 상수라 이 분해가 그대로 성립한다.
 */
function convolveDown(cur: Layer, next: Layer, kernel: Kernel) {
  const k = cur.size.length;
  let shape = next.size.slice();
  let J = next.J;
  let Q = next.Q;
  let N = next.N;

  for (let i = 0; i < k; i++) {
    const inSize = shape[i];
    const outSize = cur.size[i];
    let outer = 1;
    for (let t = 0; t < i; t++) outer *= shape[t];
    let inner = 1;
    for (let t = i + 1; t < k; t++) inner *= shape[t];

    // 이번 층 칸 cc 에서 굴림 d 를 받으면 다음 층의 몇 번 칸인가
    const nd = kernel.values.length;
    const target = new Int32Array(outSize * nd);
    for (let cc = 0; cc < outSize; cc++) {
      for (let di = 0; di < nd; di++) {
        target[cc * nd + di] =
          cc === 0 ? 0 : indexIn(next, i, cur.lo[i] + cc - 1 + kernel.values[di]);
      }
    }

    const len = outer * outSize * inner;
    const J2 = new Float64Array(len);
    const Q2 = new Float64Array(len);
    const N2 = new Float64Array(len);
    for (let o = 0; o < outer; o++) {
      for (let cc = 0; cc < outSize; cc++) {
        const outBase = (o * outSize + cc) * inner;
        for (let di = 0; di < nd; di++) {
          const w = kernel.weights[di];
          const inBase = (o * inSize + target[cc * nd + di]) * inner;
          for (let q = 0; q < inner; q++) {
            J2[outBase + q] += w * J[inBase + q];
            Q2[outBase + q] += w * Q[inBase + q];
            N2[outBase + q] += w * N[inBase + q];
          }
        }
      }
    }
    J = J2;
    Q = Q2;
    N = N2;
    shape = shape.slice();
    shape[i] = outSize;
  }
  return { J, Q, N };
}

/**
 * 정책을 따라 아이템 1개를 굴렸을 때, j 장 바르고 끝나는 확률을 성공/실패로 나눠 센다.
 *
 * 남은 업횟이 곧 바른 장수라 (j = slots − u), 정책이 정해지면 한 사이클의 결과는
 * (장수, 성공 여부) 2·(slots+1) 가지뿐이다. 비용 분포는 전부 이것에서 나온다.
 */
export function cycleOutcomes(problem: ChaosProblem, item: ItemSolution) {
  const kernel = kernelOf(problem.deltas);
  const p = problem.successRate;
  const { layers, slots, axes } = item;
  const k = axes.length;
  const succ = new Float64Array(slots + 1);
  const fail = new Float64Array(slots + 1);

  let mass = new Float64Array(layers[slots].length);
  mass[flatIndex(layers[slots], axes.map((a) => a.r0))] = 1;

  for (let u = slots; u >= 0; u--) {
    const cur = layers[u];
    const j = slots - u;
    const moving = new Float64Array(cur.length);
    let any = false;
    for (let idx = 0; idx < cur.length; idx++) {
      const m = mass[idx];
      if (m === 0) continue;
      const a = cur.act[idx];
      if (a === ACT_GOAL) succ[j] += m;
      else if (a === ACT_CONTINUE) {
        moving[idx] = m;
        any = true;
      } else fail[j] += m;
    }
    if (u === 0 || !any) break;

    const next = layers[u - 1];
    const nextMass = new Float64Array(next.length);

    // 실패: 같은 위치로
    const coord = new Int32Array(k);
    for (let idx = 0; idx < cur.length; idx++) {
      if (idx > 0) {
        for (let i = k - 1; i >= 0; i--) {
          if (++coord[i] < cur.size[i]) break;
          coord[i] = 0;
        }
      }
      const m = moving[idx];
      if (m === 0) continue;
      let s = 0;
      for (let i = 0; i < k; i++) {
        s += indexIn(next, i, cur.lo[i] + coord[i] - 1) * next.stride[i];
      }
      nextMass[s] += (1 - p) * m;
    }

    // 성공: 축마다 흩뿌린다 (convolveDown 의 전치)
    let shape = cur.size.slice();
    let arr: Float64Array = moving;
    for (let i = 0; i < k; i++) {
      const inSize = shape[i];
      const outSize = next.size[i];
      let outer = 1;
      for (let t = 0; t < i; t++) outer *= shape[t];
      let inner = 1;
      for (let t = i + 1; t < k; t++) inner *= shape[t];
      const out = new Float64Array(outer * outSize * inner);
      for (let o = 0; o < outer; o++) {
        for (let cc = 1; cc < inSize; cc++) {
          const inBase = (o * inSize + cc) * inner;
          for (let di = 0; di < kernel.values.length; di++) {
            const t = indexIn(next, i, cur.lo[i] + cc - 1 + kernel.values[di]);
            const w = kernel.weights[di];
            const outBase = (o * outSize + t) * inner;
            for (let q = 0; q < inner; q++) out[outBase + q] += w * arr[inBase + q];
          }
        }
      }
      arr = out;
      shape = shape.slice();
      shape[i] = outSize;
    }
    for (let idx = 0; idx < next.length; idx++) nextMass[idx] += p * arr[idx];
    mass = nextMass;
  }

  return { succ, fail };
}
