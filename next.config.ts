import type { NextConfig } from 'next';

/**
 * GitHub Pages 는 정적 호스팅이라 서버 기능을 쓸 수 없다. 이 앱은 계산이 전부
 * 브라우저에서 끝나므로 정적 내보내기로 충분하다.
 *
 * 프로젝트 페이지는 `/<repo>` 하위 경로에 붙으므로 basePath 를 CI 에서 주입한다.
 * 로컬 개발에서는 비워 두어 http://localhost:3000 그대로 뜬다.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  images: {
    // 정적 내보내기에는 이미지 최적화 서버가 없다.
    unoptimized: true,
  },
};

export default nextConfig;
