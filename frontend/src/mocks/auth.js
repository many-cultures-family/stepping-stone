// [임시] 로그인 화면만 먼저 만들기 위한 목데이터.
// API.md에 로그인 엔드포인트·응답 예시가 아직 없어(김우너우 담당, 오늘은 "없음"으로 결정됨),
// DATA-MODEL.md user 필드(google_sub, email, language)만 참고해 임시로 구성한 값이다.
// 실제 엔드포인트가 API.md에 정해지면 이 파일은 지우고 api/auth.js에서 실제 응답 모양에 맞춰 다시 쓴다.

import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// DATA-MODEL.md 시드 데이터 #2(test-sub-0001)를 본떠 만든 임시 사용자.
const MOCK_USER = {
  google_sub: 'test-sub-0001',
  email: 'tester@example.com',
  language: 'ko',
}

export async function loginWithGoogle() {
  await delay(500)
  // [임시] 실제로는 구글 OAuth 응답을 서버가 검증한 뒤 사용자 정보를 돌려준다.
  return { user: MOCK_USER }
}
