/**
 * 혼돈의 주문서 분석 엔진의 공용 타입.
 *
 * 혼돈의 주문서는 업횟을 1 쓰고, 성공하면 **붙어 있는 능력치마다 따로** −5~+5 를 굴린다.
 * 실패하면 업횟만 줄고 아무 일도 없다. 0 이하로 떨어진 능력치는 사라져서 다시 붙지 않는다.
 */

/** 이산 확률 분포의 한 점. */
export interface Outcome {
  value: number;
  probability: number;
}

/**
 * 상태에 들어가는 능력치 하나. 목표(개별 최소값이나 합 목표)에 쓰이지 않는 능력치는
 * 굴림이 독립이라 결정에 영향을 주지 않으므로 엔진에 넣지 않는다.
 */
export interface TargetStat {
  /** 화면 표기용 이름. 예: '힘' */
  label: string;
  /** 지금 수치. 0 이하면 이미 사라진 능력치다. */
  start: number;
  /** 이 능력치 혼자 이 값 이상이어야 한다 (선택). */
  target?: number;
  /** 변화 단위. 대부분 1, 최대 HP/MP 는 10. */
  step: number;
}

/**
 * 합 목표: 여러 능력치의 합이 min 이상. 사라진 능력치는 0 으로 친다.
 * 예) 덱스 + 럭 ≥ 30
 */
export interface SumGoal {
  /** stats 배열의 인덱스들 */
  stats: number[];
  min: number;
}

/** 분석할 문제 하나. 금액은 전부 메소. */
export interface ChaosProblem {
  /** 사 오는 아이템의 업그레이드 가능 횟수 */
  slots: number;
  /** 주문서 성공 확률 (0~1) */
  successRate: number;
  /** 성공 시 능력치 하나의 변화량 분포 (단위: step). 합이 1 이 아니면 정규화한다. */
  deltas: Outcome[];
  /** 목표에 쓰이는 능력치들 */
  stats: TargetStat[];
  /** 합 목표들. 개별 최소값(stats[i].target)과 함께 **전부** 동시에 만족해야 달성. */
  sums?: SumGoal[];
  /** 베이스 아이템 1개 가격 */
  itemPrice: number;
  /** 혼돈의 주문서 1장 가격 */
  scrollPrice: number;
  /** 목표를 포기한 아이템 1개를 처분해 돌려받는 돈. 매물가보다 낮아야 한다. */
  salvage: number;
}

/** 엔진 안에서 쓰는 목표 하나: axes 의 수치 합 ≥ min. 개별 최소값은 축이 하나인 목표다. */
export interface Goal {
  axes: number[];
  min: number;
}

/** 개별 최소값과 합 목표를 한 목록으로 모은다. min ≤ 0 은 늘 참이라 뺀다. */
export function goalsOf(problem: Pick<ChaosProblem, 'stats' | 'sums'>): Goal[] {
  const goals: Goal[] = [];
  problem.stats.forEach((s, i) => {
    if (s.target !== undefined && s.target > 0) goals.push({ axes: [i], min: s.target });
  });
  for (const g of problem.sums ?? []) {
    const axes = [...new Set(g.stats)].filter((i) => i >= 0 && i < problem.stats.length);
    if (axes.length && g.min > 0) goals.push({ axes, min: g.min });
  }
  return goals;
}
