export const MAN = 10_000;
export const EOK = 100_000_000;

/** 메소를 게임에서 쓰는 단위(만/억)로 줄여 쓴다. */
export function formatMeso(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '불가능' : '—';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= EOK) return `${sign}${(v / EOK).toFixed(v >= 10 * EOK ? 1 : 2)}억`;
  if (v >= MAN) return `${sign}${Math.round(v / MAN).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(v).toLocaleString('ko-KR')}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** 정옵 대비 증가량을 "공+3" 처럼 쓴다. */
export function formatAttack(value: number): string {
  return value >= 0 ? `공+${value}` : `공${value}`;
}
