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

/** 목표가 걸린 능력치 하나. 목표가 없는 능력치는 전략에 영향을 주지 않아 엔진에 넣지 않는다. */
export interface TargetStat {
  /** 화면 표기용 이름. 예: '힘' */
  label: string;
  /** 지금 수치. 1 이상이어야 붙어 있는 능력치다. */
  start: number;
  /** 이 값 이상이면 만족. 1 이상. */
  target: number;
  /** 변화 단위. 대부분 1, 최대 HP/MP 는 10. */
  step: number;
}

/** 분석할 문제 하나. 금액은 전부 메소. */
export interface ChaosProblem {
  /** 사 오는 아이템의 업그레이드 가능 횟수 */
  slots: number;
  /** 주문서 성공 확률 (0~1) */
  successRate: number;
  /** 성공 시 능력치 하나의 변화량 분포 (단위: step). 합이 1 이 아니면 정규화한다. */
  deltas: Outcome[];
  /** 목표가 걸린 능력치들 (전부 동시에 만족해야 달성) */
  stats: TargetStat[];
  /** 베이스 아이템 1개 가격 */
  itemPrice: number;
  /** 혼돈의 주문서 1장 가격 */
  scrollPrice: number;
  /** 목표를 포기한 아이템 1개를 처분해 돌려받는 돈. 매물가보다 낮아야 한다. */
  salvage: number;
}
