'use client';

import type { ReactNode } from 'react';

export function Panel({
  title,
  hint,
  right,
  children,
  className = '',
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[13px] text-accent">{title}</h2>
          {hint && <span className="truncate text-[11px] text-ink-3">{hint}</span>}
        </div>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  min,
  max,
  step = 1,
  compact = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  compact?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
      <span className={`shrink-0 text-ink-2 ${compact ? 'w-12' : 'w-20'}`}>{label}</span>
      <span className="inset flex min-w-0 flex-1 items-center gap-1 px-2 py-1">
        <input
          type="number"
          aria-label={suffix ? `${label} (${suffix})` : label}
          className="w-full min-w-0 bg-transparent text-right text-ink-1 outline-none"
          value={value ?? ''}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
        />
        {suffix && <span className="shrink-0 text-ink-3">{suffix}</span>}
      </span>
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'accent' | 'warn';
}) {
  const color =
    tone === 'accent' ? 'text-accent' : tone === 'warn' ? 'text-[color:var(--warn)]' : 'text-ink-1';
  return (
    <div className="inset px-3 py-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`tabular mt-1 text-[18px] leading-tight ${color}`}>{value}</div>
      {sub && <div className="tabular mt-0.5 text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 border-l-2 border-[color:var(--warn)] bg-[#2a2417] px-3 py-2 text-[11px] leading-relaxed text-ink-2">
      <span aria-hidden className="text-[color:var(--warn)]">
        ⚠
      </span>
      <span>{children}</span>
    </div>
  );
}
