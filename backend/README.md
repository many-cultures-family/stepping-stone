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

#### 문서 인식(OCR) 참고

- 문서 인식(`POST /api/drafts/{id}/document:recognize`)은 EasyOCR을 씁니다. PyTorch가 같이 설치되어 용량이 약 1GB입니다.
- 처음 인식할 때 모델(약 95MB)을 `~/.EasyOCR/`에 내려받습니다. 첫 요청은 모델 로딩까지 20초 넘게 걸릴 수 있고, 그 뒤로는 1쪽에 1~3초 정도입니다(Apple Silicon GPU 기준).
- 모델을 받을 때 `SSL: CERTIFICATE_VERIFY_FAILED`가 나면, python.org에서 받은 Python에 인증서가 등록되지 않은 것입니다. 아래 둘 중 하나를 합니다.

```bash
# 방법 1: Python 설치 폴더의 인증서 설치 스크립트 실행 (폴더 이름은 자기 Python 버전으로)
open "/Applications/Python 3.13/Install Certificates.command"
# 방법 2: 가상환경에 certifi를 깔고, 서버를 켜는 셸에서만 그 인증서를 쓰기
pip install certifi
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())")
```

### 4. 서버 실행

FastAPI 앱 객체 `app`은 `backend/app/main.py`에 있습니다.

서버는 `.env` 파일을 스스로 읽지 않으므로, 켜기 전에 셸에서 불러옵니다. 값을 비워 둔 줄(`KEY=`)은 건너뛰어서 기본값을 씁니다.

```bash
set -a; source <(grep -vE '^[[:space:]]*(#|$)|=[[:space:]]*$' .env); set +a
uvicorn app.main:app --reload --port 8080
```

`uvicorn --env-file .env`는 쓰지 않습니다. `python-dotenv`가 필요한데 `requirements.txt`에 없고, 빈 값을 기본값 대신 빈 문자열로 넘깁니다.

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
