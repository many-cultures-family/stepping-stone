// 단어·문장 설명(F-05) 목데이터. VITE_USE_MOCK=true 일 때 src/api/explain.js 가 대신 호출한다.
// F-05 API 명세가 아직 없어서 응답 모양은 DATA-MODEL.md glossary_term · easy_explanation 을 옮긴 [제안]이다.
// - 용어는 목 입력 항목(mocks/fields.js)·서술형 질문(mocks/answers.js)에 나오는 말로 골랐다.
// - [검수 전] 베트남어(vi)·중국어(zh)·영어(en) 설명은 원어민 검수를 받지 않았다. 실제 용어 사전은 팀이 검증해 서버에 둔다 (R5).
// - 사용 언어는 실서버면 세션으로 알지만, 목은 세션이 없어서 화면이 language 인자로 알려 준다.
// 확인용 시나리오: '체류 목적'처럼 '목적'이 들어간 말은 첫 AI 풀이 요청이 LLM_CALL_FAILED 로 실패하고, 다시 시도하면 된다.
import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const MAX_LENGTH = 200

// term → 언어별 기본 설명 (glossary_term.explanation)
const TERMS = [
  {
    term: '보호자',
    ko: '아이를 돌보고 책임지는 사람이에요. 보통 엄마나 아빠예요.',
    vi: 'Người chăm sóc và chịu trách nhiệm cho trẻ, thường là bố hoặc mẹ.',
    zh: '照顾孩子并对孩子负责的人，通常是父母。',
    en: 'The person who looks after the child and is responsible for them, usually a parent.',
  },
  {
    term: '연락처',
    ko: '연락받을 수 있는 전화번호예요.',
    vi: 'Số điện thoại có thể liên lạc với bạn.',
    zh: '可以联系到您的电话号码。',
    en: 'A phone number where you can be reached.',
  },
  {
    term: '생년월일',
    ko: '태어난 해, 달, 날이에요.',
    vi: 'Năm, tháng, ngày sinh.',
    zh: '出生的年、月、日。',
    en: 'The year, month and day you were born.',
  },
  {
    term: '성명',
    ko: '이름이에요. 성과 이름을 모두 써요.',
    vi: 'Họ và tên. Viết đầy đủ cả họ và tên.',
    zh: '姓名。姓和名都要写。',
    en: 'Full name. Write both your family name and given name.',
  },
  {
    term: '영문',
    ko: '영어 알파벳으로 쓴 글자예요.',
    vi: 'Chữ viết bằng bảng chữ cái tiếng Anh.',
    zh: '用英文字母写的文字。',
    en: 'Text written in English letters.',
  },
  {
    term: '체류',
    ko: '한국에 머물러 사는 것이에요.',
    vi: 'Việc lưu trú, sinh sống tại Hàn Quốc.',
    zh: '在韩国居留、生活。',
    en: 'Staying and living in Korea.',
  },
  {
    term: '사유',
    ko: '이유예요. 왜 그런지 쓰는 거예요.',
    vi: 'Lý do. Viết vì sao bạn làm việc đó.',
    zh: '理由。写明为什么。',
    en: 'The reason. Write why.',
  },
  {
    term: '신청',
    ko: '무엇을 해 달라고 정식으로 요청하는 거예요.',
    vi: 'Đăng ký, chính thức yêu cầu một việc gì đó.',
    zh: '正式提出请求，申请。',
    en: 'Formally asking for something; applying.',
  },
  {
    term: '담당자',
    ko: '이 일을 맡아서 처리하는 사람이에요.',
    vi: 'Người phụ trách xử lý việc này.',
    zh: '负责处理这件事的人。',
    en: 'The person in charge of handling this.',
  },
  {
    term: '방과후학교',
    ko: '정규 수업이 끝난 뒤 학교에서 하는 수업이에요.',
    vi: 'Lớp học ở trường sau giờ học chính khóa.',
    zh: '正课结束后在学校开设的课程。',
    en: 'Classes held at school after regular lessons end.',
  },
  {
    term: '주소',
    ko: '사는 곳의 위치예요. 시·구·도로 이름과 번호를 써요.',
    vi: 'Nơi bạn sống. Viết tên thành phố, quận, đường và số nhà.',
    zh: '居住地点。写明市、区、道路名称和门牌号。',
    en: 'Where you live. Write the city, district, street name and number.',
  },
  {
    term: '여권',
    ko: '나라 밖으로 나갈 때 쓰는 신분증이에요.',
    vi: 'Giấy tờ tùy thân dùng khi đi ra nước ngoài (hộ chiếu).',
    zh: '出国时使用的身份证件（护照）。',
    en: 'The ID document you use when travelling abroad (passport).',
  },
]

// 목에서 L2가 만드는 풀이 틀. 실제 서버는 AI가 만든 풀이와 예시 문장을 준다
const L2_TEMPLATE = {
  ko: (text, base) => `[목데이터] '${text}'의 쉬운 풀이예요.${base ? ` ${base}` : ''}\n실서버에서는 AI가 쉬운 풀이와 예시 문장을 만들어요.`,
  vi: (text, base) => `[Dữ liệu mẫu] Giải thích dễ hiểu cho '${text}'.${base ? ` ${base}` : ''}\nMáy chủ thật sẽ dùng AI để viết giải thích dễ hiểu và câu ví dụ.`,
  zh: (text, base) => `[模拟数据] '${text}'的简单解释。${base ?? ''}\n实际服务器会由 AI 生成易懂的解释和例句。`,
  en: (text, base) => `[Mock data] An easy explanation of '${text}'.${base ? ` ${base}` : ''}\nThe real server uses AI to write an easy explanation and an example sentence.`,
}

const pickLanguage = (lang) => (L2_TEMPLATE[lang] ? lang : 'ko')
const glossary = (language) => TERMS.map((t, i) => ({ id: i + 1, term: t.term, explanation: t[language] ?? t.ko }))

export async function getGlossary(lang) {
  await delay(200)
  const language = pickLanguage(lang)
  return { language, terms: glossary(language) }
}

const cache = new Map()
const failedOnce = new Set()

export async function requestEasyExplanation(selectedText, glossaryTermId, lang) {
  await delay(900)
  const language = pickLanguage(lang)
  const text = (selectedText ?? '').trim()
  if (!text) throw new ApiError('TEXT_EMPTY', { status: 400, code: 'TEXT_EMPTY' })
  if (text.length > MAX_LENGTH) throw new ApiError('TEXT_TOO_LONG', { status: 400, code: 'TEXT_TOO_LONG' })
  if (text.includes('목적') && !failedOnce.has(text)) {
    failedOnce.add(text)
    throw new ApiError('LLM_CALL_FAILED', { status: 502, code: 'LLM_CALL_FAILED' })
  }
  // (selected_text, language)가 같으면 저장해 둔 풀이를 준다 (R5)
  const key = `${language}|${text}`
  if (!cache.has(key)) {
    const base = glossary(language).find((t) => t.id === glossaryTermId)?.explanation ?? null
    cache.set(key, { id: cache.size + 1, selected_text: text, language, explanation: L2_TEMPLATE[language](text, base) })
  }
  return { ...cache.get(key) }
}
