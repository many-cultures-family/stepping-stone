import { useRef, useState } from 'react'
import { Box, Button, Drawer, MenuItem, Select, Snackbar, Stack, Typography } from '@mui/material'
import { logout, startGoogleLogin, updateLanguage } from '../api/auth.js'
import { loginErrorText } from '../auth/loginErrors.js'
import { useAuth } from '../auth/useAuth.js'
import useActiveSection from '../hooks/useActiveSection.js'
import useScrollState from '../hooks/useScrollState.js'
import { navigate, usePath } from '../router.js'
import { ds, layout, radius, squircle } from '../theme.js'
import BrandMark from './BrandMark.jsx'
import { ArrowIcon, CloseIcon, MenuIcon, UploadIcon } from './icons.jsx'
import { Link, RoundButton } from './ui.jsx'

const MENU = [
  { id: 'about', label: '서비스 소개' },
  { id: 'how', label: '이용 방법' },
  { id: 'safety', label: '개인정보 보호' },
]

export function Logo({ size = 34 }) {
  return (
    <Link to="/" aria-label="디딤돌 처음으로" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
      <BrandMark size={size} />
      <Typography component="span" sx={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: ds.ink }}>
        디딤돌
      </Typography>
    </Link>
  )
}

// LOGIN-API.md "화면 약속": 모든 화면 공통 머리 영역.
// 비로그인 = 'Google로 로그인' 버튼만 / 로그인 = email, 언어 선택, 로그아웃 버튼.
const LANGUAGE_LABELS = { ko: '한국어', vi: 'Tiếng Việt', zh: '中文', en: 'English' }

function AuthControls({ compact }) {
  const { status, user, setLoggedOut, setUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  async function handleLogin() {
    setBusy(true)
    try {
      // 서버가 구글 로그인 화면으로 페이지를 이동시키므로 이 아래는 이동 실패(오류)일 때만 온다
      await startGoogleLogin()
    } catch (e) {
      setToast(loginErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    try {
      await logout()
      setLoggedOut()
    } catch (e) {
      setToast(e?.code === 'NETWORK_ERROR' ? '서버 연결 실패. 잠시 후 다시 시도해 주세요.' : '로그아웃하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLanguageChange(e) {
    try {
      const { user: updated } = await updateLanguage(e.target.value)
      setUser(updated)
    } catch (e) {
      // 401은 머리 영역까지 비로그인으로 맞춘다. 그 밖의 오류는 화면 언어 표시를 그대로 두고 짧게 알린다.
      if (e?.code === 'LOGIN_REQUIRED') {
        setLoggedOut()
        return
      }
      setToast(e?.code === 'LANGUAGE_NOT_ALLOWED' ? '지원하지 않는 언어예요.' : '언어를 바꾸지 못했어요. 다시 시도해 주세요.')
    }
  }

  const snackbar = (
    <Snackbar
      open={Boolean(toast)}
      autoHideDuration={4000}
      onClose={() => setToast(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 76, sm: 92 } }}
      message={toast}
      slotProps={{
        content: {
          sx: { bgcolor: ds.ink, ...squircle(radius.full), px: 3, fontSize: 14, fontWeight: 500, boxShadow: ds.floatShadow, justifyContent: 'center' },
        },
      }}
    />
  )

  if (status === 'anonymous') {
    return (
      <>
      <Button
        variant="outlined"
        disabled={busy}
        onClick={handleLogin}
        aria-label="Google로 로그인"
        sx={{ minHeight: compact ? 40 : 44, px: { xs: 1.5, sm: 2.5 }, whiteSpace: 'nowrap' }}
      >
        {/* 좁은 화면(폰)에서는 헤더 폭을 넘지 않게 짧게 */}
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          Google로 로그인
        </Box>
        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
          로그인
        </Box>
      </Button>
      {snackbar}
      </>
    )
  }
  if (status !== 'authenticated') return null

  return (
    <>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2" sx={{ display: { xs: 'none', lg: 'block' }, color: ds.text2 }}>
        {user.email}
      </Typography>
      <Select
        size="small"
        variant="standard"
        value={user.language}
        onChange={handleLanguageChange}
        disableUnderline
        aria-label="사용 언어"
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontSize: 14 }}
      >
        {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
          <MenuItem key={code} value={code}>
            {label}
          </MenuItem>
        ))}
      </Select>
      <Button variant="outlined" disabled={busy} onClick={handleLogout} sx={{ minHeight: compact ? 40 : 44, px: { xs: 1.5, sm: 2.5 } }}>
        로그아웃
      </Button>
    </Stack>
    {snackbar}
    </>
  )
}

