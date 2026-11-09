import { useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material'
import { uploadDocument } from '../api/documents.js'
import { useAuth } from '../auth/useAuth.js'
import { CheckCircleIcon, DocumentIcon, ShieldIcon, UploadIcon } from '../components/icons.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container, Pill, SquircleTile } from '../components/ui.jsx'
import { navigate, setPendingFile } from '../router.js'
import { ds, radius, squircle } from '../theme.js'

// US-01 #1 범위: PDF·이미지 파일을 올리면 작성 건이 '업로드됨'으로 생긴다 (first-feature.md 2절 #1).
// 올린 뒤에는 입력 항목 확인(F-02, /drafts/:id/fields)으로 이어진다.
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

const TIPS = [
  { title: '글자가 잘 보이게', body: '그림자·빛 번짐 없이 서류 전체가 나오게 찍어 주세요.' },
  { title: '한 서류씩', body: '여러 서류는 따로 올려 주세요. PDF는 여러 쪽도 괜찮아요.' },
  { title: '빈 신청서도 OK', body: '아직 아무것도 쓰지 않은 신청서를 올려도 돼요.' },
]

export default function UploadPage() {
  const { setLoggedOut } = useAuth()
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null)

  function pick(next) {
    setError(null)
    setFile(next ?? null)
  }

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

  function goFieldCheck() {
    setPendingFile(draft.id, file)
    navigate(`/drafts/${draft.id}/fields`)
  }

  function handleReset() {
    setFile(null)
    setError(null)
    setDraft(null)
  }

  return (
    <>
      <PageHero
        step={0}
        overline="STEP 1"
        title={draft ? '문서를 올렸어요' : '신청서를 올려 주세요'}
        description={
          draft
            ? '이제 AI가 찾은 입력 칸이 원본과 같은지 확인할 차례예요.'
            : `${ALLOWED_TYPES_LABEL} 파일을 올리면 AI가 써야 할 칸을 찾아 드려요.`
        }
      />

      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.6fr) minmax(0, 1fr)' }, gap: { xs: 2, md: 3 } }}>
          {draft ? (
            <Stack
              spacing={2}
              sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...squircle(radius.hero), bgcolor: ds.card, p: { xs: 4, md: 7 }, minHeight: 360 }}
            >
              <CheckCircleIcon size={60} color={ds.primary} />
              <Typography variant="h3" component="p" sx={{ pt: 1 }}>
                {file?.name}
              </Typography>
              <Pill tone="soft">작성 건 {draft.id} · 업로드됨</Pill>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 3, width: { xs: '100%', sm: 'auto' } }}>
                <Button variant="outlined" size="large" onClick={handleReset}>
                  다른 파일 올리기
                </Button>
                <Button variant="contained" size="large" onClick={goFieldCheck}>
                  입력 항목 확인하기
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <ButtonBase
                component="label"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  pick(e.dataTransfer.files?.[0])
                }}
                sx={{
                  width: '100%',
                  minHeight: { xs: 260, md: 320 },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  p: 4,
                  ...squircle(radius.hero),
                  bgcolor: file || dragging ? ds.primarySoft : ds.card,
                  outline: `2px dashed ${file || dragging ? ds.primary : '#D3D9E0'}`,
                  outlineOffset: -12,
                  transition: 'all .15s ease',
                  '&:hover': { bgcolor: file ? ds.primarySoft : ds.cardHover },
                  '&:focus-within': { boxShadow: `0 0 0 3px ${ds.primaryLine}` },
                }}
              >
                <SquircleTile size={72} bg={ds.white} color={ds.primary}>
                  {file ? <DocumentIcon size={32} color={ds.primary} /> : <UploadIcon size={30} />}
                </SquircleTile>
                <Typography variant="h3" component="span" sx={{ wordBreak: 'break-all', textAlign: 'center' }}>
                  {file ? file.name : '파일을 끌어다 놓거나 눌러서 고르세요'}
                </Typography>
                <Typography variant="body2" sx={{ color: ds.text2 }}>
                  {file ? '다른 파일로 바꾸려면 다시 눌러 주세요' : `${ALLOWED_TYPES_LABEL} · 한 번에 1개`}
                </Typography>
                <input
                  hidden
                  type="file"
                  accept={ALLOWED_TYPES.join(',')}
                  aria-label={`서류 파일 선택 (${ALLOWED_TYPES_LABEL})`}
                  onChange={(e) => pick(e.target.files?.[0])}
                />
              </ButtonBase>

              {error && (
                <Box role="alert" sx={{ px: 3, py: 2, ...squircle(radius.card), bgcolor: ds.redSoft }}>
                  <Typography variant="body2" sx={{ color: ds.red, fontWeight: 600 }}>
                    {error}
                  </Typography>
                </Box>
              )}

              <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={!file || loading}
                  onClick={handleSubmit}
                  sx={{ minWidth: { xs: '100%', sm: 200 } }}
                >
                  {loading ? <CircularProgress size={22} thickness={5} sx={{ color: 'white' }} /> : error ? '다시 시도' : '올리기'}
                </Button>
              </Stack>
            </Stack>
          )}

          <Stack spacing={2}>
            <Box sx={{ ...squircle(radius.card), bgcolor: ds.card, p: { xs: 3, md: 4 } }}>
              <Typography variant="h4" component="h2" sx={{ mb: 2.5 }}>
                이렇게 올려 주세요
              </Typography>
              <Stack component="ol" spacing={2.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {TIPS.map((t, i) => (
                  <Stack component="li" key={t.title} direction="row" spacing={2}>
                    <Box sx={{ width: 28, height: 28, ...squircle(14), bgcolor: ds.white, color: ds.primary, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {i + 1}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{t.title}</Typography>
                      <Typography variant="body2" sx={{ color: ds.text2 }}>
                        {t.body}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
            <Stack direction="row" spacing={2} sx={{ ...squircle(radius.card), bgcolor: ds.primarySoft, p: 3, alignItems: 'center' }}>
              <Box sx={{ color: ds.primary }}>
                <ShieldIcon size={28} />
              </Box>
              <Typography variant="body2" sx={{ color: ds.primaryDeep, fontWeight: 600 }}>
                서류에 적힌 이름·연락처 같은 개인정보는 가린 뒤에만 AI에 보내요.
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </>
  )
}
