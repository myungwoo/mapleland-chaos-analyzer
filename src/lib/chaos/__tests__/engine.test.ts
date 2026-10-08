import { describe, expect, it } from 'vitest';
import {
  ACT_CONTINUE,
  ACT_GOAL,
  analyze,
  COMMUNITY_DELTAS,
  costDistribution,
  cycleOutcomes,
  finalStatDistribution,
  flatIndex,
  judge,
  kernelOf,
  solve,
  type ChaosProblem,
  type Outcome,
} from '..';

const base = {
  successRate: 0.6,
  deltas: COMMUNITY_DELTAS,
  itemPrice: 1_000_000,
  scrollPrice: 3_000_000,
  salvage: 0,
};

/** 재현 가능한 난수 (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleDelta(deltas: Outcome[], u: number): number {
  const k = kernelOf(deltas);
  let acc = 0;
  for (let i = 0; i < k.values.length; i++) {
    acc += k.weights[i];
    if (u < acc) return k.values[i];
  }
  return k.values[k.values.length - 1];
}

/**
 * 엔진과 무관하게 짠 무식한 풀이. 수치 튜플을 그대로 키로 쓰는 메모 재귀에
 * 재시작 값 R 을 R ← f(R) 단조 반복으로 맞춘다 (원래 분석기의 방식).
 */
function bruteForce(problem: ChaosProblem): number {
  const k = kernelOf(problem.deltas);
  const p = problem.successRate;
  const { itemPrice: P, scrollPrice: c, salvage: S } = problem;
  const combos: Array<{ d: number[]; w: number }> = [{ d: [], w: 1 }];
  for (let i = 0; i < problem.stats.length; i++) {
    const nextCombos: typeof combos = [];
    for (const cb of combos) {
      for (let t = 0; t < k.values.length; t++) {
        nextCombos.push({ d: [...cb.d, k.values[t]], w: cb.w * k.weights[t] });
      }
    }
    combos.splice(0, combos.length, ...nextCombos);
  }

  const f = (R: number) => {
    const memo = new Map<string, number>();
    const V = (u: number, vals: number[]): number => {
      const goal = vals.every((v, i) => v >= problem.stats[i].target);
      if (goal) return 0;
      const key = `${u}|${vals.join(',')}`;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      let best = R - S;
      if (u > 0) {
        let e = (1 - p) * V(u - 1, vals);
        let es = 0;
        for (const cb of combos) {
          const nv = vals.map((v, i) => {
            if (v <= 0) return 0;
            const x = v + cb.d[i] * problem.stats[i].step;
            return x <= 0 ? 0 : x;
          });
          es += cb.w * V(u - 1, nv);
        }
        e += p * es;
        best = Math.min(best, c + e);
      }
      memo.set(key, best);
      return best;
    };
    return P + V(
      problem.slots,
      problem.stats.map((s) => s.start),
    );
  };

  let R = 0;
  for (let i = 0; i < 200000; i++) {
    const next = f(R);
    if (Math.abs(next - R) <= 1e-14 * Math.max(1, next)) return next;
    R = next;
  }
  return R;
}

/** 최적 정책을 그대로 굴려 총지출 표본을 모은다. */
function simulate(problem: ChaosProblem, runs: number, seed = 1) {
  const sol = solve(problem);
  const { item } = sol;
  const random = rng(seed);
  const costs: number[] = [];
  let items = 0;
  let itemSuccess = 0;
  for (let run = 0; run < runs; run++) {
    let spent = 0;
    for (;;) {
      spent += problem.itemPrice;
      items++;
      const vals = problem.stats.map((s) => s.start);
      let u = problem.slots;
      let ok = false;
      for (;;) {
        const r = vals.map((v, i) => {
          const a = item.axes[i];
          return v <= 0 ? -1e9 : Math.round((v - a.start) / a.step) - a.need;
        });
        const layer = item.layers[u];
        const act = layer.act[flatIndex(layer, r)];
        if (act === ACT_GOAL) {
          ok = true;
          break;
        }
        if (act !== ACT_CONTINUE) break;
        spent += problem.scrollPrice;
        u--;
        if (random() < problem.successRate) {
          for (let i = 0; i < vals.length; i++) {
            if (vals[i] <= 0) continue;
            const x = vals[i] + sampleDelta(problem.deltas, random()) * problem.stats[i].step;
            vals[i] = x <= 0 ? 0 : x;
          }
        }
      }
      if (ok) {
        itemSuccess++;
        break;
      }
      spent -= problem.salvage;
    }
    costs.push(spent);
  }
  const mean = costs.reduce((a, b) => a + b, 0) / runs;
  const sd = Math.sqrt(costs.reduce((a, b) => a + (b - mean) ** 2, 0) / (runs - 1));
  return { sol, costs, mean, sd, successPerItem: itemSuccess / items };
}

