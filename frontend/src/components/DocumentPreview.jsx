import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { pageImageUrl } from '../api/documents.js'
import { ds, radius, squircle } from '../theme.js'

// File 하나에 미리보기 주소(blob:) 하나를 만들어 다시 쓴다. 지우지(revoke) 않는다:
// 예전처럼 useMemo 로 만들고 effect 정리에서 지우면, 개발 모드 StrictMode 가 effect 를 '실행→정리→실행'할 때
// memo 값은 그대로인데 주소만 지워져서 PDF(<object>)가 빈 화면이 됐다 (이미지는 src 를 넣는 즉시 읽어서 우연히 보였음).
// File 은 router.js pendingFiles 에 새로고침 전까지 남아 있으므로 주소를 남겨 둬도 메모리가 더 들지 않는다.
const blobUrls = new WeakMap()
function blobUrlFor(file) {
  let url = blobUrls.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    blobUrls.set(file, url)
  }
  return url
}

// bbox 가 비어 있는 항목({})은 강조 칸을 그리지 않는다 (서버가 L1 bbox 를 못 받으면 {} 로 저장한다)
const hasBox = (f) => ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(f.bbox?.[k]))
const pageOf = (f) => Number(f.bbox?.page) || 1
// 쪽을 더 불러 보는 상한. 서버가 404 대신 다른 이미지를 주더라도 끝없이 부르지 않게 한다
const MAX_PAGES = 30

