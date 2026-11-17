// FastAPI 서버 호출용 fetch 래퍼.
// 개발 중에는 vite.config.js 프록시가 /api 를 FastAPI로 넘긴다.
// LLM(Gemini) 호출은 프론트에서 하지 않는다. 항상 FastAPI를 거친다.

// true 면 작성 목록·업로드·입력 항목·사전 정보·답변 검토를 src/mocks 의 목데이터로 처리한다.
// 로그인(src/api/auth.js)은 목이 없고 항상 실서버(Google)를 쓴다.
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

/** 서버 오류. code 는 docs/API.md 오류 코드 (예: FILE_TYPE_NOT_ALLOWED), 연결 실패는 NETWORK_ERROR */
export class ApiError extends Error {
  constructor(message, { status = null, code = null, errors = null } = {}) {
    super(message)
    this.status = status
    this.code = code
    // FIELDS_INVALID 등에서 함께 오는 [{ field_id, code }]
    this.errors = errors
  }
}

export async function request(path, { body, ...options } = {}) {
  const isForm = body instanceof FormData
  let res
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: isForm ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
      body: isForm || body === undefined ? body : JSON.stringify(body),
    })
  } catch {
    // 서버가 꺼져 있거나 네트워크 오류 (DESIGN.md "오류" 상태: "서버 연결 실패")
    throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  }

  if (!res.ok) {
    let message = `요청 실패 (${res.status})`
    let code = null
    let errors = null
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') {
        // FastAPI 기본 에러 형식: { "detail": "..." }
        message = data.detail
      } else if (data.detail && typeof data.detail.code === 'string') {
        // API.md 오류 형식: { "detail": { "code": "..." } }
        code = data.detail.code
        message = code
        if (Array.isArray(data.detail.errors)) errors = data.detail.errors
      } else if (Array.isArray(data.errors)) {
        errors = data.errors
      }
    } catch {
      // 본문이 JSON이 아니면 기본 메시지 사용
    }
    // 서버가 꺼져 있으면 fetch 자체는 성공하고 Vite 프록시가 502 등을 돌려준다
    if (!code && [502, 503, 504].includes(res.status)) {
      code = 'NETWORK_ERROR'
      message = '서버 연결 실패'
    }
    throw new ApiError(message, { status: res.status, code, errors })
  }

  return res.status === 204 ? null : res.json()
}
