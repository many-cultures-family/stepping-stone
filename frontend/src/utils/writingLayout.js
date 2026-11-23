// 가상 작성 화면(F-04)의 입력칸 자리 계산과 형식 검사. pages/WritingPage.jsx 가 쓴다.

// 칸 위치(bbox)로 입력칸 자리를 정한다. 모두 페이지 크기 대비 0~1 비율.
// OCR·L1 은 글자가 있는 곳만 알려 주므로, 표 안 칸의 bbox 는 '라벨' 자리다 → 입력칸은 라벨 오른쪽에 둔다.
// 날짜줄('년 월 일')·서명란은 bbox 가 그 줄 전체라 줄 위에 겹친다.
const ROW_H = 0.03 // 한 줄 입력칸 높이 (A4 높이 대비, 표 한 칸보다 조금 작게)

export function inputRect(field) {
  // 서버가 원본의 표 선으로 값 칸을 찾았으면 그 칸을 그대로 쓴다 (form 응답의 input_bbox, 서버 layout.py)
  if (field.input_bbox) {
    const b = field.input_bbox
    return { left: b.x, top: b.y, width: b.w, height: b.h }
  }
  const { x, y, w, h } = field.bbox
  const cy = y + h / 2
  if (field.format_code === 'date' && w > 0.15) {
    // 날짜줄: 줄 전체를 덮는다 (라벨이 아니라 '년 월 일' 자리 자체가 칸)
    return { left: x - 0.01, top: cy - ROW_H / 2, width: w + 0.02, height: ROW_H }
  }
  if (field.format_code === 'signature') {
    // 서명란: 줄은 '신청인 ······ (서명 또는 인)' 모양이다. 이름 칸과 '(인)' 사이 빈자리(줄 가운데)가 서명하는 곳
    return { left: x + w * 0.3, top: cy - ROW_H / 2 - 0.004, width: w * 0.4, height: ROW_H + 0.008 }
  }
  const height = field.format_code === 'long_text' ? ROW_H * 2.4 : ROW_H
  const left = x + w + 0.015
  if (left > 0.75) {
    // 라벨이 오른쪽 끝에 있으면 아래 줄에 둔다
    return { left: x, top: y + h + 0.005, width: Math.max(w, 0.3), height }
  }
  return { left, top: cy - ROW_H / 2, width: Math.min(0.92 - left, 0.48), height }
}

// ── 날짜줄을 년·월·일 세 칸으로 받을 때 (form 응답 part_bboxes) ──
// 값은 한 문자열 'YYYY.M.D' 로 둔다 (다른 칸과 같은 모양이라 필수·작성 수 계산이 같다)
export function splitDate(value) {
  const [year = '', month = '', day = ''] = (value ?? '').split('.')
  return { year, month, day }
}

export function joinDate({ year, month, day }) {
  return year || month || day ? `${year}.${month}.${day}` : ''
}

/** 칸 높이(페이지 높이 대비)에 맞는 글자 크기. cqw = 페이지 폭의 1%, ratio = 페이지 높이/폭 */
export function fontFor(heightRatio, ratio) {
  const cqw = heightRatio * ratio * 100 * 0.68
  return `clamp(9px, ${cqw.toFixed(2)}cqw, 22px)`
}

/** 형식 검사 (R3). 값이 비었으면 검사하지 않는다(필수 여부는 따로 센다). 서명·서술형·선택형은 pattern 이 없다 */
export function formatError(field, value) {
  if (!value || !field.pattern) return null
  // 년·월·일 칸에 '2026', '1', '5' 처럼 쓴 것은 2026.01.05 로 맞춰서 본다
  const v = field.format_code === 'date' ? value.replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, (_, y, m, d) => `${y}.${m.padStart(2, '0')}.${d.padStart(2, '0')}`) : value
  try {
    return new RegExp(field.pattern).test(v) ? null : 'FORMAT'
  } catch {
    return null
  }
}

/** 값을 입력받는 칸인지 (서명은 입력받지 않는다, R10) */
export const isInput = (field) => field.format_code !== 'signature'
