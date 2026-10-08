'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_INPUTS,
  DELTA_VALUES,
  MAX_STATS,
  STAT_KINDS,
  type Inputs,
  type StatId,
  type StatRow,
} from './inputs';

/**
 * 입력값을 브라우저에 남긴다.
 *
 * ## 키에 접두어가 붙는 이유
 *
 * `mapleland.myungwoo.kr` 과 `myungwoo.github.io` 에서 이 앱은 다른 유틸들과 **오리진을
 * 공유한다.** localStorage 는 경로로 갈라지지 않아서, 접두어 없는 이름을 쓰면 옆 유틸의
 * 값을 조용히 덮어쓴다 (CLAUDE.md 참고).
 *
 * ## 저장한 값을 믿지 않는다
 *
 * 저장소에 든 것은 예전 판이 쓴 값일 수도, 사용자가 콘솔로 고친 값일 수도 있다. 읽을 때
 * 칸마다 검사해서 **이상한 칸만** 기본값으로 되돌린다.
 */
const KEY = 'ml:chaos:state';

/** 저장 포맷 판 번호. 구조가 바뀌면 올린다 — 모르는 판은 통째로 버리고 기본값으로 연다. */
const VERSION = 1;

const SAVE_DELAY_MS = 400;

/** "현재 상황" 판정기에 손으로 넣는 값. 지금 들고 있는 아이템의 진행이다. */
export interface Progress {
  /** 남은 업횟. null 이면 아이템을 막 산 상태로 본다. */
  slots: number | null;
  /** 능력치별 지금 수치. 없는 키는 시작 수치로 본다. */
  values: Partial<Record<StatId, number>>;
}

export interface SavedState {
  inputs: Inputs;
  progress: Progress;
}

export const DEFAULT_PROGRESS: Progress = { slots: null, values: {} };
export const DEFAULT_STATE: SavedState = { inputs: DEFAULT_INPUTS, progress: DEFAULT_PROGRESS };

/* ── 검사기 ─────────────────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 비워 둘 수 있는 0 이상의 칸. 음수·NaN 은 "안 적음"으로 본다. */
function optional(value: unknown, max = Infinity): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(max, value)
    : null;
}

const STAT_IDS = new Set<string>(STAT_KINDS.map((s) => s.id));

/**
 * 능력치 목록. 빈 배열도 사용자의 선택이라 그대로 둔다 (화면이 "입력이 더 필요합니다"로
 * 바뀐다). 배열이 아닐 때만 기본값을 쓴다. 같은 능력치가 두 번 나오면 앞의 것만 남긴다.
 */
function readStats(value: unknown): StatRow[] {
  if (!Array.isArray(value)) return DEFAULT_INPUTS.stats;
  const seen = new Set<string>();
  const out: StatRow[] = [];
  for (const row of value.slice(0, MAX_STATS)) {
    if (!isRecord(row) || typeof row.id !== 'string' || !STAT_IDS.has(row.id)) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id as StatId,
      start: optional(row.start, 9999),
      min: optional(row.min, 9999),
    });
  }
  return out;
}

/** 변화량 확률. 길이가 다르거나 전부 0 이면 분포가 아니므로 통째로 기본값. */
function readDeltas(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== DELTA_VALUES.length) return DEFAULT_INPUTS.deltas;
  const out = value.map((v) => num(v, 0, 0, 100));
  return out.some((v) => v > 0) ? out : DEFAULT_INPUTS.deltas;
}

export function sanitizeInputs(value: unknown): Inputs {
  const base = DEFAULT_INPUTS;
  if (!isRecord(value)) return base;
  return {
    itemName: typeof value.itemName === 'string' ? value.itemName.slice(0, 40) : base.itemName,
    slots: Math.round(num(value.slots, base.slots, 1, 20)),
    stats: readStats(value.stats),
    successRate: num(value.successRate, base.successRate, 0, 100),
    deltas: readDeltas(value.deltas),
    // 금액 칸은 비워 두는 것도 정상 상태라 null 을 기본값으로 되돌리지 않는다.
    itemPrice: 'itemPrice' in value ? optional(value.itemPrice) : base.itemPrice,
    scrollPrice: 'scrollPrice' in value ? optional(value.scrollPrice) : base.scrollPrice,
    salvage: 'salvage' in value ? optional(value.salvage) : base.salvage,
    finishedPrice: optional(value.finishedPrice),
    budget: optional(value.budget),
  };
}

