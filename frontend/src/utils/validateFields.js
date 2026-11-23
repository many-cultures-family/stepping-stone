// 입력 항목 규칙 검증 (R2).
// 오류 판정은 서버가 한다. 화면은 서버 응답의 errors [{ field_id, code }] 를 그대로 그린다.

export const FIELD_ERROR_TEXT = {
  FORMAT_CODE_INVALID: '입력 형식을 골라 주세요',
  REQUIRED_MISSING: '필수인지 선택인지 골라 주세요',
}

/** 서버 errors 배열 → { [field_id]: code[] } */
export function groupErrors(errors = []) {
  const result = {}
  for (const { field_id, code } of errors) (result[field_id] ??= []).push(code)
  return result
}
