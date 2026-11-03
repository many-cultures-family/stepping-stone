// FastAPI 서버 호출용 fetch 래퍼.
// 개발 중에는 vite.config.js 프록시가 /api 를 FastAPI로 넘긴다.
// LLM(Gemini) 호출은 프론트에서 하지 않는다. 항상 FastAPI를 거친다.

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

/** 서버 오류. code 는 docs/API.md 오류 코드 (예: FILE_TYPE_NOT_ALLOWED), 연결 실패는 NETWORK_ERROR */
export class ApiError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message)
    this.status = status
    this.code = code
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
    throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  }

  if (!res.ok) {
    let message = `요청 실패 (${res.status})`
    let code = null
    try {
      const data = await res.json()
      // 오류 형식: { "detail": { "code": ... } } (docs/API.md). FastAPI 기본 형식은 { "detail": "..." }
      if (typeof data.detail === 'string') message = data.detail
      else if (data.detail?.code) code = data.detail.code
    } catch {
      // 본문이 JSON이 아니면 기본 메시지 사용
    }
    // 서버가 꺼져 있으면 fetch는 성공하고 Vite proxy가 502를 돌려준다
    if (!code && [502, 503, 504].includes(res.status)) code = 'NETWORK_ERROR'
    throw new ApiError(message, { status: res.status, code })
  }

  return res.status === 204 ? null : res.json()
}
