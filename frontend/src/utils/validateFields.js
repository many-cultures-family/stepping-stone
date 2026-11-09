// 입력 항목 규칙 검증 (R2) — 화면에서 미리 보여 주는 용도. 최종 판정은 서버 규칙 엔진이 한다.
// 실패 사유 코드 → 화면 문구는 FIELD_ERROR_TEXT 에서 고른다.

export const FIELD_ERROR_TEXT = {
  LABEL_EMPTY: '항목 이름을 적어 주세요',
  FORMAT_EMPTY: '입력 형식을 골라 주세요',
  FORMAT_NOT_ALLOWED: '쓸 수 없는 입력 형식이에요. 다시 골라 주세요',
  REQUIRED_EMPTY: '필수인지 선택인지 골라 주세요',
  OPTIONS_EMPTY: '고를 수 있는 답을 1개 이상 넣어 주세요',
}

/** 항목 하나의 실패 사유 코드 목록 (없으면 빈 배열) */
export function validateField(field, allowedCodes) {
  const errors = []
  if (!field.label?.trim()) errors.push('LABEL_EMPTY')
  if (!field.format_code) errors.push('FORMAT_EMPTY')
  else if (!allowedCodes.includes(field.format_code)) errors.push('FORMAT_NOT_ALLOWED')
  if (typeof field.required !== 'boolean') errors.push('REQUIRED_EMPTY')
  if (field.format_code === 'choice' && !(field.options?.length > 0)) errors.push('OPTIONS_EMPTY')
  return errors
}

/** { [fieldId]: 사유코드[] } — 오류가 있는 항목만 담는다 */
export function validateFields(fields, formats) {
  const allowed = formats.map((f) => f.code)
  const result = {}
  for (const field of fields) {
    const errors = validateField(field, allowed)
    if (errors.length) result[field.id] = errors
  }
  return result
}
