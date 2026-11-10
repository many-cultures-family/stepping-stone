// 입력 항목 규칙 검증 (R2).
// 오류 판정은 서버가 한다. 화면은 서버 응답의 errors [{ field_id, code }] 를 그대로 그린다.
// 아래 validateField 는 수정 창에서 저장 전에 미리 보여 주는 보조용이며, 코드 이름은 서버와 같다.

export const FIELD_ERROR_TEXT = {
  FORMAT_CODE_INVALID: '입력 형식을 골라 주세요',
  REQUIRED_MISSING: '필수인지 선택인지 골라 주세요',
  // 아래 둘은 서버 코드가 아니라 수정 창 안에서만 쓰는 미리보기 안내
  LABEL_EMPTY: '항목 이름을 적어 주세요',
  OPTIONS_EMPTY: '고를 수 있는 답을 1개 이상 넣어 주세요',
}

/** 서버 errors 배열 → { [field_id]: code[] } */
export function groupErrors(errors = []) {
  const result = {}
  for (const { field_id, code } of errors) (result[field_id] ??= []).push(code)
  return result
}

/** [미리보기 보조] 항목 하나의 실패 사유 코드 목록 (없으면 빈 배열) */
export function validateField(field, allowedCodes) {
  const errors = []
  if (!field.label?.trim()) errors.push('LABEL_EMPTY')
  if (!allowedCodes.includes(field.format_code)) errors.push('FORMAT_CODE_INVALID')
  if (typeof field.required !== 'boolean') errors.push('REQUIRED_MISSING')
  if (field.format_code === 'choice' && !(field.options?.length > 0)) errors.push('OPTIONS_EMPTY')
  return errors
}
