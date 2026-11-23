# 원본 페이지에서 '실제로 적는 자리'를 찾는다 (가상 작성 화면이 입력칸을 그 자리에 겹쳐 그린다).
#
# OCR·L1은 글자가 있는 곳만 알려 주므로 form_field.bbox는 '라벨'이나 '그 줄' 자리다. 값을 쓸 자리는
# 원본 그림을 봐야 안다. OpenCV(EasyOCR이 이미 설치함)로 선·상자·글자 덩어리만 보고 계산한다 (글자는 읽지 않는다).
#   - 표 안 칸: 라벨 오른쪽 값 칸 (표 선)                         → input_bbox
#   - 선택형(동의합니다 □ 동의하지 않습니다 □): 줄 안의 □ 상자들 → option_bboxes (options 순서)
#   - 날짜줄('    년   월   일'): 년·월·일 글자 앞 빈자리          → part_bboxes {year, month, day}
#   - 밑줄 칸('성명: ________'): 밑줄 위                          → input_bbox
#   - 서명란('(인)', '(서명 또는 인)'): 그 표시 자리              → input_bbox
# 못 찾으면 None → 화면이 bbox로 자리를 어림한다.
import logging

import numpy as np

logger = logging.getLogger(__name__)

# 선으로 볼 최소 길이 (페이지 폭·높이 대비)
H_LINE_MIN = 1 / 25
V_LINE_MIN = 1 / 60
DARK = 160  # 이 값보다 어두운 픽셀을 선·글자로 본다 (회색조 0~255)


def _line_masks(gray):
    import cv2

    h, w = gray.shape
    dark = (gray < DARK).astype(np.uint8)
    horiz = cv2.morphologyEx(
        dark, cv2.MORPH_OPEN, np.ones((1, max(int(w * H_LINE_MIN), 20)), np.uint8)
    )
    vert = cv2.morphologyEx(
        dark, cv2.MORPH_OPEN, np.ones((max(int(h * V_LINE_MIN), 15), 1), np.uint8)
    )
    return horiz.astype(bool), vert.astype(bool)


def _positions(mask_1d):
    """True가 이어진 구간마다 가운데 위치."""
    idx = np.flatnonzero(mask_1d)
    if idx.size == 0:
        return []
    groups = np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1)
    return [int(g.mean()) for g in groups]


def value_cell(gray, bbox, horiz=None, vert=None):
    """라벨 bbox(0~1 비율) → 값 칸 bbox(0~1 비율) 또는 None."""
    if horiz is None or vert is None:
        horiz, vert = _line_masks(gray)
    h, w = gray.shape
    x0, x1 = int(bbox["x"] * w), int((bbox["x"] + bbox["w"]) * w)
    y0, y1 = int(bbox["y"] * h), int((bbox["y"] + bbox["h"]) * h)
    cy = (y0 + y1) // 2
    if x1 <= x0 or y1 <= y0:
        return None

    # 행 위아래 선: 라벨 가로 범위에서 가로선이 있는 줄
    rows = _positions(horiz[:, x0:x1].any(axis=1))
    above = [r for r in rows if r < y0]
    below = [r for r in rows if r > y1]
    if not above or not below:
        return None
    top, bottom = max(above), min(below)

    # 행 가운데 높이에서 세로선 위치 (라벨 오른쪽만)
    band = vert[max(cy - 2, 0) : cy + 3, :].any(axis=0)
    walls = [c for c in _positions(band) if c > x1]
    if not walls:
        return None
    if len(walls) >= 2:
        left, right = walls[0], walls[1]  # 라벨 칸 | 값 칸 | 다음 선
    else:
        left, right = x1, walls[0]  # 라벨과 값이 한 칸 안에 있음

    pad_x, pad_y = w * 0.006, (bottom - top) * 0.15
    vx0, vx1 = left + pad_x, right - pad_x
    vy0, vy1 = top + pad_y, bottom - pad_y
    if vx1 - vx0 < w * 0.03 or vy1 - vy0 < 4:
        return None
    return {
        "page": bbox.get("page", 1),
        "x": round(vx0 / w, 4),
        "y": round(vy0 / h, 4),
        "w": round((vx1 - vx0) / w, 4),
        "h": round((vy1 - vy0) / h, 4),
    }


