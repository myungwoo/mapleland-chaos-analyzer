import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, toProblem } from '../inputs';
import { DEFAULT_STATE, parseSaved, sanitizeInputs, sanitizeProgress, serialize } from '../storage';

describe('저장값 검사', () => {
  it('왕복하면 그대로다', () => {
    expect(parseSaved(serialize(DEFAULT_STATE))).toEqual(DEFAULT_STATE);
  });

  it('모르는 판·깨진 JSON 은 버린다', () => {
    expect(parseSaved('{"v":99,"inputs":{}}')).toBeNull();
    expect(parseSaved('{oops')).toBeNull();
  });

  it('이상한 칸만 기본값으로 되돌린다', () => {
    const got = sanitizeInputs({ ...DEFAULT_INPUTS, slots: 'x', successRate: NaN, scrollPrice: 250 });
    expect(got.slots).toBe(DEFAULT_INPUTS.slots);
    expect(got.successRate).toBe(DEFAULT_INPUTS.successRate);
    expect(got.scrollPrice).toBe(250);
    expect(got.stats).toEqual(DEFAULT_INPUTS.stats);
  });

  it('빈 값과 없는 값은 다르다', () => {
    const cleared = sanitizeInputs({ ...DEFAULT_INPUTS, itemPrice: null, stats: [] });
    expect(cleared.itemPrice).toBeNull();
    expect(cleared.stats).toEqual([]);
    const missing = sanitizeInputs({ slots: 5 });
    expect(missing.itemPrice).toBe(DEFAULT_INPUTS.itemPrice);
    expect(missing.stats).toEqual(DEFAULT_INPUTS.stats);
  });

  it('모르는 능력치와 중복을 걸러 낸다', () => {
    const got = sanitizeInputs({
      ...DEFAULT_INPUTS,
      stats: [
        { id: 'str', start: 3, min: 5 },
        { id: 'str', start: 9, min: 9 },
        { id: 'charm', start: 1, min: 1 },
        { id: 'hp', start: -4, min: 'a' },
      ],
    });
    expect(got.stats).toEqual([
      { id: 'str', start: 3, min: 5 },
      { id: 'hp', start: null, min: null },
    ]);
  });

  it('확률이 전부 0 이거나 길이가 다르면 기본 분포로', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, deltas: new Array(11).fill(0) }).deltas).toEqual(
      DEFAULT_INPUTS.deltas,
    );
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, deltas: [1, 2] }).deltas).toEqual(DEFAULT_INPUTS.deltas);
  });

  it('진행 상태의 업횟은 아이템 업횟을 넘지 않는다', () => {
    const p = sanitizeProgress({ slots: 99, values: { str: 4, nope: 3, dex: -1 } }, DEFAULT_INPUTS);
    expect(p).toEqual({ slots: DEFAULT_INPUTS.slots, values: { str: 4 } });
  });
});

describe('입력 → 문제', () => {
  it('기본값은 풀 수 있는 문제다', () => {
    const r = toProblem(DEFAULT_INPUTS);
    expect(r.ok).toBe(true);
  });

  it('회수가가 매물가 이상이면 거절한다', () => {
    const r = toProblem({ ...DEFAULT_INPUTS, itemPrice: 10, salvage: 10 });
    expect(r.ok).toBe(false);
  });

  it('최소값을 하나도 안 걸면 거절한다', () => {
    const r = toProblem({ ...DEFAULT_INPUTS, stats: DEFAULT_INPUTS.stats.map((s) => ({ ...s, min: null })) });
    expect(r.ok).toBe(false);
  });

  it('HP 는 10 단위로 들어간다', () => {
    const r = toProblem({ ...DEFAULT_INPUTS, stats: [{ id: 'hp', start: 50, min: 80 }] });
    expect(r.ok && r.problem.stats[0].step).toBe(10);
  });
});
