import { useState } from 'react'
import { Alert, Button, Paper, Stack, Typography } from '@mui/material'
import { uploadDocument } from '../api/documents.js'
import { useAuth } from '../auth/useAuth.js'

// US-01 #1 범위: PDF·이미지 파일을 올리면 작성 건이 '업로드됨'으로 생긴다 (first-feature.md 2절 #1).
// 인식(OCR)·개인정보 가림·결과 확인(#2~#4)은 오늘 범위가 아니다.
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const ALLOWED_TYPES_LABEL = 'PDF, PNG, JPG'

// API.md 오류 코드 → 사용 언어 문구 (DESIGN.md "오류" 상태: 오류 메시지 + 다시 시도)
const ERROR_MESSAGES = {
  FILE_REQUIRED: '파일을 선택해 주세요.',
  FILE_TYPE_NOT_ALLOWED: `${ALLOWED_TYPES_LABEL} 파일만 올릴 수 있어요. 다른 파일을 선택해 주세요.`,
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}

function errorMessage(e) {
  return ERROR_MESSAGES[e.code] ?? '파일을 올리는 중 문제가 생겼어요. 다시 시도해 주세요.'
}

export default function UploadPage() {
  const { setLoggedOut } = useAuth()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null)

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const { draft: created } = await uploadDocument(file)
      setDraft(created)
    } catch (e) {
      // 다른 API와 같은 401 공통 처리: 별도 에러 화면 없이 머리 영역·화면을 비로그인 상태로 되돌린다
      // (App.jsx가 status==='anonymous'일 때 LoginRequired를 보여준다. LOGIN-API.md "화면 약속").
      if (e.code === 'LOGIN_REQUIRED') {
        setLoggedOut()
        return
      }
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setFile(null)
    setError(null)
    setDraft(null)
  }

  if (draft) {
    return (
      <Paper sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Alert severity="success">
            작성 건이 <strong>업로드됨</strong> 상태로 생겼어요. (작성 건 번호: {draft.id})
          </Alert>
          <Button variant="outlined" onClick={handleReset} sx={{ alignSelf: 'flex-start' }}>
            다른 파일 올리기
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            문서 올리기
          </Typography>
          <Typography color="text.secondary">
            {ALLOWED_TYPES_LABEL} 파일을 올리면 작성 건이 만들어져요.
          </Typography>
        </div>

        <Button variant="outlined" component="label">
          {file ? file.name : '파일 선택'}
          <input
            hidden
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            aria-label={`서류 파일 선택 (${ALLOWED_TYPES_LABEL})`}
            onChange={(e) => {
              setError(null)
              setFile(e.target.files?.[0] ?? null)
            }}
          />
        </Button>

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" disabled={loading} onClick={handleSubmit}>
                다시 시도
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <Button variant="contained" size="large" disabled={!file || loading} onClick={handleSubmit}>
          {loading ? '업로드 중…' : '업로드'}
        </Button>
      </Stack>
    </Paper>
  )
}