def page_gray(file_path, mime_type, page, dpi=150):
    """원본 한 페이지를 회색조 numpy 배열로 (page는 1부터)."""
    if mime_type == "application/pdf":
        import pymupdf

        with pymupdf.open(file_path) as pdf:
            pix = pdf[page - 1].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
            return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width)
    from PIL import Image

    with Image.open(file_path) as img:
        return np.array(img.convert("L"))


def _ratio(x0, y0, x1, y1, w, h, page):
    return {
        "page": page,
        "x": round(x0 / w, 4),
        "y": round(y0 / h, 4),
        "w": round((x1 - x0) / w, 4),
        "h": round((y1 - y0) / h, 4),
    }


def _runs(mask_1d, gap=0):
    """True가 이어진 구간 [(시작, 끝)]. 사이 빈칸이 gap 이하면 한 구간으로 본다."""
    idx = np.flatnonzero(mask_1d)
    if idx.size == 0:
        return []
    cuts = np.flatnonzero(np.diff(idx) > gap + 1)
    starts = np.concatenate(([idx[0]], idx[cuts + 1]))
    ends = np.concatenate((idx[cuts], [idx[-1]]))
    return [(int(a), int(b) + 1) for a, b in zip(starts, ends, strict=True)]


def _checkboxes(dark, x0, y0, x1, y1):
    """영역 안의 빈 네모 상자(□) [(x0, y0, x1, y1)] 왼쪽부터. 네 변이 다 차 있고 안이 빈 덩어리만."""
    import cv2

    sub = dark[y0:y1, x0:x1]
    n, lab, stats, _ = cv2.connectedComponentsWithStats(sub, 8)
    page_w = dark.shape[1]
    out = []
    for i in range(1, n):
        x, y, w, h, _area = stats[i]
        if not (page_w * 0.007 <= w <= page_w * 0.04 and 0.7 <= w / h <= 1.4):
            continue
        m = lab[y : y + h, x : x + w] == i
        edges = (m[0].mean(), m[-1].mean(), m[:, 0].mean(), m[:, -1].mean())
        inner = m[2:-2, 2:-2]
        # 한글 'ㅁ'·'ㅂ'도 네모라 변이 덜 차거나 안에 획이 있다. 진짜 상자는 네 변이 거의 다 찬다
        if min(edges) >= 0.75 and inner.size and inner.mean() < 0.1:
            out.append((x0 + x, y0 + y, x0 + x + w, y0 + y + h))
    return sorted(out)


class _Page:
    """한 페이지의 선·글자 마스크 (칸마다 다시 계산하지 않게)."""

    def __init__(self, gray):
        self.gray = gray
        self.h, self.w = gray.shape
        self.dark = (gray < DARK).astype(np.uint8)
        self.horiz, self.vert = _line_masks(gray)
        # 글자만 (긴 선 뺀 것): 글자 덩어리·줄 높이 계산용
        self.ink = self.dark.astype(bool) & ~self.horiz & ~self.vert

    def band(self, bbox, pad_left=0.03, pad_right=0.12):
        """bbox(L1이 고른 줄 위치, 소수 둘째 자리라 거칠다) 둘레에서 실제 글자 줄을 찾는다.

        → (x0, x1, 글자 위, 글자 아래) 픽셀, 못 찾으면 None
        """
        w, h = self.w, self.h
        x0 = max(int((bbox["x"] - pad_left) * w), 0)
        x1 = min(int((bbox["x"] + bbox["w"] + pad_right) * w), w)
        y0 = max(int((bbox["y"] - 0.01) * h), 0)
        y1 = min(int((bbox["y"] + bbox["h"] + 0.015) * h), h)
        if x1 <= x0 or y1 <= y0:
            return None
        lines = _runs(self.ink[y0:y1, x0:x1].any(axis=1), gap=1)
        lines = [(a, b) for a, b in lines if b - a >= 4]
        if not lines:
            return None
        cy = (bbox["y"] + bbox["h"] / 2) * h - y0
        a, b = min(lines, key=lambda r: abs((r[0] + r[1]) / 2 - cy))
        return x0, x1, y0 + a, y0 + b

    def clusters(self, x0, x1, ty0, ty1):
        """글자 줄 안의 글자 덩어리(낱말) [(x0, x1)]. 낱말 사이 띄어쓰기보다 넓은 빈자리로 나눈다."""
        th = ty1 - ty0
        cols = self.ink[ty0:ty1, x0:x1].any(axis=0)
        return [(x0 + a, x0 + b) for a, b in _runs(cols, gap=int(th * 0.8))]


