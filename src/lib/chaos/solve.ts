import { solveItem, type ItemSolution } from './item';
import type { ChaosProblem } from './types';

/**
 * 손절 후 새 아이템으로 다시 시작하는 재생 과정의 최소 기대비용.
 *
 * 아이템 하나를 사서(P) 정책대로 바르다가 끝나는 한 번을 "사이클"이라 하자. 정책 π 를
 * 고정하면 사이클마다 성공 확률 q, 바르는 장수 기대값 n 이 정해지고, 실패한 사이클은
 * 회수가 S 를 돌려준다. 성공할 때까지 사이클을 되풀이하므로
 *
 *     총비용(π) = (P + c·n − S·(1−q)) / q
 *
 * 인 **분수 최소화** 문제다. 딩켈바흐(Dinkelbach) 반복을 쓴다: 지금 추정치 λ 를 "포기하면 다시 λ 를
 * 내고 S 를 받는다"는 포기 가치(λ − S)로 넣고 아이템 하나를 풀면 그 λ 에서 최선의 정책이
 * 나오고, 그 정책의 비율을 새 λ 로 삼는다. λ 는 단조 감소하며 정책이 더 바뀌지 않으면
 * 정확히 최적값에서 멈춘다 (보통 서너 번).
 *
 * 출발점은 "가망이 있는 한 끝까지 바르는" 정책이다. 손절은 성공 확률을 올려 주지 않으므로
 * 이 정책의 q 가 가능한 최대이고, 이게 0 이면 어떤 전략으로도 불가능하다.
 */
export interface Solution {
  /** 목표 아이템 하나를 얻는 최소 기대비용 (회수 반영) */
  expectedCost: number;
  /** 최적 정책으로 아이템 1개를 굴렸을 때 목표를 이룰 확률 */
  successPerItem: number;
  /** 최적 정책에서 아이템 1개에 바르는 혼줌 기대 장수 */
  scrollsPerItem: number;
  /** 최적 정책의 아이템 풀이 (전략 지도·판정기가 읽는다) */
  item: ItemSolution;
  /** 기준선: 손절 없이 끝까지 바르기 */
  baseline: {
    successPerItem: number;
    scrollsPerItem: number;
    expectedCost: number;
    item: ItemSolution;
  };
  iterations: number;
}

/** 정책 하나의 성적표 → 총 기대비용. */
export function renewalCost(problem: ChaosProblem, q: number, n: number): number {
  if (!(q > 0)) return Infinity;
  const { itemPrice: P, scrollPrice: c, salvage: S } = problem;
  return (P + c * n - S * (1 - q)) / q;
}

export function startValues(problem: ChaosProblem): number[] {
  return problem.stats.map((s) => s.start);
}

export function solve(problem: ChaosProblem): Solution {
  const start = startValues(problem);
  const U = problem.slots;

  const never = solveItem(problem, start, U, { abandonValue: 0, forceContinue: true });
  const baselineCost = renewalCost(problem, never.start.Q, never.start.N);
  const baseline = {
    successPerItem: never.start.Q,
    scrollsPerItem: never.start.N,
    expectedCost: baselineCost,
    item: never,
  };

  if (!(never.start.Q > 0)) {
    return {
      expectedCost: Infinity,
      successPerItem: 0,
      scrollsPerItem: never.start.N,
      item: never,
      baseline,
      iterations: 0,
    };
  }

  // 직전 정책은 λ 에서도 고를 수 있으므로 새 비율은 λ 를 넘지 않는다. 같아지면 고정점이다.
  // 마지막으로 푼 item 은 최종 λ 를 포기 가치로 쓴 풀이라, 화면에 쓰는 J 도 그 값과 맞는다.
  let lambda = baselineCost;
  let item = never;
  let iterations = 0;
  while (iterations < 100) {
    iterations++;
    const cand = solveItem(problem, start, U, { abandonValue: lambda - problem.salvage });
    // 회수가가 매물가와 같으면 "사자마자 버리기"가 공짜라 시작부터 손절이 고를 만해진다.
    // 입력 검사에서 막지만, 혹시 그런 풀이가 나오면 직전 정책을 지킨다.
    if (!(cand.start.Q > 0)) break;
    item = cand;
    const next = renewalCost(problem, item.start.Q, item.start.N);
    const improved = next < lambda * (1 - 1e-12);
    lambda = Math.min(lambda, next);
    if (!improved) break;
  }

  return {
    expectedCost: lambda,
    successPerItem: item.start.Q,
    scrollsPerItem: item.start.N,
    item,
    baseline,
    iterations,
  };
}
