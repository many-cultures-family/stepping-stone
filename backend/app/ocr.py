# OCR 엔진 (OCR-API.md 항목 1 ①). 엔진 출력을 OcrLine(줄 텍스트 + page + bbox)으로 바꾼다.
# 엔진에 따라 달라지는 부분은 이 파일뿐이다 (OCR-API.md "엔진 출력을 OcrLine으로 바꾸는 부분만 엔진에 따라 달라진다").
# 지금 엔진: EasyOCR (ko+en). 2026-11-23 Apple M3 실측 — 1쪽 GPU(MPS) 약 1~3초, CPU 약 6초.
#
# 여기서 나온 줄은 가리기 전 원문이다. 저장·로그·응답에 쓰지 말고 바로 privacy.mask_ocr_lines에 넘긴다 (R8).
import threading

from app.privacy import OcrLine

# PDF를 이미지로 바꿀 해상도. 200dpi에서 A4 한국어 신청서 글자를 충분히 읽었다 (실측)
PDF_DPI = 200
# 같은 행으로 볼 박스 중심 높이 차 (쪽 높이 비율). 표의 라벨 칸과 값 칸이 박스 따로 나오므로
# 같은 행끼리 한 줄로 합쳐야 마스킹 라벨 규칙("성명 홍길동")이 값을 잡는다
ROW_TOLERANCE = 0.012

_reader = None
_reader_lock = threading.Lock()


class OcrError(Exception):
    """파일을 읽거나 엔진을 돌리지 못했다. 메시지에 문서 내용을 넣지 않는다."""


def _get_reader():
    # 모델 로딩이 무거워(처음 약 2초, 첫 실행은 모델 95MB 다운로드) 한 번만 만든다
    global _reader
    with _reader_lock:
        if _reader is None:
            import easyocr
            import torch

            # Apple Silicon이면 MPS(GPU), CUDA면 CUDA, 아니면 CPU (EasyOCR이 gpu=True에서 고른다)
            use_gpu = torch.backends.mps.is_available() or torch.cuda.is_available()
            _reader = easyocr.Reader(["ko", "en"], gpu=use_gpu, verbose=False)
        return _reader


def _page_images(file_path, mime_type):
    """쪽마다 회색조 numpy 배열. 이미지는 1쪽, PDF는 쪽마다 렌더링한다."""
    import numpy as np

    if mime_type == "application/pdf":
        import pymupdf

        with pymupdf.open(file_path) as doc:
            for page in doc:
                pix = page.get_pixmap(dpi=PDF_DPI, colorspace=pymupdf.csGRAY)
                yield np.frombuffer(pix.samples, np.uint8).reshape(
                    pix.height, pix.width
                )
    else:
        from PIL import Image

        with Image.open(file_path) as img:
            yield np.array(img.convert("L"))


def _to_boxes(results, page_no, width, height):
    """EasyOCR (4점 박스, 글자, 신뢰도) → OcrLine. bbox는 DATA-MODEL form_field.bbox와 같은 0~1 비율."""
    boxes = []
    for points, text, _confidence in results:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        boxes.append(
            OcrLine(
                text=text,
                page=page_no,
                bbox={
                    "x": min(xs) / width,
                    "y": min(ys) / height,
                    "w": (max(xs) - min(xs)) / width,
                    "h": (max(ys) - min(ys)) / height,
                },
            )
        )
    return boxes


def merge_rows(boxes):
    """같은 높이의 박스를 위→아래, 행 안에서는 왼→오 순서로 한 줄로 합친다.

    문서가 살짝 기울어도 라벨이 값보다 앞에 오도록 행을 먼저 묶고 그 안에서 x로 정렬한다.
    """
    groups = []  # [page, 첫 박스 중심 y, [OcrLine]]
    for box in sorted(boxes, key=lambda b: (b.page, b.bbox["y"] + b.bbox["h"] / 2)):
        cy = box.bbox["y"] + box.bbox["h"] / 2
        if (
            groups
            and groups[-1][0] == box.page
            and abs(groups[-1][1] - cy) < ROW_TOLERANCE
        ):
            groups[-1][2].append(box)
        else:
            groups.append([box.page, cy, [box]])

    lines = []
    for page, _, parts in groups:
        parts.sort(key=lambda b: b.bbox["x"])
        x0 = min(b.bbox["x"] for b in parts)
        y0 = min(b.bbox["y"] for b in parts)
        x1 = max(b.bbox["x"] + b.bbox["w"] for b in parts)
        y1 = max(b.bbox["y"] + b.bbox["h"] for b in parts)
        lines.append(
            OcrLine(
                text=" ".join(b.text for b in parts),
                page=page,
                bbox={
                    "x": round(x0, 3),
                    "y": round(y0, 3),
                    "w": round(x1 - x0, 3),
                    "h": round(y1 - y0, 3),
                },
            )
        )
    return lines


def recognize(file_path, mime_type):
    """파일을 읽어 (줄 목록, 글자가 하나도 없는 쪽 번호 목록)을 돌려준다.

    쪽 번호는 1부터. 읽을 수 없는 파일이면 OcrError.
    """
    try:
        reader = _get_reader()
        boxes, empty_pages = [], []
        for page_no, image in enumerate(_page_images(file_path, mime_type), start=1):
            results = reader.readtext(image)
            if not results:
                empty_pages.append(page_no)
            height, width = image.shape[:2]
            boxes += _to_boxes(results, page_no, width, height)
    except Exception as exc:  # noqa: BLE001 — PDF·이미지 라이브러리와 엔진이 여러 종류의 예외를 낸다
        # 깨진 파일·엔진 오류. 원인 종류만 남기고 내용은 남기지 않는다
        raise OcrError(type(exc).__name__) from None
    return merge_rows(boxes), empty_pages