def _date_parts(pg, x0, x1, ty0, ty1, page):
    """'년 월 일' 글자 앞 빈자리 세 곳. 마지막 세 덩어리가 한 글자 크기이고 사이가 넉넉해야 한다."""
    th = ty1 - ty0
    every = pg.clusters(x0, x1, ty0, ty1)
    cl = [c for c in every if c[1] - c[0] <= th * 1.6]
    if len(cl) < 3:
        return None
    # 년 자리 왼쪽 끝: '년' 앞 글자 덩어리(있으면) 뒤까지만
    before = [c for c in every if c[1] <= cl[-3][0]]
    left_limit = before[-1][1] + th * 0.5 if before else x0
    (y_a, y_b), (m_a, m_b), (d_a, _) = cl[-3][:2], cl[-2][:2], cl[-1][:2]
    gap_m, gap_d = m_a - y_b, d_a - m_b
    if gap_m < th * 1.5 or gap_d < th * 1.5:
        return None
    pad = th * 0.25
    year_w = max(gap_m, th * 4.5)  # 네 자리 숫자가 들어가게
    top, bottom = ty0 - th * 0.35, ty1 + th * 0.35
    parts = {
        "year": (max(y_a - year_w, left_limit), y_a - pad),
        "month": (y_b + pad, m_a - pad),
        "day": (m_b + pad, d_a - pad),
    }
    return {
        k: _ratio(a, top, b, bottom, pg.w, pg.h, page) for k, (a, b) in parts.items()
    }


def _underline(pg, x0, x1, ty0, ty1):
    """글자 줄 바닥 근처의 밑줄 구간 (a, b, 선 높이) 중 가장 긴 것.

    '____'는 글자마다 끊긴 짧은 선이라 긴 선 마스크(horiz)에 안 잡힌다. 줄마다 짧은 틈은 이어 붙여 보고,
    선 바로 위가 비어 있는 것(글자 획이 아닌 것)만 밑줄로 본다.
    """
    th = ty1 - ty0
    y_a, y_b = int(ty0 + th * 0.5), min(int(ty1 + th * 0.8), pg.h - 1)
    gap = max(3, int(th * 0.3))
    best = None
    for y in range(max(y_a, 3), y_b):
        for a, b in _runs(pg.dark[y, x0:x1], gap=gap):
            if b - a < pg.w * 0.05:
                continue
            a, b = x0 + a, x0 + b
            is_line = (
                pg.dark[y, a:b].mean() >= 0.55 and pg.dark[y - 3, a:b].mean() < 0.25
            )
            if is_line and (best is None or b - a > best[1] - best[0]):
                best = (a, b, y)
    return best


