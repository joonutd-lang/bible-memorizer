// NOTE:
// Next.js 16 + next-intl 미들웨어가 Vercel Edge 환경에서
// 간헐적으로 500 (MIDDLEWARE_INVOCATION_FAILED)을 내고 있어서
// 우선 런타임 에러를 막기 위해 미들웨어를 비활성화합니다.
// 기본 로케일은 "ko"이며, 서버 측에서 i18n 설정은 그대로 동작합니다.

export function middleware() {
  // no-op middleware – just let the request pass through
}

export const config = {
  matcher: [],
};

