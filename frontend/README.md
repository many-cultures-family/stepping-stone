# 디딤돌 프론트엔드

React(Vite) + MUI, JavaScript. 기술 스택 근거는 [AI-service 레포의 STACK.md](https://github.com/many-cultures-family/AI-service/blob/main/docs/STACK.md) (A안: React + FastAPI).

## 버전 선정

설치는 모두 Homebrew로 한다.

| 구분 | 도구 | 버전 | 비고 |
| --- | --- | --- | --- |
| 화면 | Node.js | 24 LTS | `brew install node@24` |
| 화면 | Vite | 8.3.4 | `package.json`에 정확히 고정 |
| 화면 | React | 19.3 | 19.3.1 설치, 정확히 고정 |
| 화면 | MUI | 9.5 | 9.5.0 설치, 정확히 고정. Mantine은 쓰지 않는다 |
| 서버 | Python | 3.14 | 백엔드 담당 |
| 서버 | FastAPI | 0.162.0 | 백엔드 담당 |
| 서버 | Uvicorn | 0.54.0 | 서버는 Uvicorn으로 실행 |

## 개발 환경 결정

| 항목 | 결정 |
| --- | --- |
| 언어 | JavaScript (TypeScript 쓰지 않음) |
| 패키지 관리 | npm. `package-lock.json`을 커밋한다 |
| 포트 | Vite 5173, 서버 8080 |
| 서버 연결 | Vite proxy 사용. `/api` 요청을 `http://localhost:8080`으로 넘긴다 |
| 린트 | Vite 템플릿 기본 ESLint만 그대로 사용 |
| 포맷 | Prettier는 구성하지 않는다 |
| 화면 테스트 | 서버는 지금 넣고, 화면 테스트는 나중에 추가한다 |
| `.gitignore` | Vite 템플릿 기본 그대로 둔다 |
| Python venv 위치 | 백엔드 폴더 루트 (서버 담당) |
| 서버 린트·포맷 | ruff 하나로 둘 다 (서버 담당) |

## 실행

```bash
brew install node@24
npm install
cp .env.example .env.local
npm run dev
```

개발 서버는 `http://localhost:5173`에서 열린다.

- `VITE_USE_MOCK=true`: 작성 목록·업로드·입력 항목·사전 정보·답변 검토를 `src/mocks` 목데이터로 처리한다. **로그인(Google)은 목이 없고 항상 백엔드를 쓴다**(`/api`는 FastAPI `VITE_API_PROXY_TARGET`, 기본 `http://localhost:8080`로 프록시).
- `VITE_USE_MOCK=false`: 위 기능도 실서버를 쓴다. 사전 정보·답변 검토는 서버 API가 없어 화면이 열리지 않는다.

```bash
npm run lint    # ESLint
npm run build   # 배포용 빌드 확인
```

## 규칙

- **LLM(Gemini) 호출과 API 키는 프론트에 두지 않는다.** `VITE_` 값은 브라우저에 노출된다. 키는 백엔드 `.env`에만.
- AI 수정 제안은 **제안으로만** 보여 준다. 반영은 사용자가 누른 뒤 서버가 검증해서 결정한다.
- 화면에 보이는 개인정보 값은 서버에서 마스킹된 값을 그대로 쓴다.
- 화면 코드는 `src/api/*` 함수만 호출한다. API 형식이 바뀌면 `src/api`만 고친다.

## 구조

```
src/
  main.jsx            # MUI ThemeProvider
  App.jsx             # 화면 전환 (경로: router.js)
  router.js           # 아주 작은 경로 처리
  theme.js            # MUI 테마
  api/                # 서버 호출 (auth, drafts, fields, documents, client)
  auth/               # 로그인 상태 컨텍스트, 로그인 오류 문구
  components/         # 공통 화면 조각 (머리 영역, 입력 항목 줄, 원본 미리보기 등)
  pages/              # 랜딩, 업로드, 내 작성 목록, 입력 항목 확인
```

## 확인 필요

- API 엔드포인트 경로·요청/응답 형식 (`src/api/documents.js` 주석 참고) — 백엔드와 확정
- 풀이 지원 언어 목록 (`src/pages/ResultPage.jsx`의 `LANGUAGES`)