// 앵커 이동: 랜딩이면 부드럽게 스크롤, 다른 화면이면 랜딩으로 이동한 뒤 스크롤
// scrollIntoView 는 모달(메뉴)이 닫힌 직후 취소되는 경우가 있어 window.scrollTo 로 직접 이동한다
const HEADER_OFFSET = 88
function scrollToSection(id) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: reduce ? 'instant' : 'smooth' })
}

function goSection(id) {
  if (window.location.pathname !== '/') {
    navigate('/')
    // 랜딩이 그려진 뒤 이동
    setTimeout(() => scrollToSection(id), 60)
    return
  }
  scrollToSection(id)
  window.history.replaceState(null, '', `#${id}`)
}

// 로그인했을 때만 보이는 '내 작성 목록' (F-08). 좁은 화면에서는 메뉴 시트에 있다
function MyDraftsLink({ current, compact }) {
  const { status } = useAuth()
  if (status !== 'authenticated') return null
  return (
    <Button
      component={Link}
      to="/drafts"
      aria-current={current ? 'page' : undefined}
      sx={{
        display: { xs: 'none', md: 'inline-flex' },
        minHeight: compact ? 40 : 44,
        px: 2,
        whiteSpace: 'nowrap',
        color: current ? ds.ink : ds.text2,
        fontWeight: current ? 700 : 500,
      }}
    >
      내 작성 목록
    </Button>
  )
}

// 스크롤 상태에 반응하는 헤더
// - 맨 위: 투명, 전체 폭
// - 스크롤 후: 가운데 떠 있는 반투명 스쿼클 바
// - 아래로 내리면 숨고, 위로 올리면 다시 보임 (메뉴가 열려 있으면 숨기지 않음)
export default function SiteHeader() {
  const path = usePath()
  const isLanding = path === '/'
  const { scrolled, hidden: scrollHidden } = useScrollState()
  const active = useActiveSection(MENU.map((m) => m.id), isLanding)
  const [menuOpen, setMenuOpen] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const hidden = scrollHidden && !menuOpen && !focusWithin

  return (
    <>
      <Box
        component="header"
        onFocus={() => setFocusWithin(true)}
        onBlur={() => setFocusWithin(false)}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          px: { xs: 1, md: 2 },
          pt: scrolled ? { xs: 1, md: 1.5 } : 0,
          transform: hidden ? 'translateY(-110%)' : 'none',
          transition: 'transform .35s cubic-bezier(.2,.8,.2,1), padding .3s ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <Box
          sx={{
            maxWidth: layout.container,
            mx: 'auto',
            height: scrolled ? { xs: 56, md: 60 } : { xs: 64, md: 76 },
            px: scrolled ? { xs: 1.5, md: 2.5 } : layout.gutter,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            bgcolor: scrolled ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0)',
            backdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
            WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
            boxShadow: scrolled ? `0 0 0 1px rgba(17,20,24,.06), 0 8px 24px rgba(17,20,24,.08)` : 'none',
            ...squircle(scrolled ? 22 : 0),
            transition: 'all .3s cubic-bezier(.2,.8,.2,1)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          <Box sx={{ pl: scrolled ? 0.5 : 0 }}>
            <Logo size={scrolled ? 30 : 34} />
          </Box>

          <Stack component="nav" aria-label="주요 메뉴" direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
            {MENU.map((m) => {
              const on = active === m.id
              return (
                <Box
                  key={m.id}
                  component="a"
                  href={`/#${m.id}`}
                  aria-current={on ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    goSection(m.id)
                  }}
                  sx={{
                    position: 'relative',
                    px: 2,
                    py: 1,
                    ...squircle(radius.full),
                    fontSize: 14,
                    fontWeight: on ? 700 : 500,
                    color: on ? ds.ink : ds.text2,
                    bgcolor: on ? 'rgba(65,105,214,.08)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all .2s ease',
                    '&:hover': { color: ds.ink, bgcolor: 'rgba(17,20,24,.04)' },
                    '&:focus-visible': { outline: `3px solid ${ds.primaryLine}` },
                  }}
                >
                  {m.label}
                </Box>
              )
            })}
          </Stack>

          <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} sx={{ alignItems: 'center' }}>
            <MyDraftsLink current={path === '/drafts'} compact={scrolled} />
            <Button
              component={Link}
              to="/upload"
              variant="contained"
              color="secondary"
              startIcon={<UploadIcon size={18} />}
              sx={{
                minHeight: scrolled ? 40 : 44,
                px: { xs: 1.25, sm: 2.5 }, minWidth: { xs: 44, sm: 64 },
                '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: 0 },
              }}
              aria-label="서류 올리기"
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                서류 올리기
              </Box>
            </Button>
            <AuthControls compact={scrolled} />
            <RoundButton
              label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
              size={44}
              onClick={() => setMenuOpen(true)}
              sx={{ display: { xs: 'inline-flex', md: 'none' }, bgcolor: scrolled ? 'transparent' : ds.card }}
            >
              <MenuIcon size={22} />
            </RoundButton>
          </Stack>
        </Box>
      </Box>

      <MobileMenu open={menuOpen} active={active} onClose={() => setMenuOpen(false)} />
    </>
  )
}

