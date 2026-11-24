// 개인정보 감지 규칙(F-07) 목데이터. VITE_USE_MOCK=true 일 때 src/api/privacy.js 가 대신 호출한다.
// GET /api/privacy-rules 응답을 그대로 옮겼다 (서버 backend/app/privacy.py _PATTERNS, main cf77266 기준).
// 서버 규칙이 바뀌면 이 목록도 같이 고친다. 감지·결정은 utils/privacyDetect.js 가 브라우저에서 한다.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// String.raw 로 두어 서버 JSON 의 pattern 문자열과 글자 하나까지 같게 한다
const RULES = [
  { kind: 'resident_no', pattern: String.raw`(?<!\d)\d{6}\s*-?\s*[1-490]\d{6}(?!\d)` },
  { kind: 'alien_no', pattern: String.raw`(?<!\d)\d{6}\s*-?\s*[5-8]\d{6}(?!\d)` },
  { kind: 'email', pattern: String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` },
  { kind: 'email', pattern: String.raw`[A-Za-z0-9._%+-]*\s?@\s?[A-Za-z0-9._-]*(?:\s(?:com|net|org|kr|vn|co\.kr)\b)?` },
  { kind: 'phone', pattern: String.raw`(?<![\d+])(?:\+82[\s-]*0?|0)(?:1[016789]|[2-6]\d?|70)\s*[-.)]?\s*\d{3,4}\s*[-.]?\s*\d{4}(?!\d)` },
  { kind: 'address', pattern: String.raw`(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s+)*[가-힣0-9]+(?:로|길|동|읍|면|리)\s*\d+(?:번길\s*\d+)?(?:-\d+)?(?:\s*번지)?(?!\d)(?!\s*(?:번(?!지)|개|명|원|회|시|분|일|월|년|세|살|%))` },
  { kind: 'long_number', pattern: String.raw`(?<!\d)\d(?:[\d\s-]{8,}\d)(?!\d)` },
]

export async function getPrivacyRules() {
  await delay(200)
  return { rules: RULES.map((r) => ({ ...r })) }
}
