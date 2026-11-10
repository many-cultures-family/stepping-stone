// F-03 사전 정보 항목 정의와 언어별 문구 (US-04)
// - 항목 종류는 DATA-MODEL.md prior_info.info_key 의 MVP 4개를 따른다.
// - 뜻 설명은 LLM을 쓰지 않는다(US-04 LLM 관여 '아니오'). 그래서 화면 국제화 문구로 미리 둔다.
//   누가 어떤 언어로 만들지는 backlog US-04 미확정 항목이라, 정해지면 이 표를 바꾼다.
// - 언어 목록은 DATA-MODEL.md user.language 의 MVP 목록(ko 쉬운 한국어, vi, zh, en)과 같다.

export const PRIOR_INFO_KEYS = ['name', 'birth_date', 'phone', 'address']

export const PRIOR_INFO_LANGUAGES = ['ko', 'vi', 'zh', 'en']

// 항목마다: 한국어 이름(신청서에 적힌 말), 형식 예시, 정해진 형식(있을 때만), 입력 도움 속성, 언어별 뜻
export const PRIOR_INFO_FIELDS = {
  name: {
    label: '이름',
    example: '응우옌 티 마이',
    inputMode: 'text',
    autoComplete: 'name',
    meaning: {
      ko: '내 이름이에요. 외국인등록증에 적힌 이름과 똑같이 써요.',
      vi: 'Họ và tên của bạn. Viết giống hệt tên trên thẻ đăng ký người nước ngoài.',
      zh: '您的姓名。请与外国人登录证上的姓名完全一致。',
      en: 'Your full name. Write it exactly as it appears on your Alien Registration Card.',
    },
  },
  birth_date: {
    label: '생년월일',
    example: '1990.01.01',
    format: 'YYYY.MM.DD (숫자만 쳐도 점이 들어가요)',
    inputMode: 'numeric',
    autoComplete: 'bday',
    meaning: {
      ko: '내가 태어난 날이에요. 년.월.일 순서로 써요.',
      vi: 'Ngày tháng năm sinh của bạn. Viết theo thứ tự năm.tháng.ngày.',
      zh: '您的出生日期。请按 年.月.日 的顺序填写。',
      en: 'Your date of birth. Write it in year.month.day order.',
    },
  },
  phone: {
    label: '연락처',
    example: '010-0000-0000',
    format: '010-0000-0000 (숫자만 쳐도 - 가 들어가요)',
    inputMode: 'tel',
    autoComplete: 'tel',
    meaning: {
      ko: '연락받을 휴대전화 번호예요.',
      vi: 'Số điện thoại di động để liên lạc với bạn.',
      zh: '可以联系到您的手机号码。',
      en: 'The mobile phone number where you can be reached.',
    },
  },
  address: {
    label: '주소',
    example: '서울특별시 중구 세종대로 110, 101동 101호',
    inputMode: 'text',
    autoComplete: 'street-address',
    meaning: {
      ko: '지금 사는 집 주소예요. 동·호수까지 써요.',
      vi: 'Địa chỉ nơi bạn đang sống. Ghi cả số tòa nhà và số phòng.',
      zh: '您现在居住的地址。请写到楼栋号和房间号。',
      en: 'The address where you live now, including building and unit number.',
    },
  },
}

// 화면에서 쓰는 언어 이름 (뜻 설명 상자 머리말)
export const LANGUAGE_NAMES = {
  ko: '쉬운 한국어',
  vi: 'Tiếng Việt',
  zh: '中文',
  en: 'English',
}

// 오류 코드 → 언어별 문구 (R3: 판정은 규칙 엔진, 문구는 프론트 국제화). {example} 은 형식 예시로 바꾼다.
const ERROR_TEXT = {
  REQUIRED_MISSING: {
    ko: '꼭 써야 해요.',
    vi: 'Mục này bắt buộc.',
    zh: '此项为必填。',
    en: 'This is required.',
  },
  FORMAT_INVALID: {
    ko: '형식이 맞지 않아요. 예: {example}',
    vi: 'Sai định dạng. Ví dụ: {example}',
    zh: '格式不正确。例：{example}',
    en: 'Wrong format. Example: {example}',
  },
}

const pick = (table, language) => table[language] ?? table.ko

/** 항목 뜻 (사용 언어, 없으면 쉬운 한국어) */
export function meaningOf(infoKey, language) {
  return pick(PRIOR_INFO_FIELDS[infoKey].meaning, language)
}

/** 오류 문구. 한국어 문구와 사용 언어 문구를 함께 돌려준다(사용 언어가 ko 면 native 는 null) */
export function errorTextOf(code, infoKey, language) {
  const table = ERROR_TEXT[code] ?? ERROR_TEXT.FORMAT_INVALID
  const example = PRIOR_INFO_FIELDS[infoKey].example
  const fill = (s) => s.replace('{example}', example)
  return {
    ko: fill(table.ko),
    native: language && language !== 'ko' ? fill(pick(table, language)) : null,
  }
}
