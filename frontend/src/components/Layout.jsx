import { AppBar, Box, Container, Toolbar, Typography } from '@mui/material'

export default function Layout({ onHome, children }) {
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
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  )
}