describe('닫힌 형태와 대조', () => {
  it('항상 +1 이고 100% 성공이면 결정론적이다', () => {
    const problem: ChaosProblem = {
      ...base,
      successRate: 1,
      deltas: [{ value: 1, probability: 1 }],
      slots: 5,
      stats: [{ label: '힘', start: 3, target: 5, step: 1 }],
    };
    const sol = solve(problem);
    expect(sol.successPerItem).toBe(1);
    expect(sol.scrollsPerItem).toBe(2);
    expect(sol.expectedCost).toBeCloseTo(base.itemPrice + 2 * base.scrollPrice, 6);
  });

  it('단발 승부는 (매물가 + 주문서가 − 회수·실패율)/성공률', () => {
    const problem: ChaosProblem = {
      ...base,
      salvage: 200_000,
      slots: 1,
      stats: [{ label: '공격력', start: 10, target: 13, step: 1 }],
    };
    const q = 0.6 * (0.1021 + 0.0198 + 0.0099);
    const sol = solve(problem);
    expect(sol.successPerItem).toBeCloseTo(q, 12);
    expect(sol.expectedCost).toBeCloseTo((1_000_000 + 3_000_000 - 200_000 * (1 - q)) / q, 4);
  });

  it('이미 목표면 매물가가 곧 답이다', () => {
    const sol = solve({ ...base, slots: 7, stats: [{ label: '힘', start: 9, target: 5, step: 1 }] });
    expect(sol.expectedCost).toBe(base.itemPrice);
    expect(sol.scrollsPerItem).toBe(0);
  });

  it('0 이하로 떨어진 능력치는 다시 오르지 않는다', () => {
    // 3 → −3 이면 0 이 되어 사라진다. 사라지지 않는다면 0 → +4 로 목표 4 에 닿았을 것이다.
    const problem: ChaosProblem = {
      ...base,
      successRate: 1,
      deltas: [
        { value: -3, probability: 0.5 },
        { value: 4, probability: 0.5 },
      ],
      slots: 2,
      stats: [{ label: '힘', start: 3, target: 4, step: 1 }],
    };
    expect(solve(problem).baseline.successPerItem).toBeCloseTo(0.5, 12);
  });

  it('HP 는 10 단위로 움직인다', () => {
    const problem: ChaosProblem = {
      ...base,
      successRate: 1,
      deltas: [{ value: 2, probability: 1 }],
      slots: 3,
      stats: [{ label: 'HP', start: 45, target: 85, step: 10 }],
    };
    // 45 → 65 → 85
    expect(solve(problem).scrollsPerItem).toBe(2);
  });

  it('시작부터 없는 능력치에는 목표를 걸 수 없다', () => {
    const sol = solve({ ...base, slots: 7, stats: [{ label: '힘', start: 0, target: 1, step: 1 }] });
    expect(sol.expectedCost).toBe(Infinity);
  });
});

describe('독립 구현과 대조', () => {
  const cases: Array<[string, ChaosProblem]> = [
    ['1개, 회수 없음', { ...base, slots: 5, stats: [{ label: '공', start: 4, target: 7, step: 1 }] }],
    [
      '1개, 회수 있음',
      {
        ...base,
        salvage: 600_000,
        slots: 5,
        stats: [{ label: '공', start: 2, target: 6, step: 1 }],
      },
    ],
    [
      '2개, HP 포함',
      {
        ...base,
        salvage: 300_000,
        scrollPrice: 1_500_000,
        slots: 4,
        stats: [
          { label: '힘', start: 3, target: 5, step: 1 },
          { label: 'HP', start: 25, target: 40, step: 10 },
        ],
      },
    ],
  ];

  for (const [name, problem] of cases) {
    it(name, () => {
      const sol = solve(problem);
      expect(sol.expectedCost / bruteForce(problem)).toBeCloseTo(1, 8);
    });
  }
});

describe('정책을 그대로 굴려 본다', () => {
  const problem: ChaosProblem = {
    ...base,
    salvage: 300_000,
    slots: 6,
    stats: [
      { label: '힘', start: 4, target: 7, step: 1 },
      { label: '덱스', start: 3, target: 5, step: 1 },
    ],
  };
  const runs = 40_000;
  const sim = simulate(problem, runs, 7);

  it('기대비용이 4σ 안에 든다', () => {
    const se = sim.sd / Math.sqrt(runs);
    expect(Math.abs(sim.mean - sim.sol.expectedCost)).toBeLessThan(4 * se);
  });

  it('아이템당 성공 확률이 맞는다', () => {
    const q = sim.sol.successPerItem;
    const n = runs / q; // 대략적인 아이템 수
    expect(Math.abs(sim.successPerItem - q)).toBeLessThan(4 * Math.sqrt((q * (1 - q)) / n));
  });

  it('비용 분포의 분위수가 표본과 맞는다', () => {
    const a = analyze(problem);
    const sorted = [...sim.costs].sort((x, y) => x - y);
    for (const p of [0.5, 0.9]) {
      const empirical = sorted[Math.floor(p * runs)];
      expect(Math.abs(a.distribution!.quantile(p) / empirical - 1)).toBeLessThan(0.04);
    }
  });
});

