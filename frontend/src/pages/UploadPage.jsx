import { useState } from 'react'
import { Alert, Button, Paper, Stack, Typography } from '@mui/material'
import { uploadDocument } from '../api/documents.js'

// docs/API.md 항목 1 의 허용 형식
const ACCEPT = 'application/pdf,image/png,image/jpeg'

// 서버 오류 코드 → 화면 문장. 사용 언어별 문장은 아직 정하지 않아 한국어만 쓴다
const ERROR_MESSAGES = {
  FILE_REQUIRED: '파일을 골라 주세요.',
  FILE_TYPE_NOT_ALLOWED: 'PDF, PNG, JPG 파일만 올릴 수 있어요.',
  NETWORK_ERROR: '서버 연결 실패',
}

export default function UploadPage() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null)

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setError(null)
    setDraft(null)
    try {
      const result = await uploadDocument(file)
      setDraft(result.draft)
    } catch (e) {
      setError(ERROR_MESSAGES[e.code] ?? e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e) {
    setFile(e.target.files?.[0] ?? null)
    setError(null)
    setDraft(null)
  }

  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            문서 올리기
          </Typography>
          <Typography color="text.secondary">
            작성할 신청서를 올려 주세요. PDF, PNG, JPG 파일을 올릴 수 있어요.
          </Typography>
        </div>

        <Button variant="outlined" component="label">
          {file ? file.name : '파일 선택'}
          <input hidden type="file" accept={ACCEPT} aria-label="올릴 문서 파일" onChange={handleFileChange} />
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

        {draft && <Alert severity="success">올렸어요. 작성 건 {draft.id}번이 만들어졌어요 (업로드됨).</Alert>}

        <Button variant="contained" size="large" disabled={!file || loading} onClick={handleSubmit}>
          {loading ? '올리는 중…' : '올리기'}
        </Button>
      </Stack>
    </Paper>
  )
}
