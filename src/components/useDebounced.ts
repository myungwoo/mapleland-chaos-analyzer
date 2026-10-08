'use client';

import { useEffect, useState } from 'react';

/**
 * 값이 잠잠해질 때까지 기다렸다가 넘겨준다.
 *
 * 입력칸 자체는 즉시 반응해야 하므로 상태는 그대로 두고, **무거운 계산에 넣는 값만**
 * 늦춘다. 이게 없으면 글자를 칠 때마다 전체 분석이 다시 돌아 입력이 끊긴다.
 *
 * 첫 값은 기다리지 않는다 — 화면이 처음부터 비어 있으면 안 된다.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, settled]);

  return settled;
}
