# OCR 엔진 선정 기록

- 작성: 석준영 (sjy0128) · 2026-11-23
- 스택 결정의 원본은 AI-plan 저장소 `docs/STACK.md` "OCR 엔진 선정" 절이다. 이 문서는 코드 쪽에서 바로 볼 수 있게 같은 결과와 코드 위치를 적는다.

## 결정

| 항목 | 내용 |
| --- | --- |
| 선정 엔진 | **EasyOCR 1.7.2**, 언어 `ko` + `en` |
| 고르지 않은 엔진 | PaddleOCR (같은 조건으로 비교 실행하지 않음. 아래 "남은 것") |
| PDF 처리 | `pymupdf 2.1`로 쪽마다 200dpi 회색조 이미지로 바꾼 뒤 인식. PNG·JPG는 그대로 인식 |
| 실행 장치 | Apple Silicon이면 GPU(MPS), 아니면 CPU (`torch.backends.mps.is_available()`) |
| 의존성 크기 | `easyocr` 설치 때 PyTorch가 같이 깔려 약 1GB. 모델 파일 약 95MB는 첫 실행 때 `~/.EasyOCR/`에 받는다 (저장소에 올리지 않음) |

## Apple Silicon 실측 (석준영 Mac, Apple M3, 2026-11-23, 가짜 데이터)

| 항목 | 결과 |
| --- | --- |
| 설치 | `pip install -r backend/requirements.txt`로 arm64에서 설치·실행됨 |
| 첫 요청 | 모델 다운로드·로딩 때문에 20초 넘게 걸림 (그 뒤로는 서버가 켜져 있는 동안 다시 불러오지 않음) |
| 1쪽 인식 | GPU(MPS) 약 1~3초, CPU 약 6초 |
| 인식 결과 | 가짜 신청서·빈 동의서에서 한국어 라벨·날짜줄·`(인)`을 읽음. 체크 상자 `□`는 `다`·`n`·`더` 같은 글자로 잘못 읽음 |
| 알려진 문제 | python.org에서 받은 Python은 모델을 받을 때 `SSL: CERTIFICATE_VERIFY_FAILED`가 날 수 있다 (해결 방법은 `backend/README.md` "문서 인식(OCR) 참고") |

## EasyOCR이 주는 것과 안 주는 것

| 준다 | 안 준다 → 우리가 보완한 곳 |
| --- | --- |
| 글자 덩어리마다 네 꼭짓점 위치, 글자, 신뢰도 | 표 구조(행·열) → 박스를 같은 줄끼리 합침 (`backend/app/ocr.py` `merge_rows`) |
| | 빈 칸·체크 상자·밑줄 위치 → 원본 그림에서 선·상자 모양을 찾음 (`backend/app/layout.py`, OpenCV는 EasyOCR이 같이 설치) |
| | 글자 기울기 각도 |
| | 오인식 교정 → 숫자 속 `O`·`l` 바꾸기, 라벨 뒤 값 통째로 가리기 (`backend/app/privacy.py`) |

## 코드 위치

- 엔진에 따라 달라지는 코드는 `backend/app/ocr.py` 한 파일이다. 엔진을 바꾸면 이 파일이 `OcrLine`(줄 글자 + 쪽 + 위치)만 같은 모양으로 돌려주면 된다 (AI-plan `docs/api/OCR-API.md`)
- 의존성: `backend/requirements.txt`의 `easyocr==1.7.2`, `pymupdf==2.1`

## 남은 것

- PaddleOCR와 같은 문서로 정확도·속도를 비교하지 않았다. 바꿀 필요가 생기면 `ocr.py`만 바꿔 비교한다
- 스캔본(기울어짐·흐림)은 가짜 신청서 1장으로만 확인했다
