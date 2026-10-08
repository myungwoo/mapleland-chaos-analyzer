'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { asset } from '@/lib/asset';
import {
  DEFAULT_DELTAS,
  DELTA_VALUES,
  MAX_STATS,
  MAX_TARGETS,
  STAT_KINDS,
  statKind,
  type Inputs,
  type StatId,
  type StatRow,
} from './inputs';
import { NumberField, Panel } from './ui';

export function InputPanel({
  inputs,
  onChange,
  onReset,
}: {
  inputs: Inputs;
  onChange: (next: Inputs) => void;
  onReset: () => void;
}) {
  const patch = (p: Partial<Inputs>) => onChange({ ...inputs, ...p });

  return (
    <div className="flex flex-col gap-3">
      <Panel title="아이템">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[12px]">
            <span className="w-20 shrink-0 text-ink-2">이름</span>
            <span className="inset flex min-w-0 flex-1 items-center px-2 py-1">
              <input
                type="text"
                className="w-full min-w-0 bg-transparent text-ink-1 outline-none placeholder:text-ink-3"
                value={inputs.itemName}
                placeholder="선택 (표기용)"
                maxLength={40}
                onChange={(e) => patch({ itemName: e.target.value })}
              />
            </span>
          </label>
          <NumberField
            label="업횟"
            value={inputs.slots}
            onChange={(v) => patch({ slots: Math.max(1, Math.min(20, Math.round(v ?? 1))) })}
            suffix="회"
            min={1}
            max={20}
          />
        </div>
        <StatEditor stats={inputs.stats} onChange={(stats) => patch({ stats })} />
      </Panel>

      <Panel title="시세" hint="만 메소">
        <div className="flex flex-col gap-2">
          <NumberField
            label="아이템"
            value={inputs.itemPrice}
            onChange={(v) => patch({ itemPrice: v })}
            suffix="만"
            placeholder="필수"
          />
          <div className="flex items-center gap-2">
            <Image
              src={asset('/game-icons/2049100.png')}
              alt=""
              width={30}
              height={30}
              unoptimized
              className="pixelated shrink-0"
            />
            <div className="flex-1">
              <NumberField
                label="혼줌"
                value={inputs.scrollPrice}
                onChange={(v) => patch({ scrollPrice: v })}
                suffix="만"
                placeholder="필수"
              />
            </div>
          </div>
          <NumberField
            label="실패작 회수"
            value={inputs.salvage}
            onChange={(v) => patch({ salvage: v })}
            suffix="만"
            placeholder="0"
          />
          <p className="text-[11px] leading-relaxed text-ink-3">
            목표에 못 미쳐 포기한 아이템 1개를 처분해 돌려받는 돈입니다. 상점가든 시세든
            대충의 평균이면 됩니다. 아이템 가격보다는 낮아야 합니다.
          </p>
          <NumberField
            label="완성품"
            value={inputs.finishedPrice}
            onChange={(v) => patch({ finishedPrice: v })}
            suffix="만"
            placeholder="선택 · 비교용"
          />
          <NumberField
            label="예산"
            value={inputs.budget}
            onChange={(v) => patch({ budget: v })}
            suffix="만"
            placeholder="선택"
          />
        </div>
      </Panel>

      <Panel title="혼돈의 주문서 확률" hint="바꿔 볼 수 있음">
        <NumberField
          label="성공률"
          value={inputs.successRate}
          onChange={(v) => patch({ successRate: Math.max(0, Math.min(100, v ?? 0)) })}
          suffix="%"
          min={0}
          max={100}
        />
        <DeltaEditor deltas={inputs.deltas} onChange={(deltas) => patch({ deltas })} />
      </Panel>

      <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] leading-relaxed text-ink-3">
        <p>
          입력값은 <b>이 브라우저에만</b> 저장됩니다.
        </p>
        <ResetButton onReset={onReset} />
      </div>
    </div>
  );
}