// 원본 미리보기 + 항목 칸 강조 (US-02 "항목을 누르면 원본의 해당 칸이 강조된다").
// bbox 는 페이지 크기 대비 0~1 비율이라 이미지 크기와 상관없이 % 로 겹쳐 그린다.
// - 서버 원본 페이지 이미지(GET /api/drafts/{id}/document/pages/{page}, api/documents.js pageImageUrl)를 쪽마다 그린다.
//   업로드 직후든 새로고침 뒤든 같은 화면이다. PDF 도 서버가 PNG 로 그려 주므로 칸 강조가 된다.
//   항목 응답에 쪽 수가 없어서, 항목이 있는 마지막 쪽까지 그리고 그다음 쪽을 하나씩 더 불러 본다(404 가 나면 멈춤).
//   1쪽부터 못 불러오면(세션 만료·파일 없음 등) 업로드 직후 메모리에 있는 file 로 대신 보여 준다
//   (이미지는 칸 강조, PDF 는 브라우저 기본 뷰어). 메모리 파일도 없으면 쪽마다 안내 문구가 나온다.
export default function DocumentPreview({ draftId, file, fields, selectedId, onSelect, maxHeight }) {
  const scrollRef = useRef(null)
  const boxRefs = useRef({})
  const [serverFailed, setServerFailed] = useState(false)
  // 원본 이미지가 하나 다 읽힐 때마다 늘린다. 읽히기 전 자리(최소 높이)로 계산한 스크롤 위치를 다시 맞추는 데 쓴다
  const [loadTick, setLoadTick] = useState(0)
  const onPageLoad = useCallback(() => setLoadTick((t) => t + 1), [])

  // 서버 원본을 1쪽부터 못 불러오고 업로드 직후 메모리 파일이 있을 때만 그 파일로 바꾼다
  const source =
    serverFailed && file ? { kind: file.type === 'application/pdf' ? 'pdf' : 'image', url: blobUrlFor(file) } : { kind: 'pages' }

  // 고른 칸이 미리보기 가운데 오도록 미리보기 안에서만 스크롤 (페이지 전체는 움직이지 않음). 여러 쪽이어도 화면 위치로 계산한다
  useEffect(() => {
    const container = scrollRef.current
    const el = boxRefs.current[selectedId]
    if (!container || !el) return
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    container.scrollTo({ top: top - container.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' })
  }, [selectedId, loadTick])

  const registerBox = (id) => (el) => {
    boxRefs.current[id] = el
  }

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
      {source.kind === 'pages' ? (
        <ServerPages
          draftId={draftId}
          fields={fields}
          selectedId={selectedId}
          onSelect={onSelect}
          registerBox={registerBox}
          onPageLoad={onPageLoad}
          // 1쪽부터 실패했고 대신 보여 줄 파일이 있으면 그 파일로 바꾼다
          onFirstPageError={file ? () => setServerFailed(true) : undefined}
        />
      ) : source.kind === 'pdf' ? (
        <>
          <Box
            component="object"
            data={source.url}
            type="application/pdf"
            aria-label="올린 원본 문서"
            sx={{ display: 'block', width: '100%', height: { xs: 360, md: 640 }, ...squircle(radius.inner), bgcolor: 'white' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            PDF는 칸 위치 강조 없이 원본만 보여 드려요.
          </Typography>
        </>
      ) : (
        <PageFrame>
          <Box component="img" src={source.url} alt="올린 원본 문서" onLoad={onPageLoad} sx={{ display: 'block', width: '100%' }} />
          <FieldBoxes fields={fields.filter((f) => pageOf(f) === 1)} selectedId={selectedId} onSelect={onSelect} registerBox={registerBox} />
        </PageFrame>
      )}
    </Box>
  )
}

// 서버 원본 쪽들. 1쪽 ~ (항목이 있는 마지막 쪽) 은 꼭 그리고, 그 뒤 쪽은 하나씩 더 불러 본다.
// 더 불러 보는 쪽도 같은 ServerPage(같은 key)로 그려 두고 읽힐 때까지 숨긴다 → 읽히면 그대로 보여서 같은 쪽을 두 번 받지 않는다
function ServerPages({ draftId, fields, selectedId, onSelect, registerBox, onPageLoad, onFirstPageError }) {
  const lastFieldPage = Math.min(MAX_PAGES, Math.max(1, ...fields.map(pageOf)))
  const [foundPages, setFoundPages] = useState(0)
  const [probeDone, setProbeDone] = useState(false)
  const pageCount = Math.max(lastFieldPage, foundPages)
  const probe = !probeDone && pageCount < MAX_PAGES ? pageCount + 1 : null
  const pages = Array.from({ length: probe ?? pageCount }, (_, i) => i + 1)

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {pages.map((page) => {
        const probing = page === probe
        return (
          <ServerPage
            key={page}
            url={pageImageUrl(draftId, page)}
            page={page}
            hidden={probing}
            showLabel={pageCount > 1}
            fields={fields.filter((f) => pageOf(f) === page)}
            selectedId={selectedId}
            onSelect={onSelect}
            registerBox={registerBox}
            onLoad={() => {
              if (probing) setFoundPages(page)
              onPageLoad()
            }}
            onError={() => {
              if (probing) setProbeDone(true)
              else if (page === 1) onFirstPageError?.()
            }}
          />
        )
      })}
    </Box>
  )
}

function ServerPage({ url, page, hidden, showLabel, fields, selectedId, onSelect, registerBox, onLoad, onError }) {
  const [state, setState] = useState('loading')
  return (
    <Box sx={hidden ? { display: 'none' } : undefined} aria-hidden={hidden || undefined}>
      {showLabel && (
        <Typography variant="caption" sx={{ display: 'block', color: ds.text2, mb: 0.75, fontWeight: 600 }}>
          {page}쪽
        </Typography>
      )}
      <PageFrame>
        <Box
          component="img"
          src={url}
          alt={`올린 원본 ${page}쪽`}
          onLoad={() => {
            setState('ready')
            onLoad()
          }}
          onError={() => {
            setState('error')
            onError()
          }}
          sx={{ display: state === 'error' ? 'none' : 'block', width: '100%', minHeight: state === 'ready' ? 0 : 320 }}
        />
        {state === 'loading' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={28} aria-label={`원본 ${page}쪽 불러오는 중`} />
          </Box>
        )}
        {state === 'error' ? (
          <Typography role="status" sx={{ color: ds.text2, textAlign: 'center', py: 6, px: 2 }}>
            원본 {page}쪽을 불러오지 못했어요. 새로고침하거나 잠시 후 다시 열어 주세요.
          </Typography>
        ) : (
          <FieldBoxes fields={fields} selectedId={selectedId} onSelect={onSelect} registerBox={registerBox} />
        )}
      </PageFrame>
    </Box>
  )
}

function PageFrame({ children }) {
  return (
    <Box
      sx={{ position: 'relative', maxWidth: { xs: 560, lg: 'none' }, mx: 'auto', bgcolor: 'white', ...squircle(radius.inner), overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      {children}
    </Box>
  )
}

// 한 쪽 위에 겹치는 항목 칸들. 누르면 그 항목을 고른다 (목록 쪽에서 같은 동작을 키보드로 할 수 있어 aria-hidden)
function FieldBoxes({ fields, selectedId, onSelect, registerBox }) {
  return fields.filter(hasBox).map((f) => {
    const selected = f.id === selectedId
    return (
      <Box
        key={f.id}
        ref={registerBox(f.id)}
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
          bgcolor: selected ? 'rgba(65,105,214,0.18)' : 'transparent',
          // 바깥 그림자는 스쿼클 대체(clip-path)에서 잘리므로 안쪽 테두리로
          boxShadow: selected ? `inset 0 0 0 2px ${ds.primary}` : 'none',
          '&:hover': { bgcolor: selected ? 'rgba(65,105,214,0.18)' : 'rgba(65,105,214,0.08)' },
        }}
      />
    )
  })
}
