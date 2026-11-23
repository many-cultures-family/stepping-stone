# 표 선으로 라벨 오른쪽 '값 칸' 찾기 (layout.py). 가짜 표를 그려서 확인한다
import numpy as np
import pytest

from app import layout

W, H = 1000, 1400


def blank():
    return np.full((H, W), 255, np.uint8)


def table(img, top=200, rows=3, row_h=60, x0=100, divider=300, x1=900):
    """라벨 열 | 값 열 표를 그린다. 각 행 라벨 bbox(0~1)를 돌려준다"""
    for r in range(rows + 1):
        img[top + r * row_h : top + r * row_h + 2, x0:x1] = 0
    for x in (x0, divider, x1):
        img[top : top + rows * row_h, x : x + 2] = 0
    labels = []
    for r in range(rows):
        y = top + r * row_h + 20
        img[y : y + 20, x0 + 20 : x0 + 80] = 0  # 라벨 글자 자리
        labels.append(
            {"page": 1, "x": (x0 + 20) / W, "y": y / H, "w": 60 / W, "h": 20 / H}
        )
    return labels


def test_value_cell_is_right_column():
    img = blank()
    labels = table(img)

    cell = layout.value_cell(img, labels[1])

    assert cell is not None
    # 값 칸은 가운데 세로선(300) 오른쪽, 바깥 선(900) 안쪽, 두 번째 행(260~320) 안
    assert 0.30 < cell["x"] < 0.32
    assert 0.88 < cell["x"] + cell["w"] < 0.90
    assert 260 / H < cell["y"] < (260 + 60) / H
    assert cell["y"] + cell["h"] < 320 / H


def test_label_and_value_in_one_cell():
    """세로 구분선이 없으면 라벨 오른쪽부터 바깥 선까지가 값 자리"""
    img = blank()
    for y in (200, 260):
        img[y : y + 2, 100:900] = 0
    for x in (100, 900):
        img[200:260, x : x + 2] = 0
    label = {"page": 1, "x": 120 / W, "y": 220 / H, "w": 60 / W, "h": 20 / H}

    cell = layout.value_cell(img, label)

    assert cell is not None
    assert 0.18 < cell["x"] < 0.20
    assert 0.88 < cell["x"] + cell["w"] < 0.90


def test_outside_table_is_none():
    img = blank()
    table(img)
    date_line = {"page": 1, "x": 0.45, "y": 0.6, "w": 0.24, "h": 0.02}
    assert layout.value_cell(img, date_line) is None


@pytest.mark.parametrize("bad", [{"page": 1, "x": 0.5, "y": 0.5, "w": 0, "h": 0.02}])
def test_degenerate_bbox_is_none(bad):
    assert layout.value_cell(blank(), bad) is None


# ── 표 밖 '적는 자리' (writing_spots / find_spot) ──


def text(img, x, y, w, h=20):
    """글자 자리(검은 덩어리). bbox(0~1)를 돌려준다"""
    img[y : y + h, x : x + w] = 0
    return {"page": 1, "x": x / W, "y": y / H, "w": w / W, "h": h / H}


def box(img, x, y, s=16):
    """빈 네모 상자 □"""
    img[y : y + s, x : x + 2] = 0
    img[y : y + s, x + s - 2 : x + s] = 0
    img[y : y + 2, x : x + s] = 0
    img[y + s - 2 : y + s, x : x + s] = 0


def spot(img, field):
    return layout.find_spot(layout._Page(img), field)


def test_choice_finds_checkboxes_in_option_order():
    img = blank()
    text(img, 300, 500, 80)  # 동의합니다
    box(img, 390, 502)
    text(img, 500, 500, 120)  # 동의하지 않습니다
    box(img, 630, 502)
    row = {"page": 1, "x": 300 / W, "y": 500 / H, "w": 350 / W, "h": 20 / H}
    s = spot(
        img,
        {
            "format_code": "choice",
            "options": ["동의합니다", "동의하지 않습니다"],
            "bbox": row,
        },
    )
    xs = [b["x"] for b in s["option_bboxes"]]
    assert len(xs) == 2 and xs[0] == pytest.approx(388 / W, abs=0.004)
    assert xs[1] == pytest.approx(628 / W, abs=0.004)


def test_choice_ignores_filled_squares_and_count_mismatch():
    img = blank()
    text(img, 300, 500, 80)
    img[502:518, 390:406] = 0  # 꽉 찬 네모는 상자가 아니다
    row = {"page": 1, "x": 300 / W, "y": 500 / H, "w": 200 / W, "h": 20 / H}
    s = spot(img, {"format_code": "choice", "options": ["예", "아니오"], "bbox": row})
    assert s["option_bboxes"] is None


def test_date_line_parts_are_gaps_before_year_month_day():
    img = blank()
    for x in (460, 540, 620):  # 년 월 일
        text(img, x, 800, 20)
    row = {"page": 1, "x": 460 / W, "y": 800 / H, "w": 180 / W, "h": 20 / H}
    s = spot(img, {"format_code": "date", "bbox": row})
    p = s["part_bboxes"]
    assert p["year"]["x"] + p["year"]["w"] <= 460 / W
    assert p["month"]["x"] >= 480 / W and p["month"]["x"] + p["month"]["w"] <= 540 / W
    assert p["day"]["x"] >= 560 / W and p["day"]["x"] + p["day"]["w"] <= 620 / W


def test_underline_name_and_sign_mark():
    img = blank()
    text(img, 300, 900, 100)  # 작성자 성명:
    for x in range(420, 600, 10):  # ____ (글자마다 끊긴 밑줄)
        img[918:920, x : x + 8] = 0
    text(img, 630, 900, 30)  # (인)
    row = {"page": 1, "x": 300 / W, "y": 900 / H, "w": 360 / W, "h": 20 / H}
    name = spot(img, {"format_code": "name", "bbox": row})["input_bbox"]
    assert name["x"] == pytest.approx(420 / W, abs=0.003)
    assert name["x"] + name["w"] == pytest.approx(598 / W, abs=0.003)
    assert name["y"] + name["h"] <= 918 / H
    sign = spot(img, {"format_code": "signature", "bbox": row})["input_bbox"]
    assert sign["x"] < 645 / W < sign["x"] + sign["w"]


def test_writing_spots_missing_file_gives_empty(tmp_path):
    out = layout.writing_spots(
        str(tmp_path / "x.png"),
        "image/png",
        [
            {
                "format_code": "name",
                "bbox": {"page": 1, "x": 0.1, "y": 0.1, "w": 0.1, "h": 0.02},
            }
        ],
    )
    assert out == [{"input_bbox": None, "option_bboxes": None, "part_bboxes": None}]
