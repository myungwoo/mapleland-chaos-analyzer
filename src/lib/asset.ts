/**
 * GitHub Pages 프로젝트 페이지는 `/<repo>` 하위에 붙는다.
 *
 * 메타데이터 아이콘은 Next 가 basePath 를 알아서 붙여 주지만, `next/image` 는
 * `unoptimized: true` 일 때 src 를 그대로 내보낸다. 그래서 public/ 정적 파일을
 * 가리킬 때는 여기를 거쳐야 한다 — 안 그러면 로컬에선 멀쩡하고 배포본에서만 404 난다.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
