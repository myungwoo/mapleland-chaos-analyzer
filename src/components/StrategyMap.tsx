'use client';

import { useState } from 'react';
import {
  ACT_CONTINUE,
  ACT_GOAL,
  flatIndex,
  type Analysis,
  type ItemSolution,
} from '@/lib/chaos';
import { formatMeso, formatPercent } from '@/lib/format';
import { Panel } from './ui';

/** 칸 하나의 판정. 색은 보조이고 문자 라벨이 정체를 나른다. */
interface Cell {
  u: number;
  r: number[];
  values: number[];
  kind: 'go' | 'stop' | 'done' | 'none';
  success: number;
  remaining: number;
}

const LOOK = {
  go: { label: '혼', name: '혼줌 바르기', color: 'var(--series-go)', ink: '#14060c' },
  stop: { label: '손', name: '손절', color: 'var(--series-stop)', ink: '#0a0f1c' },
  done: { label: '✓', name: '달성', color: 'var(--series-done)', ink: 'var(--ink-1)' },
  none: { label: '', name: '닿지 않음', color: '#0e0c13', ink: 'transparent' },
} as const;

function valueOf(item: ItemSolution, i: number, r: number) {
  const a = item.axes[i];
  return a.start + a.step * (r + a.need);
}

function cellAt(item: ItemSolution, u: number, r: number[]): Cell {
  const layer = item.layers[u];
  const values = r.map((ri, i) => valueOf(item, i, ri));
  for (let i = 0; i < r.length; i++) {
    if (r[i] < layer.reachLo[i] || r[i] > layer.reachHi[i]) {
      return { u, r, values, kind: 'none', success: 0, remaining: 0 };
    }
  }
  const idx = flatIndex(layer, r);
  const act = layer.act[idx];
  const kind = act === ACT_GOAL ? 'done' : act === ACT_CONTINUE ? 'go' : 'stop';
  return {
    u,
    r,
    values,
    kind,
    success: kind === 'stop' ? 0 : layer.Q[idx],
    remaining: kind === 'done' ? 0 : layer.J[idx],
  };
}

export function StrategyMap({
  analysis,
  onPick,
}: {
  analysis: Analysis;
  /** 칸을 누르면 판정기로 보낸다 (남은 업횟, 목표 능력치 수치들) */
  onPick: (slots: number, values: number[]) => void;
}) {
  const { item } = analysis.solution;
  const [hover, setHover] = useState<Cell | null>(null);

  return (
    <Panel
      title="손절 지도"
      hint={item.axes.length === 1 ? '세로: 남은 업횟 · 가로: 지금 수치' : '남은 업횟을 고르면 그때의 판정'}
      right={<Legend />}
    >
      {item.axes.length === 1 ? (
        <SingleMap item={item} onHover={setHover} onPick={onPick} />
      ) : (
        <MultiMap item={item} onHover={setHover} onPick={onPick} />
      )}
      <div className="mt-2 flex min-h-[34px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px]">
        {hover ? (
          <>
            <span className="text-ink-2">
              남은 <b className="tabular text-ink-1">{hover.u}회</b> ·{' '}
              {item.axes.map((a, i) => (
                <span key={a.label} className="mr-1">
                  {a.label} <b className="tabular text-ink-1">{hover.values[i]}</b>
                </span>
              ))}
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="inline-block size-2.5" style={{ background: LOOK[hover.kind].color }} />
              <b className="text-ink-1">{LOOK[hover.kind].name}</b>
            </span>
            {hover.kind === 'go' && (
              <>
                <span className="tabular text-ink-3">이 아이템으로 달성 {formatPercent(hover.success)}</span>
                <span className="tabular text-ink-3">남은 기대비용 {formatMeso(hover.remaining)}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-ink-3">
            칸에 커서를 올리면 상세가 보이고, 누르면 아래 판정기에 들어갑니다. 빨간 테두리가
            출발 지점입니다.
          </span>
        )}
      </div>
    </Panel>
  );
}

function CellButton({
  cell,
  isStart,
  onHover,
  onPick,
  ariaLabel,
}: {
  cell: Cell;
  isStart: boolean;
  onHover: (c: Cell | null) => void;
  onPick: (slots: number, values: number[]) => void;
  ariaLabel: string;
}) {
  const look = LOOK[cell.kind];
  if (cell.kind === 'none') return <span className="block h-6 min-w-6" style={{ background: look.color }} />;
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(cell)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(cell)}
      onBlur={() => onHover(null)}
      onClick={() => onPick(cell.u, cell.values)}
      style={{ background: look.color, color: look.ink }}
      className={`flex h-6 w-full min-w-6 items-center justify-center text-[10px] leading-none ${
        isStart ? 'outline outline-2 outline-offset-[-2px] outline-[color:var(--chaos-ink)]' : ''
      }`}
      aria-label={ariaLabel}
    >
      {look.label}
    </button>
  );
}

