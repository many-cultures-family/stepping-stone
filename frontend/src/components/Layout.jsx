import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'

export default function Layout({ onHome, onLoginClick, children }) {
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
          <Button color="inherit" onClick={onLoginClick}>
            로그인
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  )
}
