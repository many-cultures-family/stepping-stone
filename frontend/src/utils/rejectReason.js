// 반려 사유 코드 → 문구 (DATA-MODEL.md draft.reject_reason, OCR-API.md 실패 사유 코드, R3: 문장은 프론트가 만든다).
// 업로드 화면과 작성 목록이 같은 문구를 쓴다.
export const REJECT_TEXT = {
  OCR_FAILED: '문서 글자를 읽지 못했어요.',
  PAGE_MISSING: '글자가 없는 빈 페이지가 있어요.',
  PII_REMAINING: '문서 속 개인정보를 모두 가리지 못해서 AI에 보내지 않았어요.',
  CONDITION_UNMET: '완성 조건이 아직 남아 있어요.',
}

// 다시 올릴 때 도움이 되는 안내 (업로드 화면용)
export const REJECT_HINT = {
  OCR_FAILED: '글자가 잘 보이게 그림자·빛 번짐 없이 다시 찍어 올려 주세요.',
  PAGE_MISSING: '빈 페이지를 빼고 다시 올려 주세요.',
  PII_REMAINING: '아무것도 쓰지 않은 빈 신청서를 올리면 더 안전해요.',
}

export const rejectText = (reason) => REJECT_TEXT[reason] ?? '문서를 처리하지 못했어요.'
