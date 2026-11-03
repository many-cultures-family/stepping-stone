## 백엔드 개발 환경 설정

### 기술 스택

| 구분 | 기술 | 용도 |
| --- | --- | --- |
| 언어 | Python | 백엔드 개발 |
| 프레임워크 | FastAPI | API 서버 구현 |
| 서버 실행 | Uvicorn | ASGI 서버 실행 |
| 린트·포맷 | Ruff | 코드 검사 및 포맷팅 |

### 1. 가상환경 생성

프로젝트 최상위 디렉터리에서 실행합니다.

```bash
cd backend
python3 -m venv .venv
```

### 2. 가상환경 활성화

macOS / Linux:

```bash
source .venv/bin/activate
```

### 3. 라이브러리 설치

`requirements.txt`는 `backend/` 안에 있습니다.

```bash
pip install -r requirements.txt
```

### 4. 서버 실행

FastAPI 앱 객체 `app`은 `backend/app/main.py`에 있습니다.

```bash
uvicorn app.main:app --reload --port 8080
```

### 5. API 문서 확인

서버 실행 후 브라우저에서 API 문서를 확인할 수 있습니다.

- API 문서: `http://localhost:8080/docs`
- OpenAPI 스키마: `http://localhost:8080/openapi.json`

### 6. 가상환경 종료

```bash
deactivate
```

### 참고 사항

- `.venv/`는 GitHub에 커밋하지 않습니다.
- 필요한 라이브러리는 `backend/requirements.txt`에서 관리합니다. 공유 파일이라 테크리더만 고칩니다. 추가가 필요하면 PR 댓글로 요청합니다.
- 비밀값은 `backend/.env`에만 둡니다. 변수 이름은 `backend/.env.example`을 봅니다.
- 프론트엔드와의 API 경로 및 요청·응답 형식은 협의 후 확정합니다.