/** 목표 능력치가 하나면 업횟 × 수치 전체를 한 장에 그린다. */
function SingleMap({
  item,
  onHover,
  onPick,
}: {
  item: ItemSolution;
  onHover: (c: Cell | null) => void;
  onPick: (slots: number, values: number[]) => void;
}) {
  const a = item.axes[0];
  const U = item.slots;
  let lo = 0;
  for (const layer of item.layers) lo = Math.min(lo, Math.max(layer.reachLo[0], a.deadR + 1));
  const columns: number[] = [];
  for (let r = lo; r <= 0; r++) columns.push(r);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th className="w-10" />
            {columns.map((r) => (
              <th key={r} className="tabular pb-1 font-normal text-ink-3">
                {valueOf(item, 0, r)}
                {r === 0 ? '+' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: U + 1 }, (_, k) => U - k).map((u) => (
            <tr key={u}>
              <th className="tabular pr-1 text-right font-normal text-ink-3">{u}회</th>
              {columns.map((r) => {
                const cell = cellAt(item, u, [r]);
                return (
                  <td key={r} className="p-0">
                    <CellButton
                      cell={cell}
                      isStart={u === U && r === a.r0}
                      onHover={onHover}
                      onPick={onPick}
                      ariaLabel={`남은 ${u}회, ${a.label} ${cell.values[0]}: ${LOOK[cell.kind].name}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 목표 능력치가 둘 이상이면 남은 업횟 하나를 골라 두 축의 단면을 그린다.
 * 셋째 축부터는 값 하나에 고정한다 (기본은 목표값 — 그 능력치는 만족한 상태).
 */
function MultiMap({
  item,
  onHover,
  onPick,
}: {
  item: ItemSolution;
  onHover: (c: Cell | null) => void;
  onPick: (slots: number, values: number[]) => void;
}) {
  const U = item.slots;
  const k = item.axes.length;
  const [u, setU] = useState(Math.max(0, U - 1));
  const [xAxis, setXAxis] = useState(0);
  const [yAxis, setYAxis] = useState(1);
  const [fixed, setFixed] = useState<Record<number, number>>({});
  const uu = Math.min(u, U);
  const layer = item.layers[uu];

  const rangeOf = (i: number) => {
    const a = item.axes[i];
    const lo = Math.max(layer.reachLo[i], a.deadR + 1);
    const hi = Math.min(layer.reachHi[i], layer.safe[i]);
    const out: number[] = [];
    for (let r = lo; r <= hi; r++) out.push(r);
    return out;
  };

  const others = item.axes.map((_, i) => i).filter((i) => i !== xAxis && i !== yAxis);

  const rFor = (rx: number, ry: number) =>
    item.axes.map((_, i) => {
      if (i === xAxis) return rx;
      if (i === yAxis) return ry;
      const opts = rangeOf(i);
      const want = fixed[i] ?? 0;
      return opts.length ? Math.max(opts[0], Math.min(opts[opts.length - 1], want)) : want;
    });

  // 위쪽 끝에서 바로 옆과 판정이 똑같은 줄·칸은 접는다. 그 위는 전부 같은 판정이므로
  // 남은 마지막 줄에 "N+" 를 붙이면 정보가 하나도 줄지 않는다.
  const kindAt = (rx: number, ry: number) => cellAt(item, uu, rFor(rx, ry)).kind;
  let xs = rangeOf(xAxis);
  let ys = rangeOf(yAxis);
  const fold = { x: xs[xs.length - 1], y: ys[ys.length - 1] };
  const sameCol = (a: number, b: number) => ys.every((ry) => kindAt(a, ry) === kindAt(b, ry));
  while (xs.length > 1 && xs[xs.length - 1] > 0 && sameCol(xs[xs.length - 1], xs[xs.length - 2])) {
    xs = xs.slice(0, -1);
  }
  const sameRow = (a: number, b: number) => xs.every((rx) => kindAt(rx, a) === kindAt(rx, b));
  while (ys.length > 1 && ys[ys.length - 1] > 0 && sameRow(ys[ys.length - 1], ys[ys.length - 2])) {
    ys = ys.slice(0, -1);
  }
  ys = ys.slice().reverse();

  const label = (i: number, r: number) => {
    const top = i === xAxis ? xs[xs.length - 1] : i === yAxis ? ys[0] : layer.safe[i];
    const folded = (i === xAxis ? fold.x : i === yAxis ? fold.y : layer.safe[i]) > r;
    return `${valueOf(item, i, r)}${r === top && (folded || (r > 0 && r === layer.safe[i])) ? '+' : ''}`;
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-ink-3">남은 업횟</span>
          {Array.from({ length: U + 1 }, (_, i) => U - i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setU(n)}
              className={`inset tabular min-w-7 px-1.5 py-0.5 ${n === uu ? 'text-accent outline outline-1 outline-[color:var(--chaos)]' : 'text-ink-2 hover:text-ink-1'}`}
            >
              {n}
            </button>
          ))}
        </div>
        {k > 2 && (
          <div className="flex flex-wrap items-center gap-2">
            <AxisSelect label="가로" axes={item.axes} value={xAxis} onChange={(v) => {
              if (v === yAxis) setYAxis(xAxis);
              setXAxis(v);
            }} />
            <AxisSelect label="세로" axes={item.axes} value={yAxis} onChange={(v) => {
              if (v === xAxis) setXAxis(yAxis);
              setYAxis(v);
            }} />
            {others.map((i) => {
              const opts = rangeOf(i);
              const cur = rFor(xs[0] ?? 0, ys[0] ?? 0)[i];
              return (
                <label key={i} className="flex items-center gap-1">
                  <span className="text-ink-3">{item.axes[i].label} 고정</span>
                  <span className="inset px-1 py-0.5">
                    <select
                      className="bg-transparent text-ink-1 outline-none"
                      value={cur}
                      onChange={(e) => setFixed({ ...fixed, [i]: Number(e.target.value) })}
                    >
                      {opts.map((r) => (
                        <option key={r} value={r} className="bg-surface-2">
                          {label(i, r)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {xs.length === 0 || ys.length === 0 ? (
        <p className="text-[12px] text-ink-3">이 업횟에서는 가망 있는 상태가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[2px] text-[11px]">
            <thead>
              <tr>
                <th className="pr-1 text-right text-[10px] font-normal text-ink-3">
                  {item.axes[yAxis].label} ↓ / {item.axes[xAxis].label} →
                </th>
                {xs.map((rx) => (
                  <th
                    key={rx}
                    className={`tabular min-w-6 pb-1 font-normal ${rx === 0 ? 'text-accent' : 'text-ink-3'}`}
                  >
                    {label(xAxis, rx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ys.map((ry) => (
                <tr key={ry}>
                  <th
                    className={`tabular pr-1 text-right font-normal ${ry === 0 ? 'text-accent' : 'text-ink-3'}`}
                  >
                    {label(yAxis, ry)}
                  </th>
                  {xs.map((rx) => {
                    const r = rFor(rx, ry);
                    const cell = cellAt(item, uu, r);
                    const isStart = uu === U && r.every((ri, i) => ri === item.axes[i].r0);
                    return (
                      <td key={rx} className="p-0">
                        <CellButton
                          cell={cell}
                          isStart={isStart}
                          onHover={onHover}
                          onPick={onPick}
                          ariaLabel={`남은 ${uu}회, ${item.axes.map((a, i) => `${a.label} ${cell.values[i]}`).join(', ')}: ${LOOK[cell.kind].name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        빨간 숫자가 원하는 최소값입니다. 맨 위·맨 오른쪽의 <b className="text-ink-2">N+</b> 는
        그 위로 판정이 전부 같아서 한 줄로 접은 것입니다.
      </p>
    </div>
  );
}

function AxisSelect({
  label,
  axes,
  value,
  onChange,
}: {
  label: string;
  axes: ItemSolution['axes'];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-ink-3">{label}</span>
      <span className="inset px-1 py-0.5">
        <select
          className="bg-transparent text-ink-1 outline-none"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {axes.map((a, i) => (
            <option key={a.label} value={i} className="bg-surface-2">
              {a.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function Legend() {
  return (
    <ul className="flex shrink-0 items-center gap-2 text-[10px] text-ink-2">
      {(['go', 'stop', 'done'] as const).map((k) => (
        <li key={k} className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-flex size-3 items-center justify-center text-[8px]"
            style={{ background: LOOK[k].color, color: LOOK[k].ink }}
          >
            {LOOK[k].label}
          </span>
          {LOOK[k].name}
        </li>
      ))}
    </ul>
  );
}
