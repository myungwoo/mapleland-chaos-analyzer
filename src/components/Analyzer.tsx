'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { asset } from '@/lib/asset';
import { analyze, finalStatDistribution, type Analysis } from '@/lib/chaos';
import { formatMeso, formatPercent, MAN } from '@/lib/format';
import { BarList, Histogram, ProbabilityCurve } from './charts';
import { InputPanel } from './InputPanel';
import { statKind, toProblem, type Inputs, type StatId } from './inputs';
import { StateAdvisor } from './StateAdvisor';
import { StrategyMap } from './StrategyMap';
import { usePersistedState, type Progress } from './storage';
import { useDebounced } from './useDebounced';
import { Panel, Stat, Warning } from './ui';

export function Analyzer() {
  const { inputs, progress, setInputs, setProgress, reset } = usePersistedState();

  // 입력칸은 즉시 반응하고, 무거운 분석만 타이핑이 멎은 뒤에 돈다.
  const settled = useDebounced(inputs);
  const stale = settled !== inputs;

  const result = useMemo(() => {
    const built = toProblem(settled);
    if (!built.ok) return built;
    return { ...built, analysis: analyze(built.problem) };
  }, [settled]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-[18px] text-accent">
          <Image
            src={asset('/game-icons/2049100.png')}
            alt=""
            width={30}
            height={30}
            unoptimized
            className="pixelated"
          />
          메이플랜드 혼돈의 주문서 분석기
        </h1>
        <p className="text-[11px] text-ink-3">
          원하는 능력치까지의 최소 기대비용 전략과 손절 시점을 동적계획으로 정확히 계산합니다
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <InputPanel inputs={inputs} onChange={setInputs} onReset={reset} />
        </div>

        <div className={`relative flex min-w-0 flex-col gap-4 ${stale ? 'opacity-50' : ''}`}>
          {stale && (
            <span className="pointer-events-none absolute -top-5 right-0 text-[11px] text-ink-3">
              입력 반영 중…
            </span>
          )}
          {result.ok ? (
            <Results
              analysis={result.analysis}
              inputs={settled}
              targetIds={result.targetIds}
              progress={progress}
              onProgress={setProgress}
            />
          ) : (
            <Panel title="입력이 더 필요합니다">
              <p className="text-[12px] leading-relaxed text-ink-2">{result.reason}</p>
            </Panel>
          )}
        </div>
      </div>

      <footer className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
        혼돈의 주문서 확률은 유저 측정치를 기본값으로 둔 가정입니다. 아이콘은 넥슨의 저작물이며,
        이 도구는 넥슨과 관계가 없습니다.
      </footer>
    </div>
  );
}

