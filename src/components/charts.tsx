'use client';

import { useRef, useState } from 'react';
import { formatMeso, formatPercent } from '@/lib/format';

/*
 * viewBox 를 실제로 그려지는 폭에 맞춰 둔다.
 *
 * SVG 는 w-full 로 늘어나므로 좌표계가 렌더 폭보다 좁으면 그 비율만큼 글자와 선이 함께
 * 확대된다. 반 폭 패널을 전체 폭으로 합치면서 배율이 2배가 되어 차트만 동떨어져 보였다.
 * 결과 칸의 통상 폭(약 1000px)에 맞추면 배율이 1 근처라 주변 글자 크기와 맞는다.
 */
const W = 1000;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 56 };

export interface CurveMarker {
  x: number;
  label: string;
}

export interface CurveSeries {
  label: string;
  /** 0..1 확률 배열. 인덱스 i 는 금액 i*step 에 대응한다. */
  values: Float64Array;
  step: number;
  color: string;
}

/**
 * 금액 → 달성 확률 곡선. 여러 계열을 겹쳐 그릴 수 있다.
 *
 * 겹쳐 그리는 이유가 있다. "최소비용 전략을 그대로 따를 때"와 "그 예산에 맞춰 다시
 * 최적화할 때"는 축의 의미가 완전히 같고 전략만 다르다. 따로 그리면 같은 그림 두 장으로
 * 보이지만, 포개 놓으면 둘 사이의 간격이 곧 재최적화의 값어치가 된다.
 *
 * 계열마다 step 이 달라 격자가 어긋나므로, 공통 x 범위를 잡고 각자에서 다시 읽어 온다.
 */
export function ProbabilityCurve({
  series,
  xLabel,
  markers = [],
}: {
  series: CurveSeries[];
  xLabel: string;
  markers?: CurveMarker[];
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const usable = markers.filter((m) => Number.isFinite(m.x));
  const live = series.filter((s) => s.values.length > 1 && Number.isFinite(s.step) && s.step > 0);

  const maxSpend = Math.max(
    1,
    ...live.map((s) => lastMeaningfulIndex(s.values) * s.step),
    ...usable.map((m) => m.x),
  );

  const sx = (spend: number) => PAD.left + (spend / maxSpend) * (W - PAD.left - PAD.right);
  const sy = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);
  const readAt = (s: CurveSeries, spend: number) =>
    s.values[Math.max(0, Math.min(s.values.length - 1, Math.round(spend / s.step)))];

  // 계열마다 정의된 구간이 다르다 (예산 곡선은 그 예산까지만 존재한다). 자기 구간을
  // 넘어서까지 그리면 마지막 값이 평평하게 이어져, 위에 있어야 할 선이 아래로 보인다.
  const domainOf = (s: CurveSeries) => (s.values.length - 1) * s.step;

  const SAMPLES = 200;
  const paths = live.map((s) => {
    const end = Math.min(maxSpend, domainOf(s));
    let d = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const spend = (i / SAMPLES) * end;
      d += `${i === 0 ? 'M' : 'L'}${sx(spend).toFixed(1)},${sy(readAt(s, spend)).toFixed(1)}`;
    }
    return { series: s, d, end };
  });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const spend = ((ratio * W - PAD.left) / (W - PAD.left - PAD.right)) * maxSpend;
    setHoverX(Math.max(0, Math.min(maxSpend, spend)));
  };

  return (
    <figure className="m-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${xLabel}별 달성 확률 곡선`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(p)}
              y2={sy(p)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={sy(p) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
              {p * 100}%
            </text>
          </g>
        ))}

        {usable.map((m, i) => {
          const x = sx(m.x);
          const nearRight = x > W - PAD.right - 110;
          return (
            <g key={m.label}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--ink-3)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={nearRight ? x - 4 : x + 4}
                y={PAD.top + 11 + i * 14}
                textAnchor={nearRight ? 'end' : 'start'}
                fontSize={11}
                fill="var(--ink-2)"
              >
                {m.label} {formatMeso(m.x)}
              </text>
            </g>
          );
        })}

        {paths.map(({ series: s, d }) => (
          <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
        ))}

        {hoverX !== null && (
          <g>
            <line
              x1={sx(hoverX)}
              x2={sx(hoverX)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--ink-2)"
              strokeWidth={1}
            />
            {live
              .filter((s) => hoverX <= domainOf(s))
              .map((s) => (
                <circle
                  key={s.label}
                  cx={sx(hoverX)}
                  cy={sy(readAt(s, hoverX))}
                  r={5}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ))}
          </g>
        )}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />
        {[0, 0.5, 1].map((f) => (
          <text
            key={f}
            x={sx(maxSpend * f)}
            y={H - 10}
            textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--ink-3)"
          >
            {f === 0 ? '0' : formatMeso(maxSpend * f)}
          </text>
        ))}
      </svg>

      <figcaption className="mt-1 flex min-h-[16px] flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
        <span>{xLabel}</span>
        {hoverX !== null && (
          <>
            <span className="tabular text-ink-1">{formatMeso(hoverX)}</span>
            {live
              .filter((s) => hoverX <= domainOf(s))
              .map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block size-2"
                    style={{ background: s.color }}
                  />
                  <span className="tabular text-ink-1">{formatPercent(readAt(s, hoverX))}</span>
                </span>
              ))}
          </>
        )}
      </figcaption>
    </figure>
  );
}