function MobileMenu({ open, active, onClose }) {
  const { status: authStatus } = useAuth()
  // 닫힘 애니메이션·스크롤 잠금 해제가 끝난 뒤(onExited) 섹션으로 이동한다
  const pending = useRef(null)
  return (
    <Drawer
      anchor="top"
      open={open}
      onClose={onClose}
      disableRestoreFocus
      slotProps={{
        // 위에서 떨어져 떠 있는 시트라 네 모서리 모두 스쿼클
        paper: { sx: { mx: 1, mt: 1, pb: 2, ...squircle(radius.card) } },
        transition: {
          onExited: () => {
            const id = pending.current
            pending.current = null
            // Modal 이 스크롤 잠금을 푸는 작업이 끝난 다음 프레임에 이동
            if (id) setTimeout(() => goSection(id), 30)
          },
        },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2.5, height: 64 }}>
        <Box onClick={onClose}>
          <Logo size={30} />
        </Box>
        <RoundButton label="메뉴 닫기" size={44} onClick={onClose}>
          <CloseIcon size={22} />
        </RoundButton>
      </Stack>
      <Stack component="nav" aria-label="주요 메뉴" sx={{ px: 1.5 }}>
        {MENU.map((m) => (
          <Box
            key={m.id}
            component="a"
            href={`/#${m.id}`}
            onClick={(e) => {
              e.preventDefault()
              pending.current = m.id
              onClose()
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 56,
              px: 2,
              ...squircle(16),
              fontSize: 17,
              fontWeight: active === m.id ? 700 : 500,
              color: active === m.id ? ds.primaryDeep : ds.ink,
              bgcolor: active === m.id ? ds.primarySoft : 'transparent',
              textDecoration: 'none',
              '&:active': { bgcolor: ds.card },
            }}
          >
            {m.label}
            <ArrowIcon size={18} color={ds.muted} />
          </Box>
        ))}
      </Stack>
      <Stack spacing={1} sx={{ px: 2.5, pt: 2 }}>
        {authStatus === 'authenticated' && (
          <Button fullWidth component={Link} to="/drafts" onClick={onClose} variant="outlined" size="large">
            내 작성 목록
          </Button>
        )}
        <Button fullWidth component={Link} to="/upload" onClick={onClose} variant="contained" size="large">
          서류 올리기
        </Button>
      </Stack>
    </Drawer>
  )
}
