import { costDistribution, itemsQuantile, type CostDistribution } from './distribution';
import {
  ACT_CONTINUE,
  ACT_GOAL,
  countStates,
  cycleOutcomes,
  MAX_STATES,
  solveItem,
  type Action,
} from './item';
import { solve, type Solution } from './solve';
import type { ChaosProblem, Outcome } from './types';

export * from './types';
export * from './item';
export * from './solve';
export * from './distribution';

/**
 * 블로그에 정리된 유저 측정치 (velog @darkpppet, "메이플 혼돈의 주문서 확률").
 * 인게임 실제 확률이 아니라 **자리표시자**다. 화면에서 얼마든지 바꿔 볼 수 있다.
 */
export const COMMUNITY_DELTAS: Outcome[] = [
  { value: -5, probability: 0.0494 },
  { value: -4, probability: 0.0297 },
  { value: -3, probability: 0.0365 },
  { value: -2, probability: 0.08 },
  { value: -1, probability: 0.137 },
  { value: 0, probability: 0.1838 },
  { value: 1, probability: 0.1931 },
  { value: 2, probability: 0.1587 },
  { value: 3, probability: 0.1021 },
  { value: 4, probability: 0.0198 },
  { value: 5, probability: 0.0099 },
];

export interface StrategyRow {
  label: string;
  expectedCost: number;
  successPerItem: number;
  expectedItems: number;
  expectedScrolls: number;
}

export interface Analysis {
  problem: ChaosProblem;
  solution: Solution;
  feasible: boolean;
  /** 아이템 1개를 끝까지(손절 없이) 발라 목표를 이룰 확률 — "한 번에 성공할 확률" */
  oneShot: number;
  expectedItems: number;
  expectedScrolls: number;
  itemQuantiles: { p50: number; p90: number; p99: number };
  distribution: CostDistribution | null;
  costQuantiles: { p50: number; p90: number; p99: number } | null;
  /** 목표를 이뤘을 때 남는 업횟의 분포 (아이템 1개가 성공한 경우 기준) */
  leftoverSlots: Outcome[];
  /** 최적 정책으로 아이템 1개가 손절되기까지 바르는 장수 분포 */
  cycles: { succ: Float64Array; fail: Float64Array };
  strategies: StrategyRow[];
  warnings: string[];
}

export function analyze(problem: ChaosProblem): Analysis {
  const warnings: string[] = [];
  const solution = solve(problem);
  const feasible = Number.isFinite(solution.expectedCost);

  const cycles = feasible
    ? cycleOutcomes(problem, solution.item)
    : { succ: new Float64Array(problem.slots + 1), fail: new Float64Array(problem.slots + 1) };

  const distribution = feasible ? costDistribution(problem, cycles, solution.expectedCost) : null;
  const costQuantiles = distribution
    ? {
        p50: distribution.quantile(0.5),
        p90: distribution.quantile(0.9),
        p99: distribution.quantile(0.99),
      }
    : null;

  const q = solution.successPerItem;
  const succTotal = cycles.succ.reduce((a, b) => a + b, 0);
  const leftoverSlots: Outcome[] = [];
  if (succTotal > 0) {
    for (let j = 0; j < cycles.succ.length; j++) {
      if (cycles.succ[j] > 0) {
        leftoverSlots.push({ value: problem.slots - j, probability: cycles.succ[j] / succTotal });
      }
    }
    leftoverSlots.sort((a, b) => b.value - a.value);
  }

  const strategies: StrategyRow[] = [
    {
      label: '최적 전략',
      expectedCost: solution.expectedCost,
      successPerItem: q,
      expectedItems: q > 0 ? 1 / q : Infinity,
      expectedScrolls: q > 0 ? solution.scrollsPerItem / q : Infinity,
    },
    {
      label: '손절 없이 끝까지',
      expectedCost: solution.baseline.expectedCost,
      successPerItem: solution.baseline.successPerItem,
      expectedItems: solution.baseline.successPerItem > 0 ? 1 / solution.baseline.successPerItem : Infinity,
      expectedScrolls:
        solution.baseline.successPerItem > 0
          ? solution.baseline.scrollsPerItem / solution.baseline.successPerItem
          : Infinity,
    },
  ];

  if (problem.salvage > 0 && problem.salvage >= problem.itemPrice * 0.95) {
    warnings.push('회수가가 매물가에 거의 붙어 있습니다. 실제로 그 값에 팔리는지 확인해 주세요.');
  }

  return {
    problem,
    solution,
    feasible,
    oneShot: solution.baseline.successPerItem,
    expectedItems: q > 0 ? 1 / q : Infinity,
    expectedScrolls: q > 0 ? solution.scrollsPerItem / q : Infinity,
    itemQuantiles: {
      p50: itemsQuantile(q, 0.5),
      p90: itemsQuantile(q, 0.9),
      p99: itemsQuantile(q, 0.99),
    },
    distribution,
    costQuantiles,
    leftoverSlots,
    cycles,
    strategies,
    warnings,
  };
}

/** 지금 들고 있는 아이템 하나의 판정. */
export interface Verdict {
  action: Action;
  /** 이 아이템으로 목표를 이룰 확률 (최적 정책을 따를 때) */
  successHere: number;
  /** 지금부터 목표 아이템을 얻기까지 더 들 기대비용 (손절·재시작 포함) */
  remainingCost: number;
  /** 이 아이템을 가지고 있는 것의 값어치 = 새로 시작하는 비용 − 이걸로 이어 가는 비용 */
  worth: number;
  /** 앞으로 이 아이템에 바를 혼줌 기대 장수 */
  scrollsHere: number;
}

/**
 * 임의의 상태(지금 수치, 남은 업횟)에서 무엇을 할지.
 *
 * 격자 위의 칸만이 아니라 아무 수치나 받을 수 있게 그 상태에서 따로 푼다. 포기 가치는
 * 전체 풀이의 최소 기대비용에서 회수가를 뺀 값으로 고정한다 — 손절하면 그 값으로 다시
 * 시작하기 때문이다. 같은 이유로 매물 평가에도 그대로 쓸 수 있다 (worth 이하로 사면 이득).
 */
export function judge(problem: ChaosProblem, expectedCost: number, current: number[], slots: number): Verdict {
  const item = solveItem(problem, current, slots, {
    abandonValue: expectedCost - problem.salvage,
  });
  const { act, Q, N } = item.start;
  const remaining = act === ACT_GOAL ? 0 : act === ACT_CONTINUE ? item.start.J : expectedCost - problem.salvage;
  return {
    action: act,
    successHere: act === ACT_CONTINUE || act === ACT_GOAL ? Q : 0,
    remainingCost: remaining,
    worth: expectedCost - remaining,
    scrollsHere: act === ACT_CONTINUE ? N : 0,
  };
}

/** 격자 크기를 미리 재서 너무 큰 문제를 거른다. */
export function tooLarge(problem: ChaosProblem): number | null {
  const states = countStates(problem, problem.stats.map((s) => s.start), problem.slots);
  return states > MAX_STATES ? states : null;
}
