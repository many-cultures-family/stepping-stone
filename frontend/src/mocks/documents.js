// 백엔드 없이 화면을 먼저 만들기 위한 목데이터.
// VITE_USE_MOCK=true 일 때 src/api/documents.js 가 이 함수들을 대신 호출한다.

import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const EXPLANATIONS = {
  ko: {
    name: '신청인 이름이 신분증과 같게 적혀 있어요.',
    birth: '생년월일 형식이 맞지 않아요. 연-월-일 순서로 적어야 해요.',
    phone: '연락처가 비어 있어요. 연락받을 수 있는 번호를 적어 주세요.',
  },
  en: {
    name: "The applicant's name matches the ID card.",
    birth: 'The date of birth format is wrong. Write it as year-month-day.',
    phone: 'The phone number is empty. Please enter a number where you can be reached.',
  },
}

let items = [
  { id: 'name', label: '신청인 성명', value: '김*우', status: 'pass', suggestion: null },
  { id: 'birth', label: '생년월일', value: '**/**/1990', status: 'fail', suggestion: '1990-**-**' },
  { id: 'phone', label: '연락처', value: '', status: 'warn', suggestion: '010-****-**** 형식으로 입력' },
].map((it) => ({ ...it, suggestionAccepted: false }))

// docs/API.md 항목 1 의 허용 형식
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']

export async function uploadDocument(file) {
  await delay(500)
  if (!file) throw new ApiError('파일 없음', { status: 400, code: 'FILE_REQUIRED' })
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ApiError('허용하지 않는 형식', { status: 415, code: 'FILE_TYPE_NOT_ALLOWED' })
  }
  // docs/API.md 항목 1 응답 예시
  return {
    draft: { id: 1, status: '수정', step: 'upload' },
    document: { mime_type: file.type, page_count: 1 },
  }
}

export async function getValidationResult(documentId, lang) {
  await delay(400)
  const text = EXPLANATIONS[lang] ?? EXPLANATIONS.ko
  return {
    documentId,
    items: items.map((it) => ({ ...it, explanation: text[it.id] })),
  }
}

export async function acceptSuggestion(documentId, itemId) {
  await delay(300)
  items = items.map((it) => (it.id === itemId ? { ...it, suggestionAccepted: true } : it))
  const item = items.find((it) => it.id === itemId)
  return { ...item, explanation: EXPLANATIONS.ko[itemId] }
}
