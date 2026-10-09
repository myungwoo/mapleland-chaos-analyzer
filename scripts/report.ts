/**
 * 예제 시나리오를 풀어 숫자를 터미널에 찍는다. 엔진을 고친 뒤 눈으로 확인하는 용도.
 *
 *   npm run report
 */
import { analyze, COMMUNITY_DELTAS, type ChaosProblem } from '../src/lib/chaos';
import { formatMeso, formatPercent } from '../src/lib/format';

const base: Omit<ChaosProblem, 'stats' | 'slots'> = {
  successRate: 0.6,
  deltas: COMMUNITY_DELTAS,
  itemPrice: 1_000_000,
  scrollPrice: 3_000_000,
  salvage: 0,
};

const scenarios: Array<{ name: string; problem: ChaosProblem }> = [
  {
    name: '공격력 1개 (업횟 7, 공 10 → 15)',
    problem: { ...base, slots: 7, stats: [{ label: '공격력', start: 10, target: 15, step: 1 }] },
  },
  {
    name: '힘·덱 2개 (업횟 7, 3/3 → 6/6)',
    problem: {
      ...base,
      slots: 7,
      stats: [
        { label: '힘', start: 3, target: 6, step: 1 },
        { label: '덱스', start: 3, target: 6, step: 1 },
      ],
    },
  },
  {
    name: '합스탯 (업횟 7, 덱 10·럭 12 → 덱+럭 30)',
    problem: {
      ...base,
      slots: 7,
      stats: [
        { label: '덱스', start: 10, step: 1 },
        { label: '럭', start: 12, step: 1 },
      ],
      sums: [{ stats: [0, 1], min: 30 }],
    },
  },
  {
    name: '합스탯 + 개별 (업횟 7, 덱+럭 ≥ 30 · 공 ≥ 3)',
    problem: {
      ...base,
      slots: 7,
      stats: [
        { label: '덱스', start: 10, step: 1 },
        { label: '럭', start: 12, step: 1 },
        { label: '공격력', start: 1, step: 1, target: 3 },
      ],
      sums: [{ stats: [0, 1], min: 30 }],
    },
  },
  {
    name: '3개 (업횟 10, 공 5·힘 3·HP 50 → 8·5·80)',
    problem: {
      ...base,
      slots: 10,
      stats: [
        { label: '공격력', start: 5, target: 8, step: 1 },
        { label: '힘', start: 3, target: 5, step: 1 },
        { label: 'HP', start: 50, target: 80, step: 10 },
      ],
    },
  },
];

for (const { name, problem } of scenarios) {
  const t0 = performance.now();
  const a = analyze(problem);
  const ms = performance.now() - t0;
  console.log(`\n■ ${name}   (${ms.toFixed(0)}ms, 반복 ${a.solution.iterations})`);
  console.log(`  기대 총비용      ${formatMeso(a.solution.expectedCost)}`);
  console.log(`  아이템당 성공    ${formatPercent(a.solution.successPerItem, 2)} (끝까지 ${formatPercent(a.oneShot, 2)})`);
  console.log(`  기대 아이템/혼줌 ${a.expectedItems.toFixed(2)}개 / ${a.expectedScrolls.toFixed(2)}장`);
  if (a.costQuantiles && a.distribution) {
    console.log(
      `  지출 중앙 ${formatMeso(a.costQuantiles.p50)} · 90% ${formatMeso(a.costQuantiles.p90)} · 99% ${formatMeso(a.costQuantiles.p99)} · 격자평균 ${formatMeso(a.distribution.mean)}`,
    );
  }
  console.log(`  아이템 개수 50/90/99%: ${a.itemQuantiles.p50}/${a.itemQuantiles.p90}/${a.itemQuantiles.p99}`);
  for (const s of a.strategies) {
    console.log(`  - ${s.label.padEnd(10)} ${formatMeso(s.expectedCost).padStart(8)}  아이템당 ${formatPercent(s.successPerItem, 2)}`);
  }
}
