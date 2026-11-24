import { useEffect, useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material'
import { recognizeDocument, reuploadDocument, REUPLOAD_AVAILABLE, uploadDocument } from '../api/documents.js'
import { useAuth } from '../auth/useAuth.js'
import { AlertCircleIcon, CheckCircleIcon, DocumentIcon, ShieldIcon, UploadIcon } from '../components/icons.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container, Pill, SquircleTile } from '../components/ui.jsx'
import { navigate, setPendingFile } from '../router.js'
import { ds, radius, squircle } from '../theme.js'
import { REJECT_HINT, rejectText } from '../utils/rejectReason.js'

// US-01: PDF·이미지 파일을 올리면 작성 건이 '업로드됨'으로 생기고(#1), 이어서 글자 인식·개인정보 가림(#2·#3·#4,
// OCR-API.md 항목 1)을 부른다. 인식이 끝나면 입력 항목 확인(F-02, /drafts/:id/fields)으로 이어진다.
// 인식에 실패하면 서버가 작성 건을 '반려'로 바꾸고 사유 코드를 돌려준다 → 사유 문구와 다시 올리기 안내.
// 다시 올리기(/drafts/:id/reupload, replaceDraftId)는 새 작성 건을 만들지 않고 반려된 같은 건의 문서를 바꾼다
// (DATA-MODEL.md "작성 건 하나에 문서 하나", 서버 POST .../document:reupload 백엔드 PR #38).
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const ALLOWED_TYPES_LABEL = 'PDF, PNG, JPG'

// API.md 오류 코드 → 사용 언어 문구 (DESIGN.md "오류" 상태: 오류 메시지 + 다시 시도)
const ERROR_MESSAGES = {
  FILE_REQUIRED: '파일을 선택해 주세요.',
  FILE_TYPE_NOT_ALLOWED: `${ALLOWED_TYPES_LABEL} 파일만 올릴 수 있어요. 다른 파일을 선택해 주세요.`,
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
  // 다시 올리기에서만 나는 오류
  DRAFT_NOT_REJECTED: '반려된 작성 건에만 다시 올릴 수 있어요. 내 작성 목록에서 이어서 진행해 주세요.',
  DRAFT_NOT_FOUND: '작성 건을 찾을 수 없어요. 이미 지워졌을 수 있어요.',
  FORBIDDEN_DRAFT: '이 작성 건에 올릴 수 있는 권한이 없어요.',
}

// 다시 올리기에서 같은 건에 다시 시도해도 소용없는 오류 → 새로 올리기로 안내한다
const REUPLOAD_FINAL_ERRORS = ['DRAFT_NOT_REJECTED', 'DRAFT_NOT_FOUND', 'FORBIDDEN_DRAFT']

function errorMessage(e) {
  return ERROR_MESSAGES[e.code] ?? '파일을 올리는 중 문제가 생겼어요. 다시 시도해 주세요.'
}

// 글자 인식 요청 자체가 실패했을 때 (반려는 오류가 아니라 200 응답이다)
const RECOGNIZE_ERROR_MESSAGES = {
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
  DRAFT_STEP_INVALID: '이미 글자 인식을 마친 작성 건이에요. 내 작성 목록에서 이어서 진행해 주세요.',
  DRAFT_NOT_EDITABLE: '반려되었거나 취소된 작성 건이에요. 다른 파일로 다시 올려 주세요.',
}

function recognizeErrorMessage(e) {
  return RECOGNIZE_ERROR_MESSAGES[e.code] ?? '글자를 읽는 중 문제가 생겼어요. 다시 시도해 주세요.'
}

// 같은 작성 건에 인식을 다시 불러도 소용없는 오류 (다시 인식하기 버튼을 숨긴다)
const RECOGNIZE_FINAL_ERRORS = ['DRAFT_STEP_INVALID', 'DRAFT_NOT_EDITABLE', 'DRAFT_NOT_FOUND', 'FORBIDDEN_DRAFT']

const TIPS = [
  { title: '글자가 잘 보이게', body: '그림자·빛 번짐 없이 서류 전체가 나오게 찍어 주세요.' },
  { title: '한 서류씩', body: '여러 서류는 따로 올려 주세요. PDF는 여러 쪽도 괜찮아요.' },
  { title: '빈 신청서도 OK', body: '아직 아무것도 쓰지 않은 신청서를 올려도 돼요.' },
]

export default function UploadPage({ replaceDraftId = null }) {
  const { setLoggedOut } = useAuth()
  // 문서를 바꿀 반려 건 id. 이 화면에서 다시 반려되면 그 건으로 바뀐다 (새로 올린 건이 반려된 경우 포함)
  const [replaceId, setReplaceId] = useState(REUPLOAD_AVAILABLE ? replaceDraftId : null)
  // 이 작성 건에는 더 올릴 수 없다고 서버가 답했을 때(반려 아님·없음·권한 없음). '다시 시도'로 새 건이 생기지 않게 막는다
  const [reuploadBlocked, setReuploadBlocked] = useState(false)

  // 다시 올리기 API 가 없는 실서버에서 /drafts/:id/reupload 로 들어오면 새 작성 건 올리기 주소로 바꾼다 (북마크·공유 주소)
  useEffect(() => {
    if (replaceDraftId && !REUPLOAD_AVAILABLE) navigate('/upload', { replace: true })
  }, [replaceDraftId])
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null)
  const [recognizing, setRecognizing] = useState(false)
  const [recognizeError, setRecognizeError] = useState(null) // { message, retryable }

  function pick(next) {
    if (reuploadBlocked) return
    setError(null)
    setFile(next ?? null)
  }

  async function runRecognize(draftId) {
    setRecognizing(true)
    setRecognizeError(null)
    try {
      const { draft: recognized } = await recognizeDocument(draftId)
      setDraft(recognized)
    } catch (e) {
      if (e.code === 'LOGIN_REQUIRED') {
        setLoggedOut()
        return
      }
      setRecognizeError({ message: recognizeErrorMessage(e), retryable: !RECOGNIZE_FINAL_ERRORS.includes(e.code) })
    } finally {
      setRecognizing(false)
    }
  }

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const { draft: created } = replaceId ? await reuploadDocument(replaceId, file) : await uploadDocument(file)
      setDraft(created)
      // 업로드 성공 직후 이어서 인식한다 (OCR-API.md "화면은 업로드 성공 직후 이어서 부른다")
      await runRecognize(created.id)
    } catch (e) {
      // 다른 API와 같은 401 공통 처리: 별도 에러 화면 없이 머리 영역·화면을 비로그인 상태로 되돌린다
      // (App.jsx가 status==='anonymous'일 때 LoginRequired를 보여준다. LOGIN-API.md "화면 약속").
      if (e.code === 'LOGIN_REQUIRED') {
        setLoggedOut()
        return
      }
      setError(errorMessage(e))
      // 이 건에는 더 올릴 수 없다 → 같은 건에 다시 시도하지 않고 목록·새로 올리기만 권한다
      if (replaceId && REUPLOAD_FINAL_ERRORS.includes(e.code)) setReuploadBlocked(true)
    } finally {
      setLoading(false)
    }
  }

  // 인식이 끝나 서버가 step 을 field_check 로 돌려줘야 항목 확인으로 갈 수 있다
  const readyForFields = draft?.step === 'field_check'
  const rejected = draft?.status === '반려'

  function goFieldCheck() {
    setPendingFile(draft.id, file)
    navigate(`/drafts/${draft.id}/fields`)
  }

  function handleReset() {
    setFile(null)
    setError(null)
    setDraft(null)
    setRecognizeError(null)
    setReplaceId(null)
    setReuploadBlocked(false)
    // 다시 올리기 경로에서 '다른 파일 올리기'를 누르면 새 작성 건 올리기 경로로 바꾼다
    if (window.location.pathname !== '/upload') navigate('/upload')
  }

  // 반려된 건에 다른 파일로 다시 올리기 (같은 작성 건 유지)
  function handleReupload() {
    const id = draft.id
    setFile(null)
    setError(null)
    setDraft(null)
    setRecognizeError(null)
    setReplaceId(id)
  }

  const canReupload = REUPLOAD_AVAILABLE && rejected

  const hero = !draft
    ? replaceId
      ? { title: '다른 파일로 다시 올려 주세요', description: `반려된 작성 건 #${replaceId}에 새 파일을 올리면 같은 작성 건에서 이어서 진행해요.` }
      : { title: '신청서를 올려 주세요', description: `${ALLOWED_TYPES_LABEL} 파일을 올리면 AI가 써야 할 칸을 찾아 드려요.` }
    : recognizing
      ? { title: '글자를 읽고 있어요', description: '이름·연락처 같은 개인정보는 가린 뒤에만 AI에 보내요. 잠시만 기다려 주세요.' }
      : rejected
        ? { title: '문서를 처리하지 못했어요', description: canReupload ? '아래 안내를 보고 다른 파일로 다시 올려 주세요. 같은 작성 건에서 이어서 할 수 있어요.' : '아래 안내를 보고 다른 파일로 다시 올려 주세요.' }
        : readyForFields
          ? { title: '문서를 올렸어요', description: '이제 AI가 찾은 입력 칸이 원본과 같은지 확인할 차례예요.' }
          : { title: '글자 인식을 마치지 못했어요', description: '다시 시도하거나, 내 작성 목록에서 이어서 할 수 있어요.' }

  const statusPill = recognizing ? '글자 읽는 중' : rejected ? '반려' : readyForFields ? '항목 확인 단계' : '업로드됨'

  return (
    <>
      <PageHero step={0} overline="STEP 1" title={hero.title} description={hero.description} />

      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.6fr) minmax(0, 1fr)' }, gap: { xs: 2, md: 3 } }}>
          {draft ? (
            <Stack
              spacing={2}
              sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...squircle(radius.hero), bgcolor: ds.card, p: { xs: 4, md: 7 }, minHeight: 360 }}
            >
              {recognizing ? (
                <CircularProgress size={56} thickness={4} aria-hidden="true" />
              ) : rejected || recognizeError ? (
                <AlertCircleIcon size={60} color={ds.red} />
              ) : (
                <CheckCircleIcon size={60} color={ds.primary} />
              )}
              <Typography variant="h3" component="p" sx={{ pt: 1, wordBreak: 'break-all' }}>
                {file?.name}
              </Typography>
              <Pill tone={rejected ? 'red' : 'soft'}>
                작성 건 {draft.id} · {statusPill}
              </Pill>

              {/* 진행·결과 문구는 화면 읽기 프로그램에도 바로 읽히게 한다 */}
              <Box aria-live="polite" sx={{ maxWidth: 460 }}>
                {recognizing && (
                  <Typography variant="body2" sx={{ color: ds.text2 }}>
                    글자를 읽고 개인정보를 가리는 중이에요. 처음에는 30초쯤 걸릴 수 있어요.
                  </Typography>
                )}
                {!recognizing && rejected && (
                  <Box role="alert" sx={{ px: 3, py: 2, ...squircle(radius.card), bgcolor: ds.redSoft }}>
                    <Typography variant="body2" sx={{ color: ds.red, fontWeight: 600 }}>
                      {rejectText(draft.reject_reason)}
                    </Typography>
                    {REJECT_HINT[draft.reject_reason] && (
                      <Typography variant="body2" sx={{ color: ds.text2, mt: 0.5 }}>
                        {REJECT_HINT[draft.reject_reason]}
                      </Typography>
                    )}
                  </Box>
                )}
                {!recognizing && !rejected && recognizeError && (
                  <Box role="alert" sx={{ px: 3, py: 2, ...squircle(radius.card), bgcolor: ds.redSoft }}>
                    <Typography variant="body2" sx={{ color: ds.red, fontWeight: 600 }}>
                      {recognizeError.message}
                    </Typography>
                  </Box>
                )}
              </Box>

              {!recognizing && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 2, width: { xs: '100%', sm: 'auto' } }}>
                  {readyForFields ? (
                    <>
                      <Button variant="outlined" size="large" onClick={handleReset}>
                        다른 파일 올리기
                      </Button>
                      <Button variant="contained" size="large" onClick={goFieldCheck}>
                        입력 항목 확인하기
                      </Button>
                    </>
                  ) : recognizeError?.retryable && !rejected ? (
                    <>
                      <Button variant="outlined" size="large" onClick={() => navigate('/drafts')}>
                        내 작성 목록 보기
                      </Button>
                      <Button variant="contained" size="large" onClick={() => runRecognize(draft.id)}>
                        다시 인식하기
                      </Button>
                    </>
                  ) : canReupload ? (
                    <>
                      <Button variant="outlined" size="large" onClick={() => navigate('/drafts')}>
                        내 작성 목록 보기
                      </Button>
                      <Button variant="contained" size="large" onClick={handleReupload}>
                        다른 파일로 다시 올리기
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outlined" size="large" onClick={() => navigate('/drafts')}>
                        내 작성 목록 보기
                      </Button>
                      <Button variant="contained" size="large" onClick={handleReset}>
                        다른 파일 올리기
                      </Button>
                    </>
                  )}
                </Stack>
              )}
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

              {reuploadBlocked ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
                  <Button variant="outlined" size="large" onClick={() => navigate('/drafts')}>
                    내 작성 목록 보기
                  </Button>
                  <Button variant="contained" size="large" onClick={handleReset}>
                    새로 올리기
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    size="large"
                    disabled={!file || loading}
                    onClick={handleSubmit}
                    sx={{ minWidth: { xs: '100%', sm: 200 } }}
                  >
                    {loading ? <CircularProgress size={22} thickness={5} sx={{ color: 'white' }} /> : error ? '다시 시도' : replaceId ? '다시 올리기' : '올리기'}
                  </Button>
                </Stack>
              )}
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
                서류에 적힌 이름·연락처 같은 개인정보는 가린 뒤에만 AI에 보내요. 다 가리지 못하면 AI에 보내지 않고 멈춰요.
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </>
  )
}