def find_spot(pg, field):
    """칸 하나의 적는 자리 → {"input_bbox", "option_bboxes", "part_bboxes"} (못 찾은 것은 None)."""
    bbox, code = field["bbox"], field.get("format_code")
    page = bbox.get("page", 1)
    spot = {"input_bbox": None, "option_bboxes": None, "part_bboxes": None}
    w, h = pg.w, pg.h

    if code == "choice":
        band = pg.band(bbox)
        if band:
            x0, x1, ty0, ty1 = band
            th = ty1 - ty0
            boxes = _checkboxes(pg.dark, x0, max(int(ty0 - th), 0), x1, int(ty1 + th))
            n_opt = len(field.get("options") or [])
            if boxes and (n_opt == 0 or len(boxes) == n_opt):
                spot["option_bboxes"] = [
                    _ratio(a - 2, b - 2, c + 2, d + 2, w, h, page)
                    for a, b, c, d in boxes
                ]
                return spot

    # 표 안 칸이면 값 칸. 표 안 날짜('    년  월  일' 칸)는 그 칸 안에서 년·월·일 자리도 찾는다
    if code != "signature":
        cell = value_cell(pg.gray, bbox, pg.horiz, pg.vert)
        if cell:
            spot["input_bbox"] = cell
            if code == "date":
                cx0, cx1 = int(cell["x"] * w), int((cell["x"] + cell["w"]) * w)
                cy0, cy1 = int(cell["y"] * h), int((cell["y"] + cell["h"]) * h)
                lines = _runs(pg.ink[cy0:cy1, cx0:cx1].any(axis=1), gap=1)
                if lines:
                    a, b = max(lines, key=lambda r: r[1] - r[0])
                    spot["part_bboxes"] = _date_parts(
                        pg, cx0, cx1, cy0 + a, cy0 + b, page
                    )
            return spot

    band = pg.band(bbox)
    if not band:
        return spot
    x0, x1, ty0, ty1 = band
    th = ty1 - ty0

    if code == "signature":
        # 줄 맨 오른쪽 덩어리가 '(인)'·'(서명 또는 인)' 표시. 그 자리에 서명·도장을 한다
        cl = pg.clusters(x0, x1, ty0, ty1)
        if cl:
            a, b = cl[-1]
            cx, size = (a + b) / 2, max(b - a + th, th * 2.4)
            spot["input_bbox"] = _ratio(
                cx - size / 2, ty0 - th * 0.7, cx + size / 2, ty1 + th * 0.7, w, h, page
            )
        return spot

    if code == "date":
        # 년 앞 빈자리는 L1 bbox보다 왼쪽에 있다 (OCR이 '년 월 일' 글자만 줄로 잡음) → 왼쪽을 넓게 본다
        wide = pg.band(bbox, pad_left=0.12)
        parts = _date_parts(pg, *(wide or band), page)
        if parts:
            spot["part_bboxes"] = parts
            ys = parts["year"]
            right = parts["day"]["x"] + parts["day"]["w"]
            spot["input_bbox"] = {**ys, "w": round(right - ys["x"], 4)}
            return spot

    line = _underline(pg, x0, x1, ty0, ty1)
    if line:
        a, b, ly = line
        spot["input_bbox"] = _ratio(a, ly - th * 1.6, b, ly - 1, w, h, page)
        return spot

    # 밑줄도 없으면 라벨 뒤 넓은 빈자리 ('성명:            ')
    cl = pg.clusters(x0, x1, ty0, ty1)
    right_edge = int(w * 0.92)
    gaps = [(cl[i][1], cl[i + 1][0]) for i in range(len(cl) - 1)]
    if cl:
        gaps.append((cl[-1][1], right_edge))
    gaps = [(a, b) for a, b in gaps if b - a >= th * 6]
    if gaps:
        a, b = gaps[0]
        spot["input_bbox"] = _ratio(
            a + th * 0.5, ty0 - th * 0.3, b - th * 0.5, ty1 + th * 0.3, w, h, page
        )
    return spot


def writing_spots(file_path, mime_type, fields):
    """여러 칸의 적는 자리를 한 번에 (페이지마다 선·글자는 한 번만 본다). 실패하면 그 칸만 빈 값."""
    empty = {"input_bbox": None, "option_bboxes": None, "part_bboxes": None}
    out = [dict(empty) for _ in fields]
    by_page = {}
    for i, f in enumerate(fields):
        by_page.setdefault(f["bbox"].get("page", 1), []).append(i)
    for page, indexes in by_page.items():
        try:
            pg = _Page(page_gray(file_path, mime_type, page))
        except Exception as exc:  # noqa: BLE001 — 원본을 못 읽으면 화면이 bbox로 어림한다
            # 문서 내용은 남기지 않고 오류 종류만
            logger.warning("적는 자리 찾기 실패(%s쪽): %s", page, type(exc).__name__)
            continue
        for i in indexes:
            try:
                out[i] = find_spot(pg, fields[i])
            except Exception as exc:  # noqa: BLE001 — 한 칸 실패로 화면 전체를 막지 않는다
                logger.warning("적는 자리 찾기 실패(칸 %s): %s", i, type(exc).__name__)
    return out


def value_cells(file_path, mime_type, bboxes):
    """여러 bbox의 값 칸을 한 번에 (페이지마다 선은 한 번만 찾는다). 실패하면 그 칸만 None."""
    out = [None] * len(bboxes)
    by_page = {}
    for i, b in enumerate(bboxes):
        by_page.setdefault(b.get("page", 1), []).append(i)
    for page, indexes in by_page.items():
        try:
            gray = page_gray(file_path, mime_type, page)
            horiz, vert = _line_masks(gray)
        except Exception as exc:  # noqa: BLE001 — 원본을 못 읽으면 화면이 bbox로 어림한다
            # 문서 내용은 남기지 않고 오류 종류만
            logger.warning("값 칸 찾기 실패(%s쪽): %s", page, type(exc).__name__)
            continue
        for i in indexes:
            out[i] = value_cell(gray, bboxes[i], horiz, vert)
    return out