function lastMeaningfulIndex(values: Float64Array): number {
  const target = values[values.length - 1] * 0.999;
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= target) return Math.max(1, i);
  }
  return values.length - 1;
}

/** 가로 막대 목록. 값이 하나의 척도를 공유할 때만 쓴다. */
export function BarList({
  rows,
  format = formatMeso,
  color = 'var(--chaos)',
  highlight,
}: {
  rows: Array<{ label: string; value: number; note?: string }>;
  format?: (v: number) => string;
  color?: string;
  highlight?: string;
}) {
  const finite = rows.filter((r) => Number.isFinite(r.value));
  const max = Math.max(1, ...finite.map((r) => r.value));

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const isBest = row.label === highlight;
        const width = Number.isFinite(row.value) ? (row.value / max) * 100 : 0;
        return (
          <li key={row.label} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2">
            <span className={`truncate text-[11px] ${isBest ? 'text-accent' : 'text-ink-2'}`}>
              {row.label}
            </span>
            <span className="inset h-4 overflow-hidden">
              <span
                className="block h-full rounded-r-[3px]"
                style={{
                  width: `${width}%`,
                  background: isBest ? 'var(--chaos)' : color,
                }}
              />
            </span>
            <span className="tabular text-right text-[11px] text-ink-1">
              {Number.isFinite(row.value) ? format(row.value) : '불가능'}
              {row.note && <span className="ml-1 text-ink-3">{row.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 세로 막대 분포. 가로축이 수치(순서가 있는 값)라 BarList 대신 이걸 쓴다.
 * `threshold` 이상인 막대는 강조색, 아래는 차분한 색 — 목표선 기준으로 갈린다.
 */
export function Histogram({
  rows,
  threshold,
  label,
  formatValue = (v) => String(v),
}: {
  rows: Array<{ value: number; probability: number }>;
  threshold?: number;
  label: string;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1e-12, ...rows.map((r) => r.probability));
  const shown = hover !== null ? rows[hover] : null;
  const above =
    threshold === undefined
      ? null
      : rows.filter((r) => r.value >= threshold).reduce((a, r) => a + r.probability, 0);

  return (
    <figure className="m-0">
      <div className="flex h-20 items-end gap-[2px]" role="img" aria-label={`${label} 분포`}>
        {rows.map((r, i) => {
          const hit = threshold !== undefined && r.value >= threshold;
          return (
            <span
              key={r.value}
              className="flex h-full min-w-[3px] flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="block w-full rounded-t-[2px]"
                style={{
                  height: `${Math.max(1, (r.probability / max) * 100)}%`,
                  background: hit ? 'var(--chaos)' : 'var(--line-strong)',
                  outline: hover === i ? '1px solid var(--ink-1)' : undefined,
                }}
              />
            </span>
          );
        })}
      </div>
      <figcaption className="mt-1 flex min-h-[16px] items-center justify-between gap-2 text-[11px] text-ink-3">
        <span className="tabular">
          {formatValue(rows[0]?.value ?? 0)} ~ {formatValue(rows[rows.length - 1]?.value ?? 0)}
        </span>
        {shown ? (
          <span className="tabular text-ink-1">
            {formatValue(shown.value)} · {formatPercent(shown.probability, 2)}
          </span>
        ) : (
          above !== null && (
            <span className="tabular">
              {formatValue(threshold!)} 이상 <b className="text-accent">{formatPercent(above)}</b>
            </span>
          )
        )}
      </figcaption>
    </figure>
  );
}
