import { COMMUNITY_DELTAS, MAX_STATES, countStates, type ChaosProblem } from '@/lib/chaos';
import { MAN } from '@/lib/format';

/** 혼돈의 주문서가 건드리는 능력치. HP/MP 는 10 단위로 움직인다. */
export const STAT_KINDS = [
  { id: 'str', label: '힘', step: 1 },
  { id: 'dex', label: '덱스', step: 1 },
  { id: 'int', label: '인트', step: 1 },
  { id: 'luk', label: '럭', step: 1 },
  { id: 'atk', label: '공격력', step: 1 },
  { id: 'matk', label: '마력', step: 1 },
  { id: 'def', label: '물리방어력', step: 1 },
  { id: 'mdef', label: '마법방어력', step: 1 },
  { id: 'acc', label: '명중치', step: 1 },
  { id: 'avoid', label: '회피치', step: 1 },
  { id: 'speed', label: '이동속도', step: 1 },
  { id: 'jump', label: '점프력', step: 1 },
  { id: 'hp', label: '최대 HP', step: 10 },
  { id: 'mp', label: '최대 MP', step: 10 },
] as const;

export type StatId = (typeof STAT_KINDS)[number]['id'];

export function statKind(id: StatId) {
  return STAT_KINDS.find((s) => s.id === id)!;
}

/** 아이템에 붙은 능력치 한 줄. 최소값을 비우면 목표가 없는 능력치다. */
export interface StatRow {
  id: StatId;
  start: number | null;
  min: number | null;
}

/** 합 목표 한 줄: 고른 능력치들의 합이 min 이상. 예) 덱스 + 럭 ≥ 30 */
export interface SumRow {
  ids: StatId[];
  min: number | null;
}

/** 굴림 변화량의 범위. 혼돈의 주문서는 −5 ~ +5 다. */
export const DELTA_MIN = -5;
export const DELTA_MAX = 5;
export const DELTA_VALUES = Array.from(
  { length: DELTA_MAX - DELTA_MIN + 1 },
  (_, i) => DELTA_MIN + i,
);

/** 블로그 측정치를 % 로. 자리표시자다. */
export const DEFAULT_DELTAS = DELTA_VALUES.map(
  (v) => +((COMMUNITY_DELTAS.find((d) => d.value === v)?.probability ?? 0) * 100).toFixed(2),
);

export interface Inputs {
  /** 아이템 이름 (표기용, 선택) */
  itemName: string;
  slots: number;
  stats: StatRow[];
  /** 합 목표들. 개별 최소값과 함께 전부 만족해야 달성. */
  sums: SumRow[];
  /** 주문서 성공률 (%) */
  successRate: number;
  /** DELTA_VALUES 순서의 확률 (%) */
  deltas: number[];
  /** 아래 금액은 전부 만 메소 단위 */
  itemPrice: number | null;
  scrollPrice: number | null;
  salvage: number | null;
  /** 완성품을 그냥 사면 얼마인지 (비교용, 선택) */
  finishedPrice: number | null;
  budget: number | null;
}

export const MAX_STATS = 8;
export const MAX_TARGETS = 4;
export const MAX_SUMS = 4;

export const DEFAULT_INPUTS: Inputs = {
  itemName: '',
  slots: 7,
  stats: [
    { id: 'str', start: 3, min: 6 },
    { id: 'dex', start: 3, min: 6 },
    { id: 'def', start: 20, min: null },
  ],
  sums: [],
  successRate: 60,
  deltas: DEFAULT_DELTAS,
  itemPrice: 10,
  scrollPrice: 300,
  salvage: 0,
  finishedPrice: null,
  budget: null,
};

export type ProblemResult =
  | { ok: true; problem: ChaosProblem; targetIds: StatId[] }
  | { ok: false; reason: string };

