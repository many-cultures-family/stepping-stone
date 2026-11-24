import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Radio,
  RadioGroup,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'
import { ShieldIcon } from '../icons.jsx'
import { Pill } from '../ui.jsx'

// 감지 종류 (DATA-MODEL.md privacy_detection.kind) → 화면 이름과 도움말
const PRIVACY_KIND = {
  phone: { title: '전화번호' },
  email: { title: '이메일 주소' },
  resident_no: { title: '주민등록번호', hint: '서술형 답변에는 보통 쓰지 않아도 되는 번호예요.' },
  alien_no: { title: '외국인등록번호', hint: '서술형 답변에는 보통 쓰지 않아도 되는 번호예요.' },
  address: { title: '주소' },
  long_number: { title: '긴 번호', hint: '계좌·여권·카드 번호처럼 보이는 숫자예요.' },
}

// 결정 3가지 (R7). 값은 DATA-MODEL.md privacy_detection.decision 그대로
const PRIVACY_CHOICES = [
  { value: '삭제', title: '지울게요', body: '답변에서 이 부분을 지워요. 문장이 어색해지면 작성 화면에서 고쳐 주세요.' },
  { value: '검토 제외', title: 'AI에게는 가릴게요', body: '답변에는 남기고, AI 검토에는 보내지 않아요.' },
  { value: '유지', title: '그대로 둘게요', body: '답변에 남기고 AI 검토에도 그대로 보내요.' },
]

const ERROR_TEXT = {
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
  PRIVACY_UNDECIDED: '아직 정하지 않은 항목이 있어요. 모두 고른 뒤 다시 눌러 주세요.',
}

const CONTEXT = 18

// 답변에서 감지된 부분과 앞뒤 몇 글자를 잘라 보여 준다. 원문은 서버가 주지 않으므로 답변 값에서 자른다
function Snippet({ value, start, end }) {
  const from = Math.max(0, start - CONTEXT)
  const to = Math.min(value.length, end + CONTEXT)
  return (
    <Typography sx={{ wordBreak: 'keep-all', color: ds.text2 }}>
      {from > 0 && '…'}
      {value.slice(from, start)}
      <Box component="mark" sx={{ bgcolor: ds.orangeSoft, color: ds.ink, fontWeight: 700, px: 0.25, borderRadius: 0.5 }}>
        {value.slice(start, end)}
      </Box>
      {value.slice(end, to)}
      {to < value.length && '…'}
    </Typography>
  )
}

/**
 * 개인정보 감지 결정 모달 (F-07, R7)
 * - detections: 결정 전인 감지 [{ id, field_answer_id, start, end, kind }]
 * - answers: 감지 위치를 잘라 보여 줄 답변 [{ id, label, value }]
 * - 고르기 전에는 확인 버튼을 막는다. 미리 골라 두지 않는다(사용자가 직접 정한다).
 * - onConfirm([{ id, decision }]) / onCancel() — 취소하면 검토를 요청하지 않는다
 */
export default function PrivacyDecisionDialog({ open, detections, answers, saving = false, errorCode = null, onConfirm, onCancel }) {
  const fullScreen = useMediaQuery((theme) => theme.breakpoints.down('sm'))
  const [picked, setPicked] = useState({})
  const doneCount = detections.filter((d) => picked[d.id]).length
  const allPicked = detections.length > 0 && doneCount === detections.length

  const pickAll = (decision) => setPicked(Object.fromEntries(detections.map((d) => [d.id, decision])))
  const confirm = () => onConfirm(detections.map((d) => ({ id: d.id, decision: picked[d.id] })))

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onCancel}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      aria-labelledby="privacy-dialog-title"
      aria-describedby="privacy-dialog-desc"
    >
      <DialogTitle id="privacy-dialog-title" sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ display: 'inline-flex', color: ds.orange }}>
            <ShieldIcon size={22} />
          </Box>
          <span>AI에 보내기 전에 확인해 주세요</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography id="privacy-dialog-desc" sx={{ color: ds.text2, wordBreak: 'keep-all' }}>
          답변에서 개인정보로 보이는 부분을 {detections.length}개 찾았어요. 하나씩 어떻게 할지 골라 주세요.
          모두 고르기 전에는 답변을 AI에 보내지 않아요.
        </Typography>

        {detections.length > 1 && (
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Button size="small" color="inherit" onClick={() => pickAll('삭제')} disabled={saving}>
              모두 지울게요
            </Button>
            <Button size="small" color="inherit" onClick={() => pickAll('검토 제외')} disabled={saving}>
              모두 AI에게 가릴게요
            </Button>
          </Stack>
        )}

        <Stack component="ol" spacing={2} sx={{ m: 0, mt: 2, p: 0 }}>
          {detections.map((d, i) => {
            const answer = answers.find((a) => a.id === d.field_answer_id)
            const kind = PRIVACY_KIND[d.kind] ?? { title: '개인정보' }
            const groupLabel = `${i + 1}번째 ${kind.title} 처리 방법`
            return (
              <Box
                component="li"
                key={d.id}
                sx={{
                  listStyle: 'none',
                  p: 2,
                  ...squircle(radius.tile),
                  bgcolor: ds.card,
                  border: `1.5px solid ${picked[d.id] ? ds.line : ds.primaryLine}`,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Pill tone="orange" size="sm">{kind.title}</Pill>
                  {answer && (
                    <Typography sx={{ fontSize: 13, color: ds.muted }}>{answer.label}</Typography>
                  )}
                </Stack>
                {answer && (
                  <Box sx={{ mt: 1 }}>
                    <Snippet value={answer.value ?? ''} start={d.start} end={d.end} />
                  </Box>
                )}
                {kind.hint && <Typography sx={{ fontSize: 13, color: ds.text2, mt: 0.75 }}>{kind.hint}</Typography>}

                <RadioGroup
                  aria-label={groupLabel}
                  value={picked[d.id] ?? ''}
                  onChange={(e) => setPicked((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  sx={{ mt: 1.5, gap: 1 }}
                >
                  {PRIVACY_CHOICES.map((c) => {
                    const checked = picked[d.id] === c.value
                    return (
                      <Box
                        key={c.value}
                        component="label"
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 1,
                          p: 1.25,
                          pr: 2,
                          ...squircle(radius.inner),
                          bgcolor: checked ? ds.primarySoft : ds.white,
                          border: `1px solid ${checked ? ds.primary : ds.line}`,
                          cursor: saving ? 'default' : 'pointer',
                        }}
                      >
                        <Radio value={c.value} size="small" disabled={saving} sx={{ p: 0.5 }} />
                        <Box sx={{ pt: 0.25 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{c.title}</Typography>
                          <Typography sx={{ fontSize: 13, color: ds.text2 }}>{c.body}</Typography>
                        </Box>
                      </Box>
                    )
                  })}
                </RadioGroup>
              </Box>
            )
          })}
        </Stack>

        {errorCode && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {ERROR_TEXT[errorCode] ?? '저장하지 못했어요. 다시 시도해 주세요.'}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13, color: ds.muted, mr: 'auto' }} aria-live="polite">
          {doneCount}/{detections.length}개 골랐어요
        </Typography>
        <Button color="inherit" onClick={onCancel} disabled={saving}>
          검토 받지 않기
        </Button>
        <Button
          variant="contained"
          onClick={confirm}
          disabled={!allPicked || saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {saving ? '저장하고 있어요' : '정했어요, AI 검토 받기'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
