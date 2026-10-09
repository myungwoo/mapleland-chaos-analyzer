import { goalsOf, type ChaosProblem, type Goal, type Outcome } from './types';

/**
 * 아이템 1개의 최적 정지 문제.
 *
 * 상태는 (남은 업횟 u, 목표에 쓰이는 능력치마다의 수치) 다. 수치는 출발값에서 몇 단위
 * 움직였는지 k 로 들고 있다 (수치 = 출발값 + step·k). 목표에 안 쓰이는 능력치는 굴림이
 * 독립이라 결정에 영향을 주지 않으므로 상태에서 뺀다.
 *
 * 목표는 "몇몇 능력치의 합 ≥ min" 들의 묶음이다. 개별 최소값은 능력치가 하나인 합이다.
 * 0 이하로 떨어진 능력치는 사라져 0 에 머문다 — 합 목표에서는 0 으로 쳐서 남은 능력치가
 * 메울 수 있으므로 "소멸"은 실패가 아니라 그 자체로 하나의 상태다.
 *
 * 매 상태에서 고를 수 있는 것은 둘뿐이다.
 *   - 혼줌을 한 장 더 바른다 (비용 c)
 *   - 이 아이템을 포기한다 (가치 A — 바깥 반복이 정해 준다)
 *
 * ## 격자를 줄이는 사실들
 *
 * 남은 업횟이 u 이면 앞으로 움직일 수 있는 폭이 [mn·u, mx·u] 로 묶인다
 * (mn, mx = 한 번 굴림의 최소·최대, 0 포함).
 *
 *   - **위쪽 접기**: 능력치 i 가 자기가 낀 목표의 min 보다 |mn|·u 단위 이상 높으면, 남은
 *     업횟을 전부 최소로 맞아도 혼자서 그 목표들을 채운다 (다른 능력치는 0 이상이니까).
 *     그 위의 수치는 전부 같은 상태라 한 칸으로 접는다.
 *   - **아래쪽 자르기**: 능력치 i 에 개별 최소값이 걸려 있으면, 전부 최대로 떠도 못 닿는
 *     수치는 가망 없음이다. 이때는 소멸도 곧 실패다. 합 목표에만 쓰이는 능력치는 다른
 *     능력치가 메울 수 있어 이렇게 자를 수 없고, 사라진 상태도 살려 둔다.
 *   - **도달 범위**: 출발점에서 j 번 굴려 갈 수 있는 범위 밖은 애초에 필요 없다.
 *
 * 축마다 0번 칸을 "실패", 1번 칸을 "소멸"로 두고 2번부터 살아 있는 수치를 둔다. 실패는
 * 어느 축이든 같은 상수라 기대값 계산이 축별 1차원 합성곱으로 쪼개지고, 소멸은 굴림을
 * 받아도 그대로 소멸이라 역시 축 안에서 닫힌다.
 */

export const ACT_FAIL = 0; // 업횟 소진·가망 없음 — 손절 말고 할 게 없다
export const ACT_CONTINUE = 1;
export const ACT_GOAL = 2;
export const ACT_ABANDON = 3; // 아직 가망은 있지만 손절이 낫다

export type Action = typeof ACT_FAIL | typeof ACT_CONTINUE | typeof ACT_GOAL | typeof ACT_ABANDON;

/** 축 안의 특수 칸 */
const IDX_FAIL = 0;
const IDX_DEAD = 1;
const IDX_ALIVE = 2;

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

/** 한 축(능력치)의 좌표계. k 는 출발값에서 움직인 단위 수다. */
export interface Axis {
  label: string;
  /** 이 풀이의 출발 수치 */
  start: number;
  step: number;
  /** k ≤ deadK 이면 수치가 0 이하 — 능력치가 사라진다 */
  deadK: number;
  /** 사라져도 목표를 이룰 수 있는가 (개별 최소값이 없으면 참) */
  deadAllowed: boolean;
  /** 개별 최소값에서 나온 k 하한의 기준점: k ≥ needK − mx·u 가 아니면 가망 없음. 없으면 −∞ */
  needK: number;
  /** 이 축이 낀 목표 min 들의 최댓값을 k 로 — 위쪽 접기의 기준점 */
  topK: number;
  /** 출발 위치 (위쪽 접기에 맞춰 내린 값) */
  k0: number;
}