/** 실제로 쓰이는 합 목표 (최소값이 있고, 목록에 있는 능력치를 하나 이상 고른 것). */
export function activeSums(inputs: Pick<Inputs, 'stats' | 'sums'>): Array<{ ids: StatId[]; min: number }> {
  const present = new Set(inputs.stats.map((s) => s.id));
  return inputs.sums
    .map((g) => ({ ids: g.ids.filter((id) => present.has(id)), min: g.min }))
    .filter((g): g is { ids: StatId[]; min: number } => g.ids.length > 0 && g.min !== null && g.min > 0);
}

/** "덱스+럭" 처럼 합 목표의 이름. */
export function sumLabel(ids: readonly StatId[]): string {
  return ids.map((id) => statKind(id).label).join('+');
}

/** 화면 입력 → 엔진 문제. 풀 수 없는 입력이면 이유를 돌려준다. */
export function toProblem(inputs: Inputs): ProblemResult {
  const sums = activeSums(inputs);
  const inSum = new Set(sums.flatMap((g) => g.ids));
  // 개별 최소값이 있거나 합 목표에 낀 능력치만 상태에 들어간다. 순서는 목록 순서.
  const targets = inputs.stats.filter((s) => (s.min !== null && s.min > 0) || inSum.has(s.id));
  if (!targets.length) {
    return {
      ok: false,
      reason: '원하는 최소값을 능력치 하나 이상에 적거나, 합 목표를 하나 이상 만들어 주세요.',
    };
  }
  if (targets.length > MAX_TARGETS) {
    return {
      ok: false,
      reason: `목표에 쓰이는 능력치는 ${MAX_TARGETS}개까지입니다 (개별 최소값과 합 목표를 합쳐서). 계산량이 능력치 수에 지수적으로 늘어납니다.`,
    };
  }
  if (inputs.itemPrice === null || inputs.scrollPrice === null) {
    return { ok: false, reason: '아이템 가격과 혼돈의 주문서 가격을 채워 주세요.' };
  }
  const salvage = inputs.salvage ?? 0;
  if (!(salvage < inputs.itemPrice)) {
    return {
      ok: false,
      reason:
        '포기한 아이템의 회수가는 아이템 가격보다 낮아야 합니다. 같거나 높으면 사서 바로 되팔기만 해도 손해가 없어 답이 정해지지 않습니다.',
    };
  }
  const deltaTotal = inputs.deltas.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (!(deltaTotal > 0)) return { ok: false, reason: '변화량 확률이 전부 0 입니다.' };
  if (!(inputs.successRate > 0)) return { ok: false, reason: '성공률이 0% 이면 아무것도 바뀌지 않습니다.' };

  const problem: ChaosProblem = {
    slots: inputs.slots,
    successRate: Math.min(100, inputs.successRate) / 100,
    deltas: DELTA_VALUES.map((value, i) => ({
      value,
      probability: Math.max(0, inputs.deltas[i] ?? 0) / deltaTotal,
    })),
    stats: targets.map((s) => {
      const kind = statKind(s.id);
      return {
        label: kind.label,
        start: s.start ?? 0,
        step: kind.step,
        ...(s.min !== null && s.min > 0 ? { target: s.min } : {}),
      };
    }),
    sums: sums.map((g) => ({
      stats: g.ids.map((id) => targets.findIndex((t) => t.id === id)),
      min: g.min,
    })),
    itemPrice: inputs.itemPrice * MAN,
    scrollPrice: inputs.scrollPrice * MAN,
    salvage: salvage * MAN,
  };

  const states = countStates(
    problem,
    problem.stats.map((s) => s.start),
    problem.slots,
  );
  if (states > MAX_STATES) {
    return {
      ok: false,
      reason: `상태가 ${states.toLocaleString('ko-KR')}개로 너무 많습니다. 최소값을 건 능력치 수나 업횟을 줄여 주세요.`,
    };
  }

  return { ok: true, problem, targetIds: targets.map((s) => s.id) };
}
