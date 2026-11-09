import { useContext } from 'react'
import { AuthContext } from './auth-context.js'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있어요')
  return ctx
}