function StatEditor({ stats, onChange }: { stats: StatRow[]; onChange: (s: StatRow[]) => void }) {
  const used = new Set(stats.map((s) => s.id));
  const free = STAT_KINDS.filter((k) => !used.has(k.id));
  const targets = stats.filter((s) => s.min !== null && s.min > 0).length;
  const set = (i: number, row: Partial<StatRow>) =>
    onChange(stats.map((s, j) => (j === i ? { ...s, ...row } : s)));

  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_1.25rem] items-center gap-1.5 text-[11px] text-ink-3">
        <span>능력치</span>
        <span className="text-right">지금</span>
        <span className="text-right">원하는 최소</span>
        <span />
        {stats.map((row, i) => {
          const kind = statKind(row.id);
          const dead = row.min !== null && row.min > 0 && !(row.start !== null && row.start > 0);
          return (
            <StatLine
              key={row.id}
              row={row}
              options={[kind, ...free]}
              unitHint={kind.step > 1 ? `${kind.step} 단위` : undefined}
              dead={dead}
              onKind={(id) => set(i, { id })}
              onStart={(v) => set(i, { start: v })}
              onMin={(v) => set(i, { min: v })}
              onRemove={() => onChange(stats.filter((_, j) => j !== i))}
            />
          );
        })}
      </div>
      {stats.length < MAX_STATS && free.length > 0 && (
        <button
          type="button"
          className="inset mt-2 w-full px-2 py-1 text-[11px] text-ink-2 hover:text-ink-1"
          onClick={() => onChange([...stats, { id: free[0].id, start: null, min: null }])}
        >
          + 능력치 추가
        </button>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        최소값을 적은 능력치가 <b className="text-ink-2">모두</b> 동시에 그 이상이면 목표 달성입니다
        ({targets}/{MAX_TARGETS}). 최소값이 빈 능력치는 결과 분포에만 쓰입니다. 0 이하로 떨어진
        능력치는 사라져 다시 오르지 않습니다.
      </p>
    </div>
  );
}

function StatLine({
  row,
  options,
  unitHint,
  dead,
  onKind,
  onStart,
  onMin,
  onRemove,
}: {
  row: StatRow;
  options: ReadonlyArray<{ id: StatId; label: string }>;
  unitHint?: string;
  dead: boolean;
  onKind: (id: StatId) => void;
  onStart: (v: number | null) => void;
  onMin: (v: number | null) => void;
  onRemove: () => void;
}) {
  const kind = statKind(row.id);
  return (
    <>
      <span className="inset flex min-w-0 items-center px-1.5 py-1">
        <select
          aria-label="능력치 종류"
          className="w-full min-w-0 bg-transparent text-[12px] text-ink-1 outline-none"
          value={row.id}
          onChange={(e) => onKind(e.target.value as StatId)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id} className="bg-surface-2">
              {o.label}
            </option>
          ))}
        </select>
      </span>
      <MiniNumber
        label={`${kind.label} 지금 수치`}
        value={row.start}
        onChange={onStart}
        warn={dead}
        title={unitHint}
      />
      <MiniNumber
        label={`${kind.label} 원하는 최소`}
        value={row.min}
        onChange={onMin}
        placeholder="—"
        title={unitHint}
      />
      <button
        type="button"
        aria-label={`${kind.label} 빼기`}
        className="text-ink-3 hover:text-accent"
        onClick={onRemove}
      >
        ×
      </button>
    </>
  );
}

function MiniNumber({
  label,
  value,
  onChange,
  placeholder,
  warn = false,
  title,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  warn?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`inset flex items-center px-1.5 py-1 ${warn ? 'border-[color:var(--warn)]' : ''}`}
      title={title}
    >
      <input
        type="number"
        aria-label={label}
        className="w-full min-w-0 bg-transparent text-right text-[12px] text-ink-1 outline-none placeholder:text-ink-3"
        value={value ?? ''}
        placeholder={placeholder}
        min={0}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Math.max(0, Number(raw)));
        }}
      />
    </span>
  );
}