export interface Layer {
  u: number;
  /** 축마다 살아 있는 칸으로 들고 있는 k 범위. lo > hi 이면 살아 있는 칸이 없다. */
  lo: number[];
  hi: number[];
  /** 출발점에서 도달 가능한 k 범위 (가망 없음으로 잘리기 전). 화면이 "닿지 않는 칸"을 가리는 데 쓴다. */
  reachLo: number[];
  reachHi: number[];
  /** 이 k 이상이면 앞으로 무슨 일이 있어도 이 축이 낀 목표가 채워진다 — hi 칸으로 접혀 있다 */
  safe: number[];
  /** 축마다 칸 수 (0번 실패, 1번 소멸, 2번부터 lo..hi) */
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
  goals: Goal[];
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

/** 격자 크기 상한. 메인 스레드에서 푸므로 1~2초 안쪽으로 묶는다. */
export const MAX_STATES = 1_500_000;

export class TooLargeError extends Error {
  constructor(public readonly states: number) {
    super(`상태 수 ${states.toLocaleString()} 개 — 너무 큽니다`);
  }
}

export function makeAxes(problem: ChaosProblem, current: number[], slots: number, kernel: Kernel): Axis[] {
  const goals = goalsOf(problem);
  return problem.stats.map((s, i) => {
    const start = current[i];
    const toK = (value: number) => Math.ceil((value - start) / s.step);
    const own = goals.filter((g) => g.axes.length === 1 && g.axes[0] === i);
    const mins = goals.filter((g) => g.axes.includes(i)).map((g) => g.min);
    const topK = mins.length ? toK(Math.max(...mins)) : 0;
    return {
      label: s.label,
      start,
      step: s.step,
      // start + step·k ≤ 0  ⇔  k ≤ −start/step
      deadK: Math.floor(-start / s.step),
      deadAllowed: own.length === 0,
      needK: own.length ? toK(Math.max(...own.map((g) => g.min))) : -Infinity,
      topK,
      k0: Math.min(0, topK - kernel.mn * slots),
    };
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
    const sf = a.topK - kernel.mn * u;
    const rl = Math.min(a.k0 + kernel.mn * j, sf);
    const rh = Math.min(a.k0 + kernel.mx * j, sf);
    const born = a.start > 0;
    const l = born ? Math.max(a.needK - kernel.mx * u, a.deadK + 1, rl) : 1;
    const h = born ? rh : 0;
    lo.push(l);
    hi.push(h);
    reachLo.push(rl);
    reachHi.push(rh);
    safe.push(sf);
    size.push(IDX_ALIVE + Math.max(0, h - l + 1));
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

/**
 * 위치 k 가 이 층의 축 i 에서 몇 번 칸인지. 0 이하로 떨어지면 소멸(가망 없으면 실패),
 * 범위 아래는 실패, 위는 접힌 칸.
 */
export function indexIn(layer: Layer, axis: Axis, i: number, k: number): number {
  if (k <= axis.deadK) return axis.deadAllowed ? IDX_DEAD : IDX_FAIL;
  if (k < layer.lo[i] || layer.hi[i] < layer.lo[i]) return IDX_FAIL;
  if (k > layer.hi[i]) return layer.size[i] - 1;
  return k - layer.lo[i] + IDX_ALIVE;
}

/** 칸 번호 → 다음 층의 칸 번호 (굴림 d 를 받았을 때). 실패·소멸은 그대로 머문다. */
function moveIdx(cur: Layer, next: Layer, axis: Axis, i: number, cc: number, d: number): number {
  if (cc === IDX_FAIL) return IDX_FAIL;
  if (cc === IDX_DEAD) return axis.deadAllowed ? IDX_DEAD : IDX_FAIL;
  return indexIn(next, axis, i, cur.lo[i] + cc - IDX_ALIVE + d);
}

/** k 벡터 → 층 안의 평탄 인덱스. */
export function flatIndex(item: Pick<ItemSolution, 'axes'>, layer: Layer, k: number[]): number {
  let idx = 0;
  for (let i = 0; i < k.length; i++) idx += indexIn(layer, item.axes[i], i, k[i]) * layer.stride[i];
  return idx;
}

/** 실제 수치 벡터 → k 벡터. 단위에 안 맞는 수치는 출발값 기준으로 내림한다. */
export function kOf(item: Pick<ItemSolution, 'axes'>, values: number[]): number[] {
  return values.map((v, i) => {
    const a = item.axes[i];
    return v <= 0 ? a.deadK : Math.floor((v - a.start) / a.step);
  });
}

/** 축 i 의 칸별 수치 (실패 칸은 NaN, 소멸 칸은 0). 목표 판정에 쓴다. */
function cellValues(layer: Layer, axis: Axis, i: number): Float64Array {
  const out = new Float64Array(layer.size[i]);
  out[IDX_FAIL] = NaN;
  out[IDX_DEAD] = 0;
  for (let cc = IDX_ALIVE; cc < layer.size[i]; cc++) {
    out[cc] = axis.start + axis.step * (layer.lo[i] + cc - IDX_ALIVE);
  }
  return out;
}

/** 풀기 전에 격자 크기를 센다 (너무 큰지 판단하려고). */
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
  const goals = goalsOf(problem);
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
  const vals = new Float64Array(k);

  for (let u = 0; u <= slots; u++) {
    const cur = layers[u];
    const next = u > 0 ? layers[u - 1] : null;
    const values = axes.map((a, i) => cellValues(cur, a, i));

    // 다음 층 기준 기대값. 성공 쪽은 축별 합성곱, 실패 쪽은 같은 수치를 다음 층에서 읽는다.
    let succ: { J: Float64Array; Q: Float64Array; N: Float64Array } | null = null;
    let stay: Int32Array[] | null = null;
    if (next) {
      succ = convolveDown(cur, next, axes, kernel);
      stay = axes.map((a, i) => {
        const out = new Int32Array(cur.size[i]);
        for (let cc = 0; cc < cur.size[i]; cc++) out[cc] = moveIdx(cur, next, a, i, cc, 0);
        return out;
      });
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
      for (let i = 0; i < k; i++) {
        const cc = coord[i];
        if (cc === IDX_FAIL || (cc === IDX_DEAD && !axes[i].deadAllowed)) {
          sentinel = true;
          break;
        }
        vals[i] = values[i][cc];
      }
      if (sentinel) {
        cur.J[idx] = A;
        cur.act[idx] = ACT_FAIL;
        continue;
      }

      let goal = true;
      for (const g of goals) {
        let sum = 0;
        for (const ax of g.axes) sum += vals[ax];
        if (sum < g.min) {
          goal = false;
          break;
        }
      }
      if (goal) {
        cur.Q[idx] = 1;
        cur.act[idx] = ACT_GOAL;
        continue;
      }
      if (!next) {
        cur.J[idx] = A;
        cur.act[idx] = ACT_FAIL;
        continue;
      }

      let s = 0;
      for (let i = 0; i < k; i++) s += stay![i][coord[i]] * next.stride[i];
      const contQ = (1 - p) * next.Q[s] + p * succ!.Q[idx];
      // 가망이 아예 없는 상태(합 목표라 축별로는 못 잘라 낸 것)는 끝까지 바르기에서도 버린다.
      if (!(contQ > 0)) {
        cur.J[idx] = A;
        cur.act[idx] = ACT_FAIL;
        continue;
      }
      const contJ = c + (1 - p) * next.J[s] + p * succ!.J[idx];
      if (options.forceContinue || contJ < A - 1e-9 * Math.max(1, Math.abs(A))) {
        cur.J[idx] = contJ;
        cur.Q[idx] = contQ;
        cur.N[idx] = 1 + (1 - p) * next.N[s] + p * succ!.N[idx];
        cur.act[idx] = ACT_CONTINUE;
      } else {
        cur.J[idx] = A;
        cur.act[idx] = ACT_ABANDON;
      }
    }
  }

  const top = layers[slots];
  const startIdx = flatIndex(
    { axes },
    top,
    axes.map((a) => a.k0),
  );
  return {
    axes,
    goals,
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

/** 축 i 에서 이번 층 칸 cc 가 굴림 d(인덱스) 를 받으면 가는 다음 층 칸. [cc·nd + di] */
function moveTable(cur: Layer, next: Layer, axis: Axis, i: number, kernel: Kernel): Int32Array {
  const nd = kernel.values.length;
  const out = new Int32Array(cur.size[i] * nd);
  for (let cc = 0; cc < cur.size[i]; cc++) {
    for (let di = 0; di < nd; di++) out[cc * nd + di] = moveIdx(cur, next, axis, i, cc, kernel.values[di]);
  }
  return out;
}

/**
 * 성공했을 때의 기대값을 이번 층의 모든 칸에 대해 구한다.
 *
 * 축마다 독립으로 굴리므로 다차원 합 Σ_d Π w(d_i) f(x+d) 를 축 하나씩 1차원 합으로
 * 바꿔 가며 풀 수 있다. 중간 배열은 앞쪽 축은 이번 층, 뒤쪽 축은 다음 층 크기를 갖는다.
 */
function convolveDown(cur: Layer, next: Layer, axes: Axis[], kernel: Kernel) {
  const k = cur.size.length;
  const nd = kernel.values.length;
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
    const target = moveTable(cur, next, axes[i], i, kernel);

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
  const nd = kernel.values.length;
  const succ = new Float64Array(slots + 1);
  const fail = new Float64Array(slots + 1);

  let mass = new Float64Array(layers[slots].length);
  mass[flatIndex(item, layers[slots], axes.map((a) => a.k0))] = 1;

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

    // 실패: 같은 수치로
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
      for (let i = 0; i < k; i++) s += moveIdx(cur, next, axes[i], i, coord[i], 0) * next.stride[i];
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
      const target = moveTable(cur, next, axes[i], i, kernel);
      const out = new Float64Array(outer * outSize * inner);
      for (let o = 0; o < outer; o++) {
        for (let cc = 0; cc < inSize; cc++) {
          const inBase = (o * inSize + cc) * inner;
          for (let di = 0; di < nd; di++) {
            const w = kernel.weights[di];
            const outBase = (o * outSize + target[cc * nd + di]) * inner;
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
