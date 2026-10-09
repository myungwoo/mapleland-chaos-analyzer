'use client';

import { useMemo } from 'react';
import { ACT_CONTINUE, ACT_GOAL, TooLargeError, judge, type Analysis } from '@/lib/chaos';
import { formatMeso, formatPercent } from '@/lib/format';
import type { StatId } from './inputs';
import type { Progress } from './storage';
import { useDebounced } from './useDebounced';
import { NumberField, Panel, Stat } from './ui';

/**
 * 지금 들고 있는 아이템(또는 장터에서 본 매물)을 넣으면 할 일을 알려 준다.
 *
 * 격자 칸이 아니라 아무 수치나 받는다 — 시작 수치가 다른 매물을 평가할 때도 쓰라는 뜻이다.
 * 그래서 이 상태에서 따로 풀고, 손절하면 전체 최소 기대비용으로 다시 시작한다고 본다.
 */
export function StateAdvisor({
  analysis,
  targetIds,
  progress,
  onChange,
}: {
  analysis: Analysis;
  targetIds: StatId[];
  progress: Progress;
  onChange: (p: Progress) => void;
}) {
  const { problem, solution } = analysis;
  const slots = Math.min(progress.slots ?? problem.slots, problem.slots);
  const values = problem.stats.map((s, i) => progress.values[targetIds[i]] ?? s.start);

  // 칸을 칠 때마다 다시 풀지 않도록 손이 멎은 뒤의 값만 쓴다. 배열은 매 렌더 새로 생기므로
  // 문자열 키로 바꿔 넘긴다.
  const settledKey = useDebounced([slots, ...values].join(','));
  const result = useMemo(() => {
    const [u, ...vals] = settledKey.split(',').map(Number);
    // 목표 능력치 수가 막 바뀐 순간에는 늦춘 키가 아직 예전 길이다.
    const ok = vals.length === problem.stats.length && u <= problem.slots;
    // 상태 수 상한은 시작 수치로만 검사했다. 수치를 낮추면 접히던 격자가 펼쳐져 이 상태
    // 하나만으로 상한을 넘을 수 있다 — 그때 던지면 화면이 통째로 죽고, 그 수치가 저장돼
    // 있어 새로고침해도 다시 죽는다. 안내로 바꿔 수치를 고칠 수 있게 둔다.
    try {
      return ok
        ? judge(problem, solution.expectedCost, vals, u)
        : judge(problem, solution.expectedCost, problem.stats.map((s) => s.start), problem.slots);
    } catch (e) {
      if (e instanceof TooLargeError) return { tooLarge: e.states };
      throw e;
    }
  }, [problem, solution.expectedCost, settledKey]);

  const set = (patch: Partial<Progress>) => onChange({ ...progress, ...patch });
  const fresh =
    slots === problem.slots && values.every((v, i) => v === problem.stats[i].start);

  const resetButton = !fresh && (
    <button
      type="button"
      className="inset px-2 py-0.5 text-[11px] text-ink-2 hover:text-ink-1"
      onClick={() => onChange({ slots: null, values: {} })}
    >
      새 아이템으로
    </button>
  );

  const fields = (
    <div className="flex flex-col gap-2">
      <NumberField
        label="남은 업횟"
        value={slots}
        onChange={(v) =>
          set({ slots: Math.max(0, Math.min(problem.slots, Math.round(v ?? problem.slots))) })
        }
        suffix="회"
        min={0}
        max={problem.slots}
      />
      {problem.stats.map((s, i) => (
        <NumberField
          key={targetIds[i]}
          label={s.label}
          value={values[i]}
          onChange={(v) =>
            set({ values: { ...progress.values, [targetIds[i]]: Math.max(0, v ?? 0) } })
          }
          suffix={s.target !== undefined ? `/ ${s.target}` : undefined}
          min={0}
        />
      ))}
      {(problem.sums ?? []).map((g, gi) => {
        const sum = g.stats.reduce((a, i) => a + Math.max(0, values[i]), 0);
        return (
          <p key={gi} className="flex justify-between text-[11px] text-ink-3">
            <span>{g.stats.map((i) => problem.stats[i].label).join('+')}</span>
            <span className="tabular">
              <b className={sum >= g.min ? 'text-ink-1' : 'text-ink-2'}>{sum}</b> / {g.min}
            </span>
          </p>
        );
      })}
    </div>
  );

  if ('tooLarge' in result) {
    return (
      <Panel title="현재 상황 판정" hint="지금 아이템 또는 장터 매물" right={resetButton}>
        <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
          {fields}
          <p className="text-[13px] leading-relaxed text-ink-2">
            이 수치에서는 따져 볼 상태가 {result.tooLarge.toLocaleString('ko-KR')}개로 너무 많아
            판정할 수 없습니다. 수치나 남은 업횟을 바꾸거나 &ldquo;새 아이템으로&rdquo;를 눌러 주세요.
          </p>
        </div>
      </Panel>
    );
  }
  const verdict = result;

  const headline =
    verdict.action === ACT_GOAL
      ? '목표 달성! 더 바르지 마세요.'
      : verdict.action === ACT_CONTINUE
        ? '혼돈의 주문서를 한 장 더 바르세요.'
        : slots === 0
          ? '업횟을 다 썼습니다. 처분하고 새로 시작하세요.'
          : '여기서 손절하고 새 아이템으로 시작하는 게 낫습니다.';
  const color =
    verdict.action === ACT_GOAL
      ? 'var(--ink-1)'
      : verdict.action === ACT_CONTINUE
        ? 'var(--chaos-ink)'
        : 'var(--series-stop)';

  return (
    <Panel title="현재 상황 판정" hint="지금 아이템 또는 장터 매물" right={resetButton}>
      <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        {fields}
        <div className="flex flex-col gap-2">
          <p className="text-[15px] leading-relaxed" style={{ color }}>
            {headline}
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat
              label="이 아이템으로 달성"
              value={formatPercent(verdict.successHere)}
              sub={verdict.action === ACT_CONTINUE ? '전략대로 바를 때' : undefined}
            />
            <Stat
              label="앞으로 더 들 돈"
              value={formatMeso(verdict.remainingCost)}
              sub="손절·재시작 포함 기대값"
            />
            <Stat
              label="더 바를 혼줌"
              value={`${verdict.scrollsHere.toFixed(1)}장`}
              sub="이 아이템에, 기대값"
            />
            <Stat
              label="이 상태의 값어치"
              value={formatMeso(verdict.worth)}
              sub="이보다 싸면 사는 게 이득"
              tone="accent"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-ink-3">
            &ldquo;값어치&rdquo;는 새 아이템부터 시작하는 기대비용({formatMeso(solution.expectedCost)})에서
            이 상태로 이어 가는 기대비용을 뺀 값입니다. 장터에서 본 매물의 수치와 업횟을 넣으면
            그 매물에 얼마까지 낼 만한지가 됩니다.
          </p>
        </div>
      </div>
    </Panel>
  );
}