describe('분포의 정합성', () => {
  const problem: ChaosProblem = {
    ...base,
    salvage: 200_000,
    slots: 7,
    stats: [{ label: '공', start: 10, target: 15, step: 1 }],
  };
  const sol = solve(problem);
  const cycles = cycleOutcomes(problem, sol.item);

  it('사이클 결과의 질량이 1 이고 성공 질량이 q 다', () => {
    const s = cycles.succ.reduce((a, b) => a + b, 0);
    const f = cycles.fail.reduce((a, b) => a + b, 0);
    expect(s + f).toBeCloseTo(1, 12);
    expect(s).toBeCloseTo(sol.successPerItem, 12);
  });

  it('사이클 장수의 평균이 N 과 같다', () => {
    let n = 0;
    for (let j = 0; j < cycles.succ.length; j++) n += j * (cycles.succ[j] + cycles.fail[j]);
    expect(n).toBeCloseTo(sol.scrollsPerItem, 10);
  });

  it('격자 위 비용 분포의 평균이 기대비용과 같다', () => {
    const d = costDistribution(problem, cycles, sol.expectedCost)!;
    expect(d.mean / sol.expectedCost).toBeCloseTo(1, 4);
    expect(d.cdf[d.cdf.length - 1]).toBeGreaterThan(0.99999);
  });

  it('업횟을 다 바른 능력치 분포는 합이 1 이다', () => {
    const d = finalStatDistribution(base, { start: 50, step: 10 }, 7);
    expect(d.reduce((a, b) => a + b.probability, 0)).toBeCloseTo(1, 12);
    expect(d.every((o) => o.value % 10 === 0)).toBe(true);
  });
});

describe('단조성', () => {
  const p = (over: Partial<ChaosProblem> = {}, target = 15, slots = 7): ChaosProblem => ({
    ...base,
    salvage: 100_000,
    slots,
    stats: [{ label: '공', start: 10, target, step: 1 }],
    ...over,
  });

  it('목표가 높을수록 비싸다', () => {
    const costs = [12, 14, 16, 18].map((t) => solve(p({}, t)).expectedCost);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
  });

  it('업횟이 많을수록 싸다', () => {
    const costs = [4, 5, 6, 7, 8].map((s) => solve(p({}, 15, s)).expectedCost);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] + 1e-6);
  });

  it('주문서가 비쌀수록 비싸고, 회수가 클수록 싸다', () => {
    expect(solve(p({ scrollPrice: 4_000_000 })).expectedCost).toBeGreaterThan(solve(p()).expectedCost);
    expect(solve(p({ salvage: 500_000 })).expectedCost).toBeLessThan(solve(p()).expectedCost);
  });

  it('최적 전략은 끝까지 바르기보다 비싸지 않다', () => {
    const sol = solve(p());
    expect(sol.expectedCost).toBeLessThanOrEqual(sol.baseline.expectedCost + 1e-6);
    expect(sol.successPerItem).toBeLessThanOrEqual(sol.baseline.successPerItem + 1e-12);
  });
});

describe('판정기', () => {
  const problem: ChaosProblem = {
    ...base,
    slots: 7,
    stats: [
      { label: '힘', start: 3, target: 6, step: 1 },
      { label: '덱스', start: 3, target: 6, step: 1 },
    ],
  };
  const sol = solve(problem);

  it('출발 상태의 판정은 전체 풀이와 같다', () => {
    const v = judge(problem, sol.expectedCost, [3, 3], 7);
    expect(v.action).toBe(ACT_CONTINUE);
    expect(v.successHere).toBeCloseTo(sol.successPerItem, 10);
    expect(v.remainingCost + problem.itemPrice).toBeCloseTo(sol.expectedCost, 2);
  });

  it('달성한 상태는 남은 비용이 0 이다', () => {
    const v = judge(problem, sol.expectedCost, [7, 6], 3);
    expect(v.action).toBe(ACT_GOAL);
    expect(v.remainingCost).toBe(0);
  });

  it('업횟이 없고 미달이면 손절이며, 값어치는 회수가다', () => {
    const v = judge({ ...problem, salvage: 50_000 }, sol.expectedCost, [5, 6], 0);
    expect(v.action).not.toBe(ACT_CONTINUE);
    expect(v.worth).toBeCloseTo(50_000, 6);
  });
});
