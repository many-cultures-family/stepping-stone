import { useCallback, useEffect, useRef, useState } from 'react'
import { getInputFormats } from '../api/fields.js'
import { clearPriorInfo, getPriorInfo, savePriorInfo } from '../api/priorInfo.js'

// 사전 정보 화면(F-03)에 저장된 값을 불러오고 저장하는 훅. 저장하면 값을 다시 불러와 화면을 새로 그린다(App 의 key).
// '다시 시도'를 연타하거나 불러오기·저장이 겹치면 늦게 온 옛 응답이 최신 상태를 덮어쓸 수 있다.
// 요청마다 번호를 매기고 마지막 요청의 응답만 반영한다(언마운트 뒤 응답도 버린다).
export function usePriorInfo() {
  const [state, setState] = useState({ loaded: false, savedInfo: {}, status: 'idle', errorCode: null })
  const latest = useRef(0)
  // 형식 검사 규칙 (GET /api/input-formats). 못 받으면 null → 화면이 기본 규칙으로 검사한다
  const [formats, setFormats] = useState(null)

  useEffect(() => {
    let cancelled = false
    getInputFormats()
      .then((res) => !cancelled && setFormats(res?.formats ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    const id = ++latest.current
    try {
      const savedInfo = await getPriorInfo()
      if (id !== latest.current) return
      setState({ loaded: true, savedInfo, status: 'idle', errorCode: null })
    } catch (e) {
      if (id !== latest.current) return
      setState({ loaded: true, savedInfo: {}, status: 'error', errorCode: e?.code ?? 'UNKNOWN' })
    }
  }, [])

  useEffect(() => {
    // 처음 한 번만 불러온다
    load()
    return () => {
      latest.current += 1
    }
  }, [load])

  const save = useCallback(async (values) => {
    const id = ++latest.current
    setState((s) => ({ ...s, status: 'saving', errorCode: null }))
    try {
      const savedInfo = await savePriorInfo(values)
      if (id !== latest.current) return
      setState({ loaded: true, savedInfo, status: 'idle', errorCode: null })
    } catch (e) {
      if (id !== latest.current) return
      setState((s) => ({ ...s, status: 'error', errorCode: e?.code ?? 'UNKNOWN' }))
    }
  }, [])

  const clear = useCallback(async () => {
    const id = ++latest.current
    setState((s) => ({ ...s, status: 'saving', errorCode: null }))
    try {
      await clearPriorInfo()
      if (id !== latest.current) return
      setState({ loaded: true, savedInfo: {}, status: 'idle', errorCode: null })
    } catch (e) {
      if (id !== latest.current) return
      setState((s) => ({ ...s, status: 'error', errorCode: e?.code ?? 'UNKNOWN' }))
    }
  }, [])

  return { ...state, formats, save, clear, retry: load }
}
