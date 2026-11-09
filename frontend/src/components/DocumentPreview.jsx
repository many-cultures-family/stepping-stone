import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { USE_MOCK } from '../api/client.js'
import { documentUrl } from '../api/fields.js'
import { ds, radius, squircle } from '../theme.js'

// 원본 미리보기 + 항목 칸 강조 (US-02 "항목을 누르면 원본의 해당 칸이 강조된다").
// bbox 는 페이지 크기 대비 0~1 비율이라 이미지 크기와 상관없이 % 로 겹쳐 그린다.
// PDF 는 새 의존성(pdf.js) 없이 브라우저 기본 뷰어로만 보여 주므로 칸 강조를 하지 않는다.
export default function DocumentPreview({ draftId, file, fields, selectedId, onSelect, maxHeight }) {
  const scrollRef = useRef(null)
  const pageRef = useRef(null)
  const boxRefs = useRef({})
  const [imageFailed, setImageFailed] = useState(false)

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl])

  const source = file
    ? { kind: file.type === 'application/pdf' ? 'pdf' : 'image', url: fileUrl }
    : USE_MOCK || imageFailed
      ? { kind: 'sample' }
      : { kind: 'image', url: documentUrl(draftId) }

  // 고른 칸이 미리보기 가운데 오도록 미리보기 안에서만 스크롤 (페이지 전체는 움직이지 않음)
  useEffect(() => {
    const container = scrollRef.current
    const el = boxRefs.current[selectedId]
    if (!container || !el || !pageRef.current) return
    const top = pageRef.current.offsetTop + el.offsetTop
    container.scrollTo({ top: top - container.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' })
  }, [selectedId])

  const page1 = fields.filter((f) => (f.bbox?.page ?? 1) === 1)

  return (
    <Box
      ref={scrollRef}
      sx={{
        position: 'relative',
        bgcolor: ds.card,
        ...squircle(radius.hero),
        p: { xs: 2, md: 3 },
        maxHeight,
        overflowY: 'auto',
      }}
    >
      {source.kind === 'pdf' ? (
        <Box
          component="object"
          data={source.url}
          type="application/pdf"
          aria-label="올린 원본 문서"
          sx={{ display: 'block', width: '100%', height: { xs: 360, md: 640 }, ...squircle(radius.inner), bgcolor: 'white' }}
        />
      ) : (
        <Box
          ref={pageRef}
          sx={{ position: 'relative', maxWidth: { xs: 560, lg: 'none' }, mx: 'auto', bgcolor: 'white', ...squircle(radius.inner), overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        >
          {source.kind === 'sample' ? (
            <SampleForm fields={page1} />
          ) : (
            <Box
              component="img"
              src={source.url}
              alt="올린 원본 문서"
              onError={() => setImageFailed(true)}
              sx={{ display: 'block', width: '100%' }}
            />
          )}

          {page1.map((f) => {
            const selected = f.id === selectedId
            return (
              <Box
                key={f.id}
                ref={(el) => {
                  boxRefs.current[f.id] = el
                }}
                onClick={() => onSelect(f.id)}
                aria-hidden
                sx={{
                  position: 'absolute',
                  left: `${f.bbox.x * 100}%`,
                  top: `${f.bbox.y * 100}%`,
                  width: `${f.bbox.w * 100}%`,
                  height: `${f.bbox.h * 100}%`,
                  ...squircle(6),
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                  bgcolor: selected ? 'rgba(49,130,246,0.18)' : 'transparent',
                  // 바깥 그림자는 스쿼클 대체(clip-path)에서 잘리므로 안쪽 테두리로
                  boxShadow: selected ? `inset 0 0 0 2px ${ds.primary}` : 'none',
                  '&:hover': { bgcolor: selected ? 'rgba(49,130,246,0.18)' : 'rgba(49,130,246,0.08)' },
                }}
              />
            )
          })}
        </Box>
      )}

      {source.kind === 'pdf' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          PDF는 칸 위치 강조 없이 원본만 보여 드려요.
        </Typography>
      )}
    </Box>
  )
}

// 목 모드에서 파일 없이 들어왔을 때 보여 줄 샘플 서식 (A4 비율). 실제 개인정보는 없다.
function SampleForm({ fields }) {
  const W = 1000
  const H = 1414
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="샘플 신청서">
      <rect width={W} height={H} fill="#fff" />
      <text x={W / 2} y={110} textAnchor="middle" fontSize="44" fontWeight="700" fill={ds.ink}>
        외국인 등록 신청서
      </text>
      <text x={W / 2} y={165} textAnchor="middle" fontSize="22" fill={ds.muted}>
        APPLICATION FOR ALIEN REGISTRATION (샘플)
      </text>
      {fields.map((f) => {
        const x = f.bbox.x * W
        const y = f.bbox.y * H
        const w = f.bbox.w * W
        const h = f.bbox.h * H
        return (
          <g key={f.id}>
            <rect x={x} y={y} width={w} height={h} fill="none" stroke={ds.lineStrong} strokeWidth="2" />
            <rect x={x} y={y} width={Math.min(170, w * 0.4)} height={h} fill={ds.card} stroke={ds.lineStrong} strokeWidth="2" />
            <text x={x + 14} y={y + 34} fontSize="22" fill={ds.text2}>
              {f.label}
            </text>
          </g>
        )
      })}
      <text x={80} y={H - 60} fontSize="20" fill={ds.muted}>
        * 이 화면은 개발용 샘플 서식입니다.
      </text>
    </svg>
  )
}
