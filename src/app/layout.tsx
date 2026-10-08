import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '메이플랜드 혼돈의 주문서 분석기',
  description:
    '혼돈의 주문서로 원하는 능력치를 만드는 최소 기대비용 전략과 손절 시점, 필요한 아이템·주문서 수를 계산합니다.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full">
      <head>
        {/* Galmuri — 오픈소스 한글 픽셀 폰트 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/galmuri.css"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