function Results({
  analysis,
  inputs,
  targetIds,
  progress,
  onProgress,
}: {
  analysis: Analysis;
  inputs: Inputs;
  targetIds: StatId[];
  progress: Progress;
  onProgress: (p: Progress) => void;
}) {
  const { problem, solution, feasible, distribution, costQuantiles, strategies } = analysis;
  const itemName = inputs.itemName.trim() || '아이템';
  const budget = inputs.budget !== null && inputs.budget > 0 ? inputs.budget * MAN : null;
  const finished = inputs.finishedPrice !== null && inputs.finishedPrice > 0 ? inputs.finishedPrice * MAN : null;
  const goalText = problem.stats.map((s) => `${s.label} ${s.target}`).join(' · ');

  if (!feasible) {
    return (
      <Panel title="불가능합니다">
        <p className="text-[12px] leading-relaxed text-ink-2">
          업횟 {problem.slots}회로는 {goalText} 이상을 만들 방법이 없습니다. 지금 수치가 0 인
          능력치는 혼돈의 주문서로 생기지 않으며, 한 번에 오를 수 있는 폭에도 한계가 있습니다.
        </p>
      </Panel>
    );
  }

  const alreadyDone = solution.scrollsPerItem === 0 && solution.successPerItem === 1;
  const saves = solution.baseline.expectedCost - solution.expectedCost;

  return (
    <>
      {analysis.warnings.map((w) => (
        <Warning key={w}>{w}</Warning>
      ))}

      <Panel title="결론" hint={`목표: ${goalText} 이상`}>
        {alreadyDone ? (
          <p className="text-[15px] leading-relaxed text-ink-1">
            시작 수치가 이미 목표를 만족합니다. 혼줌을 바를 이유가 없습니다.
          </p>
        ) : (
          <p className="text-[15px] leading-relaxed text-ink-1">
            {withObjectParticle(itemName)} <b className="tabular text-accent">{formatMeso(problem.itemPrice)}</b>에
            사서 혼돈의 주문서를 바르다가, <b className="text-[color:var(--series-stop)]">손절 지도의 &lsquo;손&rsquo; 칸</b>에
            들어서면 처분하고 새로 시작하세요.
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Stat
            label="기대 총비용"
            value={formatMeso(solution.expectedCost)}
            sub={problem.salvage > 0 ? '실패작 회수 반영' : '실패작 회수 0'}
            tone="accent"
          />
          <Stat
            label="필요한 아이템"
            value={`${analysis.expectedItems.toFixed(1)}개`}
            sub={`절반은 ${analysis.itemQuantiles.p50}개, 90%는 ${analysis.itemQuantiles.p90}개 안`}
          />
          <Stat
            label="필요한 혼돈의 주문서"
            value={`${analysis.expectedScrolls.toFixed(1)}장`}
            sub={`아이템당 ${solution.scrollsPerItem.toFixed(1)}장`}
          />
          <Stat
            label="아이템 1개로 성공"
            value={formatPercent(analysis.oneShot)}
            sub={`손절 없이 끝까지 · 전략대로면 ${formatPercent(solution.successPerItem)}`}
          />
        </div>
        {costQuantiles && (
          <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Stat label="지출 중앙값" value={formatMeso(costQuantiles.p50)} sub="절반은 이 안에 끝남" />
            <Stat
              label="운 나쁘면 (상위 10%)"
              value={formatMeso(costQuantiles.p90)}
              sub={`상위 1% ${formatMeso(costQuantiles.p99)}`}
              tone="warn"
            />
            {budget !== null && distribution && (
              <Stat
                label="예산 안에 성공"
                value={formatPercent(distribution.probabilityWithin(budget))}
                sub={`예산 ${formatMeso(budget)}`}
              />
            )}
            {finished !== null && (
              <Stat
                label={finished < solution.expectedCost ? '완성품을 사는 게' : '직접 만드는 게'}
                value={`${formatMeso(Math.abs(finished - solution.expectedCost))} 이득`}
                sub={`완성품 ${formatMeso(finished)} · 기대값 기준`}
                tone={finished < solution.expectedCost ? 'warn' : 'default'}
              />
            )}
          </div>
        )}
        {!alreadyDone && saves > 1 && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
            손절 없이 업횟을 다 바르는 것보다 기대비용이{' '}
            <b className="text-ink-2">{formatMeso(saves)}</b> 적습니다. 아이템 1개의 성공 확률은
            낮아지지만, 가망이 줄어든 아이템에 혼줌을 붓지 않아서입니다.
          </p>
        )}
      </Panel>

      <StateAdvisor
        analysis={analysis}
        targetIds={targetIds}
        progress={progress}
        onChange={onProgress}
      />

      {!alreadyDone && (
        <StrategyMap
          analysis={analysis}
          onPick={(slots, values) =>
            onProgress({
              slots,
              values: Object.fromEntries(targetIds.map((id, i) => [id, values[i]])),
            })
          }
        />
      )}

      {distribution && !alreadyDone && (
        <Panel title="쓸 돈별 성공 확률" hint="최적 전략을 그대로 따를 때">
          <ProbabilityCurve
            xLabel="쓸 수 있는 돈"
            series={[
              {
                label: '최적 전략',
                values: distribution.cdf,
                step: distribution.tick,
                color: 'var(--chaos)',
              },
            ]}
            markers={[
              ...(costQuantiles
                ? [
                    { x: costQuantiles.p50, label: '중앙' },
                    { x: costQuantiles.p90, label: '상위10%' },
                  ]
                : []),
              ...(budget !== null ? [{ x: budget, label: '내 예산' }] : []),
            ]}
          />
          <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-3">
            그 금액 안에서 목표 아이템이 나올 확률입니다. 실패작 회수액은 다음 아이템을 사는 데 다시
            쓴다고 보고 지출에서 뺐습니다. 예산이 빠듯하면 전략을 바꿔(더 일찍 손절하는 등) 확률을
            조금 더 올릴 여지가 있지만, 이 곡선은 기대비용을 최소로 하는 전략 그대로의 값입니다.
          </p>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="전략 비교" hint="같은 조건">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-ink-3">
                <th className="pb-1 text-left font-normal">전략</th>
                <th className="pb-1 text-right font-normal">기대 총비용</th>
                <th className="pb-1 text-right font-normal">아이템당 성공</th>
                <th className="pb-1 text-right font-normal">아이템</th>
                <th className="pb-1 text-right font-normal">혼줌</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {strategies.map((s, i) => (
                <tr key={s.label} className="border-t border-line">
                  <td className={`py-1 ${i === 0 ? 'text-accent' : 'text-ink-2'}`}>{s.label}</td>
                  <td className="py-1 text-right text-ink-1">{formatMeso(s.expectedCost)}</td>
                  <td className="py-1 text-right text-ink-1">{formatPercent(s.successPerItem)}</td>
                  <td className="py-1 text-right text-ink-1">{s.expectedItems.toFixed(1)}개</td>
                  <td className="py-1 text-right text-ink-1">{s.expectedScrolls.toFixed(1)}장</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-3">
            &ldquo;손절 없이 끝까지&rdquo;도 목표에 닿는 순간 멈추고, 가망이 아예 없어진 아이템은
            버립니다. 차이는 <b className="text-ink-2">가망이 남았지만 낮은</b> 아이템을 어떻게
            하느냐입니다.
          </p>
        </Panel>

        {analysis.leftoverSlots.length > 0 && !alreadyDone && (
          <Panel title="달성했을 때 남는 업횟" hint="성공한 아이템 기준">
            <BarList
              rows={analysis.leftoverSlots.map((o) => ({ label: `${o.value}회 남음`, value: o.probability }))}
              format={(v) => formatPercent(v)}
              color="var(--chaos)"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              목표에 닿으면 바로 멈추므로 업횟이 남을 수 있습니다. 남은 업횟에는 일반 주문서를 더
              바를 수 있습니다.
            </p>
          </Panel>
        )}
      </div>

      <FinalDistributions analysis={analysis} inputs={inputs} />
    </>
  );
}

/**
 * 업횟을 전부 혼줌으로 채웠을 때 능력치별 결과. 목표가 없는 능력치도 보여 준다 —
 * "혼줌을 바르면 대충 어떻게 나오나" 는 목표와 무관하게 궁금한 것이다.
 */
function FinalDistributions({ analysis, inputs }: { analysis: Analysis; inputs: Inputs }) {
  const { problem } = analysis;
  const rows = inputs.stats
    .filter((s) => s.start !== null && s.start > 0)
    .map((s) => {
      const kind = statKind(s.id);
      const dist = finalStatDistribution(problem, { start: s.start!, step: kind.step }, problem.slots);
      const mean = dist.reduce((a, o) => a + o.value * o.probability, 0);
      return { id: s.id, label: kind.label, start: s.start!, min: s.min, dist, mean };
    });
  if (!rows.length) return null;

  return (
    <Panel title="업횟을 전부 바르면" hint={`능력치별 · 손절·목표 무시 · ${problem.slots}회`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="text-ink-2">{r.label}</span>
              <span className="tabular text-[11px] text-ink-3">
                {r.start} → 평균 {r.mean.toFixed(1)}
              </span>
            </div>
            <Histogram
              rows={r.dist}
              threshold={r.min !== null && r.min > 0 ? r.min : undefined}
              label={r.label}
              formatValue={(v) => (v === 0 ? '0(소멸)' : String(v))}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** 받침 유무로 을/를 을 고른다. 한글로 끝나지 않으면 을(를). */
function withObjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}을(를)`;
  return `${word}${(code - 0xac00) % 28 === 0 ? '를' : '을'}`;
}
