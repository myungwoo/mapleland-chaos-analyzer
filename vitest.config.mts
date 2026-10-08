import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 엔진 테스트는 상대경로만 써서 설정 없이도 돌았지만, 화면 쪽 모듈은 `@/` 별칭을 쓴다.
 * 그 별칭을 tsconfig 와 같은 뜻으로 맞춰 준다 (vitest 는 tsconfig paths 를 안 읽는다).
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