export function sanitizeProgress(value: unknown, inputs: Inputs): Progress {
  if (!isRecord(value)) return DEFAULT_PROGRESS;
  const slots =
    typeof value.slots === 'number' && Number.isFinite(value.slots)
      ? Math.round(num(value.slots, 0, 0, inputs.slots))
      : null;
  const values: Partial<Record<StatId, number>> = {};
  if (isRecord(value.values)) {
    for (const [id, raw] of Object.entries(value.values)) {
      if (!STAT_IDS.has(id)) continue;
      const v = optional(raw, 9999);
      if (v !== null) values[id as StatId] = v;
    }
  }
  return { slots, values };
}

export function parseSaved(raw: string): SavedState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.v !== VERSION) return null;
  const inputs = sanitizeInputs(parsed.inputs);
  return { inputs, progress: sanitizeProgress(parsed.progress, inputs) };
}

export function serialize(state: SavedState): string {
  return JSON.stringify({ v: VERSION, inputs: state.inputs, progress: state.progress });
}

/* ── 저장소 ─────────────────────────────────────────────────────────────── */

// localStorage 는 있는데 못 쓰는 경우가 있다 (사파리 비공개 모드, 저장소 차단, 용량 초과).
// 저장은 부가 기능이라 실패해도 계산은 그대로 돌아가야 한다.

let cached: { state: SavedState | null } | null = null;

export function readState(): SavedState | null {
  if (typeof window === 'undefined') return null;
  if (cached) return cached.state;
  let state: SavedState | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? parseSaved(raw) : null;
  } catch {
    state = null;
  }
  cached = { state };
  return state;
}

export function writeState(state: SavedState): void {
  cached = { state };
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, serialize(state));
  } catch {
    /* 저장 못 해도 그만 */
  }
}

export function clearState(): void {
  cached = { state: null };
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 지우지 못해도 그만 */
  }
}

/* ── 훅 ─────────────────────────────────────────────────────────────────── */

const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * 화면 상태를 들고 있으면서 저장소와 맞춘다.
 *
 * 정적 내보내기라 HTML 에 기본값이 박혀 나온다. 첫 렌더에서 저장값을 읽으면 하이드레이션이
 * 깨지므로 `useSyncExternalStore` 로 서버 스냅샷 → 클라이언트 값 순서로 넘어간다.
 * 사용자가 손대기 전까지는 아무것도 쓰지 않아서 기본값이 저장값을 덮을 틈이 없다.
 */
export function usePersistedState() {
  const hydrated = useSyncExternalStore(subscribeNothing, onClient, onServer);
  const [edited, setEdited] = useState<SavedState | null>(null);
  const state = edited ?? (hydrated ? readState() : null) ?? DEFAULT_STATE;

  useEffect(() => {
    if (edited === null) return;
    const timer = setTimeout(() => writeState(edited), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [edited]);

  // 탭을 닫으면 위 타이머째 사라진다. 모바일은 beforeunload 가 안 올 때가 있어 pagehide 를 쓴다.
  const latest = useRef<SavedState | null>(null);
  useEffect(() => {
    latest.current = edited;
  }, [edited]);
  useEffect(() => {
    const flush = () => {
      if (latest.current) writeState(latest.current);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const update = useCallback((change: (prev: SavedState) => SavedState) => {
    setEdited((prev) => change(prev ?? readState() ?? DEFAULT_STATE));
  }, []);

  const setInputs = useCallback((inputs: Inputs) => update((prev) => ({ ...prev, inputs })), [update]);
  const setProgress = useCallback(
    (progress: Progress) => update((prev) => ({ ...prev, progress })),
    [update],
  );
  const reset = useCallback(() => {
    clearState();
    setEdited(DEFAULT_STATE);
  }, []);

  return { inputs: state.inputs, progress: state.progress, setInputs, setProgress, reset };
}