/**
 * 성공 시 능력치 하나의 변화량 분포.
 *
 * 블로그 값은 유저 측정치일 뿐이라, 이 표가 이 도구에서 가장 "가정"인 부분이다. 막대를
 * 같이 그려서 무엇을 가정하고 있는지 한눈에 보이게 했다. 합이 100 이 아니어도 비율로 쓴다.
 */
function DeltaEditor({ deltas, onChange }: { deltas: number[]; onChange: (d: number[]) => void }) {
  const total = deltas.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const max = Math.max(...deltas, 1e-9);
  const mean = total > 0 ? DELTA_VALUES.reduce((a, v, i) => a + v * Math.max(0, deltas[i]), 0) / total : 0;
  const isDefault = deltas.every((d, i) => d === DEFAULT_DELTAS[i]);

  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-ink-3">
        <span>성공 시 능력치마다 따로 굴림</span>
        <span className="tabular">
          합 <b className={Math.abs(total - 100) < 0.05 ? 'text-ink-2' : 'text-[color:var(--warn)]'}>{total.toFixed(2)}%</b>
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {DELTA_VALUES.map((v, i) => (
          <li key={v} className="grid grid-cols-[2rem_4.5rem_1fr] items-center gap-2 text-[11px]">
            <span className="tabular text-right text-ink-2">{v > 0 ? `+${v}` : v}</span>
            <span className="inset flex items-center px-1.5 py-0.5">
              <input
                type="number"
                aria-label={`변화량 ${v} 확률 (%)`}
                className="w-full min-w-0 bg-transparent text-right text-ink-1 outline-none"
                value={Number.isFinite(deltas[i]) ? deltas[i] : ''}
                min={0}
                step={0.01}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = deltas.slice();
                  next[i] = raw === '' ? 0 : Math.max(0, Number(raw));
                  onChange(next);
                }}
              />
            </span>
            <span className="h-2.5">
              <span
                className="block h-full rounded-r-[2px]"
                style={{
                  width: `${(Math.max(0, deltas[i]) / max) * 100}%`,
                  background: v < 0 ? 'var(--series-stop)' : v > 0 ? 'var(--chaos)' : 'var(--ink-3)',
                }}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-3">
        <span className="tabular">
          성공 1회 평균 {mean >= 0 ? '+' : ''}
          {mean.toFixed(3)}
        </span>
        <button
          type="button"
          disabled={isDefault}
          className="inset px-2 py-0.5 text-ink-2 enabled:hover:text-ink-1 disabled:opacity-40"
          onClick={() => onChange(DEFAULT_DELTAS.slice())}
        >
          블로그 값으로
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        기본값은{' '}
        <a
          className="underline decoration-dotted hover:text-ink-2"
          href="https://velog.io/@darkpppet/%EB%A9%94%EC%9D%B4%ED%94%8C-%ED%98%BC%EB%8F%88%EC%9D%98-%EC%A3%BC%EB%AC%B8%EC%84%9C-%ED%99%95%EB%A5%A0"
          target="_blank"
          rel="noreferrer"
        >
          유저들이 정리한 측정치
        </a>
        입니다. 메이플랜드의 실제 확률은 알려지지 않았으니 바꿔 가며 결과가 얼마나 흔들리는지
        보세요. 최대 HP·MP 는 이 값의 10배씩 움직입니다.
      </p>
    </div>
  );
}

/** 저장된 입력을 지운다. 실수로 날리지 않게 두 번 누르게 했다. */
function ResetButton({ onReset }: { onReset: () => void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`inset shrink-0 px-2 py-1 ${
        armed ? 'text-[color:var(--warn)]' : 'text-ink-2 hover:text-ink-1'
      }`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onReset();
      }}
    >
      {armed ? '정말 지울까요?' : '입력 초기화'}
    </button>
  );
}
