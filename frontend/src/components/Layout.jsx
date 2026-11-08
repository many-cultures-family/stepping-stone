import { useState } from 'react'
import { AppBar, Box, Button, Container, MenuItem, Select, Toolbar, Typography } from '@mui/material'
import { useAuth } from '../auth/useAuth.js'
import { logout, startGoogleLogin, updateLanguage } from '../api/auth.js'

// LOGIN-API.md "화면 약속": 모든 화면 공통 머리 영역.
// 비로그인 = 'Google로 로그인' 버튼만 / 로그인 = email, 언어 선택, 로그아웃 버튼.
const LANGUAGE_LABELS = { ko: '한국어', vi: 'Tiếng Việt', zh: '中文', en: 'English' }

export default function Layout({ onHome, children }) {
  const { status, user, refresh, setLoggedOut, setUser } = useAuth()
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    setBusy(true)
    try {
      await startGoogleLogin()
      // 실제 모드는 페이지 이동으로 끝나 아래 줄까지 오지 않는다. mock 모드에서만 의미 있음.
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    try {
      await logout()
      setLoggedOut()
    } finally {
      setBusy(false)
    }
  }

  async function handleLanguageChange(e) {
    const language = e.target.value
    try {
      const { user: updated } = await updateLanguage(language)
      setUser(updated)
    } catch {
      // 실패해도 화면 언어 표시는 그대로 둔다 (헤더에는 별도 오류 문구를 두지 않음).
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography
            variant="h6"
            onClick={onHome}
            sx={{ cursor: 'pointer', fontWeight: 700 }}
          >
            디딤돌
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {status === 'authenticated' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">{user.email}</Typography>
              <Select
                size="small"
                variant="standard"
                value={user.language}
                onChange={handleLanguageChange}
                disableUnderline
                sx={{ color: 'inherit', '& .MuiSelect-icon': { color: 'inherit' } }}
              >
                {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                  <MenuItem key={code} value={code}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
              <Button color="inherit" disabled={busy} onClick={handleLogout}>
                로그아웃
              </Button>
            </Box>
          )}
          {status === 'anonymous' && (
            <Button color="inherit" disabled={busy} onClick={handleLogin}>
              Google로 로그인
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  )
}
