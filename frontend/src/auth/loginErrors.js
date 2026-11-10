// 로그인 오류 코드 → 문구. 코드 → 문구는 이 표 한 곳에서만 고른다.
// GOOGLE_*: LOGIN-API.md 항목 2 실패 응답(/?login_error=<코드>), LOGIN_NOT_CONFIGURED: 로그인 시작(항목 1)의 500 응답.
export const LOGIN_ERROR_MESSAGES = {
  GOOGLE_LOGIN_CANCELED: '로그인을 취소했어요.',
  GOOGLE_EMAIL_NOT_VERIFIED: '이메일 인증이 안 된 구글 계정이에요.',
  GOOGLE_LOGIN_FAILED: '로그인 중 문제가 생겼어요. 다시 시도해 주세요.',
  LOGIN_NOT_CONFIGURED: '로그인 설정이 아직 안 된 서버예요. 관리자에게 알려 주세요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}

export const loginErrorText = (e) => LOGIN_ERROR_MESSAGES[e?.code] ?? LOGIN_ERROR_MESSAGES.GOOGLE_LOGIN_FAILED
