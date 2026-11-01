# 디딤돌

항목 검증 + LLM/번역기 풀이 + LLM 수정 제안을 제공하는 웹 서비스.
기술 스택 근거는 `docs/STACK.md` (A안: React + FastAPI).

## 폴더 구조

```
DIDIMDOL/
  frontend/   # React(Vite) 화면 (실행 방법은 frontend/README.md)
  backend/    # FastAPI 서버
  tests/      # 서버 테스트 (pytest)
```

## 버전 선정

설치는 모두 Homebrew로 한다.

| 구분 | 도구 | 버전 | 비고 |
| --- | --- | --- | --- |
| 화면 | Node.js | 24 LTS | `brew install node@24` |
| 화면 | Vite | 8.3.4 | `package.json`에 정확히 고정 |
| 화면 | React | 19.3 | 19.3.1 설치, 정확히 고정 |
| 화면 | MUI | 9.5 | 9.5.0 설치, 정확히 고정. Mantine은 쓰지 않는다 |
| 서버 | Python | 3.14 | |
| 서버 | FastAPI | 0.162.0 | |
| 서버 | Uvicorn | 0.54.0 | 서버는 Uvicorn으로 실행 |

## 개발 환경 결정

| 항목 | 결정 |
| --- | --- |
| 화면 언어 | JavaScript (TypeScript 쓰지 않음) |
| UI 도구 | MUI로 확정, Mantine 제외 |
| 화면 패키지 관리 | npm. `package-lock.json`을 커밋한다 |
| 포트 | 서버 8080, Vite 5173 |
| 서버 연결 | Vite proxy 사용 (`/api` → `http://localhost:8080`) |
| 서버 실행 | Uvicorn |
| 서버 린트·포맷 | ruff 하나로 둘 다 |
| 화면 린트 | Vite 템플릿 기본 ESLint만 그대로 사용 |
| 화면 포맷 | Prettier는 구성하지 않는다 |
| 테스트 | 서버는 지금 넣고, 화면 테스트는 나중에 넣는다 |
| Python venv 위치 | 백엔드 폴더 루트 (`backend/`) |
| `.gitignore` | 그대로 둔다 |

## 통합 실행

서버(8080)와 화면(5173)을 터미널 두 개에서 각각 띄운다. 아래 명령은 모두 프로젝트 루트 기준이다.

### 처음 한 번만: 설치

코드 블록은 그대로 복사해 붙여넣을 수 있도록 주석을 넣지 않았다.

1. Python 3.14, Node 24 설치. `node@24`는 Homebrew가 PATH에 자동으로 연결하지 않으므로 직접 연결한다. 다른 버전의 `node`가 이미 연결돼 있으면 `brew unlink node`를 먼저 실행한다.

```bash
brew install python@3.14 node@24
brew link --overwrite node@24
node -v
```

`node -v`가 `v24.x`로 나오면 된다.

2. 서버 라이브러리 설치. venv는 `backend/` 안에 만든다.

```bash
python3.14 -m venv backend/.venv
backend/.venv/bin/pip install -r requirements.txt
```

3. 화면 라이브러리 설치와 환경 변수 파일 복사. 실서버에 붙이려면 `frontend/.env.local`에서 `VITE_USE_MOCK=false`로 바꾼다.

```bash
cd frontend
npm install
cp .env.example .env.local
cd ..
```

### 터미널 1: 서버

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8080
```

`http://localhost:8080/health`가 `{"status": "ok"}`를 돌려주면 정상. API 문서는 `http://localhost:8080/docs`.

### 터미널 2: 화면

```bash
cd frontend
npm run dev
```

브라우저에서 `http://localhost:5173`을 연다. `/api` 요청은 Vite proxy가 8080 서버로 넘긴다.

### 테스트·린트

프로젝트 루트에서 실행한다. `pytest.ini`가 `backend/`를 import 경로에 넣어 준다.

서버 테스트(`tests/`)와 서버 린트·포맷:

```bash
source backend/.venv/bin/activate
pytest
ruff check backend tests
ruff format backend tests
```

화면 린트:

```bash
cd frontend
npm run lint
```

자세한 내용은 [frontend/README.md](frontend/README.md), [backend/README.md](backend/README.md) 참고.
